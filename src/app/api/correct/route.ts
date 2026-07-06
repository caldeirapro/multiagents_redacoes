import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

// Failover Manager: Tries models in sequence based on quota limits
async function generateContentWithFailover(
  ai: any,
  params: {
    contents: any;
    config?: any;
  }
) {
  // Quota Priority list of compatible models the user has available and free
  // 1. gemini-3.5-flash (5 RPM / 20 RPD)
  // 2. gemini-3.1-flash-lite (15 RPM / 500 RPD)
  // 3. gemini-3-flash (5 RPM / 20 RPD)
  // 4. gemini-2.5-flash (5 RPM / 20 RPD)
  // 5. gemini-2.5-flash-lite (10 RPM / 20 RPD)
  const modelChain = [
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
    "gemini-3-flash",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
  ];
  
  let lastError = null;

  for (const model of modelChain) {
    try {
      console.log(`[Chain-of-Models] Tentando executar com o modelo: ${model}`);
      
      // Configura um timeout de 12 segundos para a requisição de rede do SDK
      const response = await ai.models.generateContent({
        model: model,
        contents: params.contents,
        config: {
          ...params.config,
          httpOptions: {
            ...params.config?.httpOptions,
            timeout: 12000, // 12 segundos
          }
        },
      });
      
      // Return both the response and the model name that succeeded
      return { response, usedModel: model };
    } catch (error: any) {
      lastError = error;
      
      // Check for invalid API key immediately to fail early
      const errorStr = typeof error === 'object' ? JSON.stringify(error) : String(error);
      const isApiKeyInvalid =
        error.status === 400 ||
        error.message?.includes("API key not valid") ||
        error.message?.includes("API_KEY_INVALID") ||
        errorStr.includes("API_KEY_INVALID") ||
        errorStr.includes("API key not valid");

      if (isApiKeyInvalid) {
        throw new Error("Chave de API do Gemini inválida. Acesse as configurações (ícone de engrenagem no topo direito) e insira uma chave de API válida (geralmente começando com 'AIzaSy').");
      }

      const isTransientError =
        error.status === 429 ||
        error.status === 503 ||
        error.status === 500 ||
        error.status === 408 || // Request Timeout
        error.message?.includes("429") ||
        error.message?.includes("503") ||
        error.message?.includes("500") ||
        error.message?.includes("408") ||
        error.message?.includes("timeout") ||
        error.message?.includes("Timeout") ||
        error.message?.includes("deadline") ||
        error.message?.includes("Quota") ||
        error.message?.includes("Resource has been exhausted") ||
        error.message?.includes("rate limit") ||
        error.message?.includes("high demand") ||
        error.message?.includes("temporary") ||
        error.message?.includes("UNAVAILABLE") ||
        error.message?.includes("overloaded") ||
        errorStr.includes("UNAVAILABLE") ||
        errorStr.includes("high demand") ||
        errorStr.includes("temporary") ||
        errorStr.includes("timeout") ||
        errorStr.includes("deadline");

      if (isTransientError) {
        console.warn(`[Failover] Erro temporário, timeout ou sobrecarga (${error.status || '503'}) no modelo ${model}. Acionando próximo da cadeia...`);
        continue; // Try next model in loop
      }
      
      // If it's a structural or prompt validation error, fail immediately to prevent infinite loops
      throw error;
    }
  }

  // If we exhausted all options, throw the last error
  throw lastError || new Error("Todos os modelos na cadeia de failover falharam.");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { image, theme, topics, apiKey: clientApiKey } = body;

    // 1. Resolve API Key
    const apiKey = clientApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "Chave de API do Gemini não configurada. Insira sua própria chave nas configurações da interface para continuar.",
        },
        { status: 400 }
      );
    }

    if (!image) {
      return NextResponse.json(
        { error: "A imagem da redação é obrigatória." },
        { status: 400 }
      );
    }

    // Initialize Gemini Client
    const ai = new GoogleGenAI({ apiKey });

    // Extract MIME type and base64 string
    let mimeType = "image/jpeg";
    let base64Data = image;

    if (image.startsWith("data:")) {
      const match = image.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        base64Data = match[2];
      }
    }

    // --- AGENTE 1: OCR TRANSCRIPTION ---
    let transcript = "";
    let ocrModelUsed = "";
    try {
      const { response, usedModel } = await generateContentWithFailover(ai, {
        contents: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType,
            },
          },
          "Transcreva o texto manuscrito presente na imagem de acordo com suas diretrizes.",
        ],
        config: {
          systemInstruction: `Você é o Agente OCR Transcritor. Sua única função é transcrever de forma idêntica e sem correções o texto manuscrito presente na imagem da redação fornecida.

Regras de Operação:
1. Transcreva o texto exatamente como escrito pelo candidato. NÃO corrija erros de ortografia, acentuação, pontuação ou concordância (o Agente Gramatical precisa ver esses erros).
2. Preserve a divisão de parágrafos. Use duas quebras de linha (\\n\\n) para separar cada parágrafo identificado.
3. Se alguma palavra ou trecho for completamente ilegível devido à caligrafia, transcreva-a como "[ilegível]".
4. Se o candidato tiver riscado alguma palavra (rasura), transcreva como "[rasura: palavra_riscada]" ou apenas "[rasura]" caso não seja legível.
5. Retorne apenas e exclusivamente a transcrição limpa do texto, sem introduções, cumprimentos ou notas explicativas.`,
        },
      });
      transcript = response.text || "";
      ocrModelUsed = usedModel;
    } catch (e: any) {
      console.error("Erro no Agente 1 (OCR):", e);
      return NextResponse.json(
        { error: `Falha no Agente 1 (OCR) após tentar toda a cadeia de failover: ${e.message || e}` },
        { status: 500 }
      );
    }

    if (!transcript.trim()) {
      return NextResponse.json(
        { error: "O Agente 1 (OCR) não conseguiu extrair nenhum texto legível da imagem fornecida." },
        { status: 400 }
      );
    }

    // --- AGENTE 2 (GRAMÁTICA) & AGENTE 3 (ESTRUTURA) RUN IN PARALLEL WITH FAILOVER ---
    const agent2Promise = generateContentWithFailover(ai, {
      contents: `Analise o seguinte texto transcrito para identificar desvios gramaticais de microestrutura:
---
${transcript}
---`,
      config: {
        systemInstruction: `Você é o Agente Analista Gramatical, um professor especialista em filologia e correção gramatical de redações de concursos públicos (critérios de Microestrutura das bancas Cebraspe, FGV e FCC).

Sua tarefa é analisar o texto transcrito fornecido e identificar todos os desvios gramaticais.

Analise os seguintes aspectos:
- Ortografia e Acentuação
- Morfossintaxe (Concordância nominal/verbal, Regência nominal/verbal, Colocação pronominal, Crase)
- Pontuação
- Propriedade Vocabular (uso inadequado de palavras)

Para cada erro identificado, você deve mapear:
1. O texto original incorreto.
2. A correção sugerida.
3. A regra gramatical violada e uma breve explicação educativa.
4. O número do parágrafo onde o erro ocorreu (base 1).

Ao final da sua análise, emita um relatório textual detalhado sob o título "RELATÓRIO GRAMATICAL".`,
      },
    });

    const topicsText = Array.isArray(topics)
      ? topics.map((t, i) => `${i + 1}. ${t}`).join("\n")
      : topics || "Nenhum tópico fornecido";

    const agent3Promise = generateContentWithFailover(ai, {
      contents: `Avalie a macroestrutura deste texto com base no tema e tópicos obrigatórios:

Tema da Redação: ${theme || "Não especificado"}

Tópicos Obrigatórios:
${topicsText}

Texto Transcrito:
---
${transcript}
---`,
      config: {
        systemInstruction: `Você é o Agente Analista Temático e Estrutural. Sua especialidade é avaliar a Macroestrutura de redações de concursos públicos, focando em:
1. Apresentação e Legibilidade (respeito às margens, parágrafos e caligrafia).
2. Estrutura Textual (Introdução coerente, Desenvolvimento consistente e Conclusão lógica).
3. Desenvolvimento do Tema (se o candidato tangenciou ou aprofundou o assunto proposto).
4. Abordagem dos Tópicos Obrigatórios (se respondeu de forma satisfatória aos subitens exigidos pela banca).

Sua tarefa:
Leia o texto transcrito da redação, o tema proposto e os tópicos obrigatórios exigidos.
Avalie o desempenho do candidato em cada um desses 4 aspectos e emita uma análise descritiva rica, apontando onde o candidato acertou na argumentação e onde faltou fundamentação teórica.

Emita sua análise textual sob o título "RELATÓRIO ESTRUTURAL E TEMÁTICO".`,
      },
    });

    let grammarReport = "";
    let structuralReport = "";
    let grammarModelUsed = "";
    let structuralModelUsed = "";

    try {
      const [grammarRes, structuralRes] = await Promise.all([
        agent2Promise,
        agent3Promise,
      ]);
      
      grammarReport = grammarRes.response.text || "";
      grammarModelUsed = grammarRes.usedModel;
      
      structuralReport = structuralRes.response.text || "";
      structuralModelUsed = structuralRes.usedModel;
    } catch (e: any) {
      console.error("Erro nos Agentes paralelos 2 e 3:", e);
      return NextResponse.json(
        { error: `Falha na execução paralela dos Agentes 2 e 3 após failover: ${e.message || e}` },
        { status: 500 }
      );
    }

    // --- AGENTE 4: CONSOLIDATOR AND FORMATTER (JSON) ---
    let consolidatedData = null;
    let consolidatorModelUsed = "";
    try {
      const consolidatorPrompt = `Você recebeu os relatórios dos agentes especialistas anteriores.
      
Texto Transcrito (Agente 1):
---
${transcript}
---

Relatório Gramatical (Agente 2):
---
${grammarReport}
---

Relatório Estrutural e Temático (Agente 3):
---
${structuralReport}
---

Calcule a nota final usando a fórmula Cebraspe e formate o resultado estritamente em JSON de acordo com o schema.`;

      const { response, usedModel } = await generateContentWithFailover(ai, {
        contents: consolidatorPrompt,
        config: {
          systemInstruction: `Você é o Agente Consolidador de Notas. Sua função é receber os relatórios gerados pelos agentes especialistas anteriores, calcular a nota final do candidato e formatar a saída em um JSON estruturado e válido.

Instruções para o Cálculo da Nota:
1. Conte o número total de palavras da transcrição.
2. Extraia a quantidade de erros gramaticais apontados pelo Agente Gramatical.
3. Calcule a Nota de Conteúdo (NC) avaliada pelo Agente Temático (escala de 0 a 20 pontos).
4. Aplique a fórmula oficial de cálculo (padrão Cebraspe):
   Fórmula: Nota Final = NC - (6 * (Número de Erros / Total de Palavras))
   (Nota Final mínima é 0).

Você deve produzir estritamente um arquivo JSON que siga a estrutura especificada. A nota final deve ser calculada estritamente seguindo a fórmula. A nota de conteúdo deve ser um número real entre 0 e 20 baseado no Relatório Temático.`,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT" as any,
            properties: {
              totalPalavras: { type: "INTEGER" as any },
              totalErrosGramaticais: { type: "INTEGER" as any },
              notaConteudo: { type: "NUMBER" as any },
              notaFinal: { type: "NUMBER" as any },
              analiseGeral: { type: "STRING" as any },
              errosGramaticais: {
                type: "ARRAY" as any,
                items: {
                  type: "OBJECT" as any,
                  properties: {
                    paragrafo: { type: "INTEGER" as any },
                    trechoIncorreto: { type: "STRING" as any },
                    correcao: { type: "STRING" as any },
                    explicacao: { type: "STRING" as any },
                  },
                  required: [
                    "paragrafo",
                    "trechoIncorreto",
                    "correcao",
                    "explicacao",
                  ],
                },
              },
              analiseEstrutural: {
                type: "OBJECT" as any,
                properties: {
                  introducao: { type: "STRING" as any },
                  desenvolvimento: { type: "STRING" as any },
                  conclusao: { type: "STRING" as any },
                },
                required: ["introducao", "desenvolvimento", "conclusao"],
              },
              desempenhoTopicos: { type: "STRING" as any },
            },
            required: [
              "totalPalavras",
              "totalErrosGramaticais",
              "notaConteudo",
              "notaFinal",
              "analiseGeral",
              "errosGramaticais",
              "analiseEstrutural",
              "desempenhoTopicos",
            ],
          },
        },
      });

      const responseText = response.text || "{}";
      consolidatedData = JSON.parse(responseText);
      consolidatorModelUsed = usedModel;
    } catch (e: any) {
      console.error("Erro no Agente 4 (Consolidação):", e);
      return NextResponse.json(
        { error: `Falha no Agente 4 (Consolidador) após failover: ${e.message || e}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      transcript,
      grammarReport,
      structuralReport,
      consolidated: consolidatedData,
      modelLogs: {
        ocrAgent: ocrModelUsed,
        grammarAgent: grammarModelUsed,
        structuralAgent: structuralModelUsed,
        consolidatorAgent: consolidatorModelUsed
      }
    });
  } catch (e: any) {
    console.error("Erro global no endpoint:", e);
    return NextResponse.json(
      { error: `Erro interno no servidor: ${e.message || e}` },
      { status: 500 }
    );
  }
}
