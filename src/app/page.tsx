"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Plus,
  Trash2,
  Settings,
  HelpCircle,
  Activity,
  ChevronRight,
  Info,
  Download,
  RefreshCw,
  Award,
  BookOpen,
  Check,
} from "lucide-react";

// Types
interface GrammarError {
  paragrafo: number;
  trechoIncorreto: string;
  correcao: string;
  explicacao: string;
}

interface StructuralAnalysis {
  introducao: string;
  desenvolvimento: string;
  conclusao: string;
}

interface ConsolidatedResult {
  totalPalavras: number;
  totalErrosGramaticais: number;
  notaConteudo: number;
  notaFinal: number;
  analiseGeral: string;
  errosGramaticais: GrammarError[];
  analiseEstrutural: StructuralAnalysis;
  desempenhoTopicos: string;
}

interface APIResponse {
  transcript: string;
  grammarReport: string;
  structuralReport: string;
  consolidated: ConsolidatedResult;
  modelLogs?: {
    ocrAgent: string;
    grammarAgent: string;
    structuralAgent: string;
    consolidatorAgent: string;
  };
}

interface TopicInput {
  description: string;
  maxScore: string;
}

// Preset Data
const SAMPLE_PRESET = {
  theme: "O papel da tecnologia na segurança pública do século XXI: desafios e possibilidades",
  topics: [
    {
      description: "O uso de inteligência artificial e análise de dados no combate ao crime organizado",
      maxScore: "6,00",
    },
    {
      description: "Mecanismos de controle e garantia dos direitos fundamentais frente à vigilância tecnológica",
      maxScore: "7,00",
    },
    {
      description: "Desafios de infraestrutura e capacitação das forças policiais para o uso de novas tecnologias",
      maxScore: "7,00",
    },
  ] as TopicInput[],
  text: `No século XXI, a inserção de novas tecnologias na segurança pública tem se mostrado indispensável. A utilização de inteligência artificial e de big data no combate a criminalidade permite que as forças policiais ajam de forma preventiva, antecipando-se aos delitos e desarticulando facções criminosas antes que as mesmas causem danos à sociedade.

Entretanto, o uso dessas ferramentas digitais devem respeitar os limites constitucionais. É preciso que haja mecanismos rigorosos de controle para garantir os direitos fundamentais, evitando que o monitoramento tecnológico vire um instrumento de vigilância excessiva e arbitrária sobre os cidadãos. Portanto, a privacidade precisa ser preservada sob quaisquer circunstâncias.

Por fim, existem grandes desafios relacionados a infraestrutura e a capacitação dos agentes. A maioria das delegacias não dispõem de computadores modernos, e muitos policiais não sabem operar softwares complexos de análise de dados. Sem investimento contínuo em treinamento, as inovações tecnológicas serão ineficazes.`,
};

export default function Home() {
  // Input States
  const [apiKey, setApiKey] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [theme, setTheme] = useState(SAMPLE_PRESET.theme);
  const [topics, setTopics] = useState<TopicInput[]>(SAMPLE_PRESET.topics);
  const [image, setImage] = useState<string | null>(null);
  const [isSampleUsed, setIsSampleUsed] = useState(false);

  // Correction Pipeline States
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0); // 0: Idle, 1: OCR, 2: Grammar & Theme, 3: Consolidation, 4: Finished
  const [result, setResult] = useState<APIResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // UI Navigation
  const [activeTab, setActiveTab] = useState("interactive");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load API key from localStorage on mount
  useEffect(() => {
    const savedKey = localStorage.getItem("gemini_api_key");
    if (savedKey) {
      setApiKey(savedKey);
    }
  }, []);

  // Save API key
  const handleSaveApiKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem("gemini_api_key", key);
  };

  // Helper: Draw lined paper with handwritten-style text on Canvas
  const generateSampleImage = () => {
    if (typeof window === "undefined") return;

    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 1100;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 1. Background - warm paper texture
    ctx.fillStyle = "#fcfaf2";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Left vertical margin line (red)
    ctx.strokeStyle = "#ff9999";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(90, 0);
    ctx.lineTo(90, canvas.height);
    ctx.stroke();

    // 3. Horizontal ruled lines (blue/grey)
    ctx.strokeStyle = "#e0dbcf";
    ctx.lineWidth = 1;
    const lineSpacing = 32;
    const topMargin = 90;
    const lineCount = Math.floor((canvas.height - topMargin) / lineSpacing);

    for (let i = 0; i < lineCount; i++) {
      const y = topMargin + i * lineSpacing;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // 4. Header metadata mock
    ctx.fillStyle = "#8f8876";
    ctx.font = "bold 11px Arial";
    ctx.fillText("FOLHA DE TEXTO DEFINITIVO - DISCURSIVA", 110, 40);
    ctx.font = "9px Arial";
    ctx.fillText("TEMA: SEGURANÇA PÚBLICA E TECNOLOGIA NO SÉCULO XXI", 110, 56);
    ctx.fillText("LEGENDA: TRANSCRITO VIA AGENTE 1 MULTIMODAL", 110, 70);

    // Border
    ctx.strokeStyle = "#dcd7ca";
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);

    // 5. Render Text (looks handwritten via Georgia/cursive fallback)
    ctx.fillStyle = "#1e293b"; // Ink color
    ctx.font = "italic 19px 'Georgia', serif"; // Fallback to serif/italic

    const paragraphs = SAMPLE_PRESET.text.split("\n\n");
    let currentLineIndex = 1;
    const maxLineChars = 68;

    paragraphs.forEach((para) => {
      let isFirstLine = true;
      const words = para.split(" ");
      let currentLineText = "";

      words.forEach((word) => {
        const testLine = currentLineText + (currentLineText ? " " : "") + word;
        // Simple wrap check
        if (testLine.length > (isFirstLine ? maxLineChars - 8 : maxLineChars)) {
          const x = isFirstLine ? 160 : 110; // indentation
          const y = topMargin + currentLineIndex * lineSpacing - 8;
          ctx.fillText(currentLineText, x, y);

          currentLineText = word;
          isFirstLine = false;
          currentLineIndex++;
        } else {
          currentLineText = testLine;
        }
      });

      if (currentLineText) {
        const x = isFirstLine ? 160 : 110;
        const y = topMargin + currentLineIndex * lineSpacing - 8;
        ctx.fillText(currentLineText, x, y);
        currentLineIndex++;
      }

      currentLineIndex++; // extra space between paragraphs
    });

    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    setImage(dataUrl);
    setIsSampleUsed(true);
  };

  // Upload handlers
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
        setIsSampleUsed(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
        setIsSampleUsed(false);
      };
      reader.readAsDataURL(file);
    }
  };

  // Topics management
  const handleTopicChange = (index: number, field: "description" | "maxScore", value: string) => {
    const newTopics = [...topics];
    newTopics[index] = { ...newTopics[index], [field]: value };
    setTopics(newTopics);
  };

  const addTopic = () => {
    setTopics([...topics, { description: "", maxScore: "" }]);
  };

  const removeTopic = (index: number) => {
    const newTopics = topics.filter((_, i) => i !== index);
    setTopics(newTopics);
  };

  // Execute Pipeline
  const runCorrection = async () => {
    if (!theme || !theme.trim()) {
      setError("Por favor, preencha o tema proposto da redação antes de prosseguir.");
      return;
    }

    const validTopics = topics.filter((t) => t.description.trim() !== "");
    if (validTopics.length === 0) {
      setError("Por favor, preencha pelo menos um tópico obrigatório para realizar a correção.");
      return;
    }

    if (!image) {
      setError("Por favor, selecione ou gere uma imagem de redação.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Step 1: OCR
      setCurrentStep(1);

      // Simulate a small delay for pipeline visualization readability
      await new Promise((r) => setTimeout(r, 1000));

      // Step 2 & 3: Parallel processing on Server, trigger API call
      setCurrentStep(2);

      const response = await fetch("/api/correct", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image,
          theme,
          topics: validTopics,
          apiKey: apiKey || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Ocorreu um erro inesperado.");
      }

      // Step 4: Consolidation (happened on server, we display progress state)
      setCurrentStep(3);
      await new Promise((r) => setTimeout(r, 1500));

      // Step 5: Completed
      setResult(data);
      setCurrentStep(4);
      setActiveTab("interactive");
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Falha na conexão com o servidor.");
      setCurrentStep(0);
    } finally {
      setLoading(false);
    }
  };

  // Helper to highlight errors in text
  const renderInteractiveText = (text: string, errors: GrammarError[]) => {
    const paragraphs = text.split("\n\n");
    return paragraphs.map((paraText, pIdx) => {
      const paragraphNumber = pIdx + 1;
      const paragraphErrors = errors.filter((e) => e.paragrafo === paragraphNumber);

      if (paragraphErrors.length === 0) {
        return (
          <p key={pIdx} className="essay-paragraph">
            {paraText}
          </p>
        );
      }

      // Sort errors by length descending to avoid replacing sub-words incorrectly
      const sortedErrors = [...paragraphErrors].sort(
        (a, b) => b.trechoIncorreto.length - a.trechoIncorreto.length
      );

      interface Token {
        text: string;
        isError: boolean;
        errorData?: GrammarError;
      }

      let tokens: Token[] = [{ text: paraText, isError: false }];

      sortedErrors.forEach((err) => {
        const target = err.trechoIncorreto;
        if (!target) return;

        const nextTokens: Token[] = [];
        tokens.forEach((token) => {
          if (token.isError) {
            nextTokens.push(token);
            return;
          }

          let index = token.text.indexOf(target);
          let currentText = token.text;

          while (index !== -1) {
            if (index > 0) {
              nextTokens.push({
                text: currentText.substring(0, index),
                isError: false,
              });
            }

            nextTokens.push({
              text: target,
              isError: true,
              errorData: err,
            });

            currentText = currentText.substring(index + target.length);
            index = currentText.indexOf(target);
          }

          if (currentText.length > 0) {
            nextTokens.push({ text: currentText, isError: false });
          }
        });
        tokens = nextTokens;
      });

      return (
        <p key={pIdx} className="essay-paragraph">
          {tokens.map((token, tIdx) => {
            if (token.isError && token.errorData) {
              return (
                <span key={tIdx} className="grammar-error-highlight">
                  {token.text}
                  <span className="error-tooltip">
                    <span className="tooltip-title">Desvio Gramatical</span>
                    <span className="tooltip-original">Original: "{token.text}"</span>
                    <span className="tooltip-correction">Sugestão: {token.errorData.correcao}</span>
                    <span className="tooltip-rule">Explicação: {token.errorData.explicacao}</span>
                  </span>
                </span>
              );
            }
            return <span key={tIdx}>{token.text}</span>;
          })}
        </p>
      );
    });
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="header-title-container">
          <h1 className="header-title">Corretor de Redações Multi-Agente</h1>
          <span className="header-subtitle">
            Sistema Inteligente de Correção de Redações para Concursos Públicos
          </span>
        </div>
        <div className="flex gap-2 items-center">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="btn-icon"
            title="Configurações da API Key"
            style={{ padding: "0.6rem" }}
          >
            <Settings size={20} />
          </button>
          <a
            href="https://caldeirapro.github.io/portfolio/"
            target="_blank"
            rel="noopener noreferrer"
            className="portfolio-badge"
            style={{ textDecoration: "none" }}
          >
            <Activity size={14} />
            <span>Daniel Nunes - Portfolio</span>
          </a>
        </div>
      </header>

      {/* Settings Panel */}
      {showSettings && (
        <div className="settings-drawer anim-fade">
          <div className="form-group">
            <label className="form-label">
              <span>Chave de API do Gemini (Google AI Studio)</span>
              <a
                href="https://aistudio.google.com/"
                target="_blank"
                rel="noreferrer"
                style={{ color: "var(--primary)", textTransform: "none", fontWeight: 500 }}
              >
                Obter Chave Grátis
              </a>
            </label>
            <input
              type="password"
              placeholder="AIzaSy..."
              className="input-field"
              value={apiKey}
              onChange={(e) => handleSaveApiKey(e.target.value)}
            />
            <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <span style={{ fontWeight: 600, color: "var(--text)" }}>Como obter sua chave gratuita (em 1 minuto):</span>
              <ol style={{ paddingLeft: "1.1rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                <li>Clique no link <strong>"Obter Chave Grátis"</strong> logo acima para abrir o painel.</li>
                <li>Entre com a sua conta pessoal do Google.</li>
                <li>Clique no botão azul <strong>"Create API key"</strong> (Criar chave de API) e copie o código gerado.</li>
                <li>Cole o código copiado no campo de texto acima. (A chave fica gravada apenas no seu navegador).</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Dashboard Content */}
      <div className="dashboard-grid">
        {/* Left Column: Configuration Form */}
        <section className="card">
          <h2 className="card-title">
            <BookOpen size={20} />
            <span>Dados da Prova Discursiva</span>
          </h2>

          <div className="presets-container">
            <span className="form-label">Demonstração</span>
            <button
              onClick={generateSampleImage}
              className={`preset-btn ${isSampleUsed ? "active" : ""}`}
            >
              <strong>Carregar Exemplo Prévio (Um clique)</strong>
              <div style={{ fontSize: "0.8rem", marginTop: "0.25rem" }}>
                Autofill de Tema, Tópicos e Redação de vestibular simulando desvios gramaticais comuns.
              </div>
            </button>
          </div>

          <div className="form-group">
            <label className="form-label">Tema Proposto pela Banca</label>
            <textarea
              className="input-field"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="Digite o tema oficial da redação..."
            />
          </div>

          <div className="form-group">
            <label className="form-label">
              <span>Tópicos Obrigatórios (Edital)</span>
              <button
                onClick={addTopic}
                className="btn-add-topic"
                style={{ padding: "2px 8px", border: "none" }}
              >
                <Plus size={14} /> Adicionar
              </button>
            </label>
            <div className="topics-list" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {topics.map((topic, index) => (
                <div key={index} className="topic-item" style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <input
                    type="text"
                    className="input-field"
                    style={{ flex: 1 }}
                    value={topic.description}
                    onChange={(e) => handleTopicChange(index, "description", e.target.value)}
                    placeholder={`Descrição do Tópico ${index + 1}...`}
                  />
                  <input
                    type="text"
                    className="input-field"
                    style={{ width: "95px", textAlign: "center" }}
                    value={topic.maxScore}
                    onChange={(e) => handleTopicChange(index, "maxScore", e.target.value)}
                    placeholder="Nota máx."
                  />
                  <button onClick={() => removeTopic(index)} className="btn-icon" title="Remover" style={{ flexShrink: 0 }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Folha de Redação Manuscrita</label>
            {!image ? (
              <div
                className="upload-container"
                onClick={triggerFileInput}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              >
                <div className="upload-icon">
                  <Upload size={24} />
                </div>
                <p className="upload-text">
                  Arraste a imagem ou <span>Clique para Enviar</span>
                </p>
                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  Suporta PNG, JPG, JPEG (tamanho máx. 5MB)
                </p>
              </div>
            ) : (
              <div className="image-preview-wrapper">
                <button
                  className="remove-image-btn"
                  onClick={() => {
                    setImage(null);
                    setIsSampleUsed(false);
                  }}
                  title="Remover Imagem"
                >
                  <Trash2 size={16} />
                </button>
                <img src={image} alt="Redação Manuscrita" className="preview-image" />
              </div>
            )}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              style={{ display: "none" }}
            />
          </div>

          {error && (
            <div
              style={{
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.2)",
                color: "var(--error)",
                padding: "1rem",
                borderRadius: "8px",
                fontSize: "0.85rem",
                display: "flex",
                gap: "0.5rem",
                alignItems: "flex-start",
              }}
            >
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: "2px" }} />
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={runCorrection}
            disabled={loading || !image}
            className="btn btn-full"
            style={{ height: "3.25rem" }}
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Processando Agentes...</span>
              </>
            ) : (
              <span>Corrigir com IA Multi-Agente</span>
            )}
          </button>
        </section>

        {/* Right Column: Dynamic Pipeline Status or Correction Output */}
        <section className="flex flex-col gap-6" style={{ minWidth: 0 }}>
          {/* Active processing states */}
          {loading && (
            <div className="card" style={{ gap: "1rem" }}>
              <h2 className="card-title">
                <Activity size={20} className="animate-pulse" />
                <span>Execução em Cadeia (Chain-of-Agents)</span>
              </h2>
              <div className="pipeline-container">
                <div className={`agent-step ${currentStep >= 1 ? (currentStep > 1 ? "completed" : "active") : ""}`}>
                  <div className="agent-step-icon">
                    {currentStep > 1 ? <Check size={18} /> : <span>1</span>}
                  </div>
                  <div className="agent-step-content">
                    <div className="agent-step-title">
                      <span>Agente OCR Transcritor</span>
                      <span className="agent-step-status">
                        {currentStep === 1 ? "Executando" : currentStep > 1 ? "Concluído" : "Fila"}
                      </span>
                    </div>
                    <span className="agent-step-desc">
                      Modelo: <code>gemini-3.5-flash</code> (principal). Analisa o arquivo de imagem e extrai a
                      transcrição exata da caligrafia mantendo os desvios.
                    </span>
                  </div>
                </div>

                <div className={`agent-step ${currentStep >= 2 ? (currentStep > 2 ? "completed" : "active") : ""}`}>
                  <div className="agent-step-icon">
                    {currentStep > 2 ? <Check size={18} /> : <span>2</span>}
                  </div>
                  <div className="agent-step-content">
                    <div className="agent-step-title">
                      <span>Agente Gramatical & Temático (Paralelo)</span>
                      <span className="agent-step-status">
                        {currentStep === 2 ? "Executando" : currentStep > 2 ? "Concluído" : "Fila"}
                      </span>
                    </div>
                    <span className="agent-step-desc">
                      Modelos: <code>gemini-3.5-flash</code> (principais). Dois agentes paralelos mapeiam erros
                      gramaticais (microestrutura) e analisam a qualidade do conteúdo (macroestrutura).
                    </span>
                  </div>
                </div>

                <div className={`agent-step ${currentStep >= 3 ? (currentStep > 3 ? "completed" : "active") : ""}`}>
                  <div className="agent-step-icon">
                    {currentStep > 3 ? <Check size={18} /> : <span>3</span>}
                  </div>
                  <div className="agent-step-content">
                    <div className="agent-step-title">
                      <span>Agente Consolidador de Notas</span>
                      <span className="agent-step-status">
                        {currentStep === 3 ? "Executando" : currentStep > 3 ? "Concluído" : "Fila"}
                      </span>
                    </div>
                    <span className="agent-step-desc">
                      Modelo: <code>gemini-3.5-flash</code> (principal - Saída JSON). Recebe todos os relatórios
                      anteriores, calcula a nota Cebraspe final e estrutura o JSON.
                    </span>
                  </div>
                </div>
              </div>
              <div className="linear-progress">
                <div className="linear-progress-bar animate"></div>
              </div>
            </div>
          )}

          {/* Result view */}
          {result && !loading && (
            <div className="flex flex-col gap-6 anim-fade">
              {/* Score Display Card */}
              <div className="card" style={{ padding: "2rem" }}>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "2rem",
                    justifyContent: "space-between",
                  }}
                >
                  {/* Visual gauge */}
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "2rem",
                      justifyContent: "center",
                      alignItems: "center",
                      width: "100%",
                    }}
                  >
                    <div className="score-circle-wrapper">
                      <div className="score-circle">
                        <svg className="score-circle-svg">
                          <circle className="score-circle-bg" cx="70" cy="70" r="60" />
                          <circle
                            className="score-circle-progress"
                            cx="70"
                            cy="70"
                            r="60"
                            style={{
                              strokeDashoffset:
                                377 -
                                (377 * Math.max(0, Math.min(20, result.consolidated.notaFinal))) /
                                  20,
                            }}
                          />
                        </svg>
                        <div className="score-circle-content">
                          <span className="score-value">
                            {result.consolidated.notaFinal.toFixed(2)}
                          </span>
                          <span className="score-label">Nota Final</span>
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: "0.8rem",
                          background: "rgba(16, 185, 129, 0.1)",
                          color: "var(--success)",
                          padding: "0.2rem 0.6rem",
                          borderRadius: "4px",
                          fontWeight: 600,
                        }}
                      >
                        Máximo: 20,00 pts
                      </span>
                    </div>

                    <div style={{ flex: 1, minWidth: "250px", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      <h3 style={{ fontSize: "1.5rem", fontWeight: 700 }}>
                        Relatório Consolidado
                      </h3>
                      <p style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>
                        {result.consolidated.analiseGeral}
                      </p>
                    </div>
                  </div>

                  {/* Statistics grids */}
                  <div className="stats-grid" style={{ width: "100%" }}>
                    <div className="stat-card primary">
                      <span className="stat-label">Total de Palavras</span>
                      <span className="stat-value">{result.consolidated.totalPalavras}</span>
                    </div>
                    <div className="stat-card error">
                      <span className="stat-label">Erros Gramaticais</span>
                      <span className="stat-value">
                        {result.consolidated.totalErrosGramaticais}
                      </span>
                    </div>
                    <div className="stat-card warning">
                      <span className="stat-label">Nota Conteúdo (NC)</span>
                      <span className="stat-value">
                        {result.consolidated.notaConteudo.toFixed(2)}
                      </span>
                    </div>
                    <div className="stat-card success">
                      <span className="stat-label">Penalização Cebraspe</span>
                      <span className="stat-value" style={{ color: "var(--error)" }}>
                        -
                        {(
                          (6 * result.consolidated.totalErrosGramaticais) /
                          Math.max(1, result.consolidated.totalPalavras)
                        ).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* Model Logs Summary */}
                {result.modelLogs && (
                  <div
                    style={{
                      width: "100%",
                      padding: "0.75rem 1rem",
                      background: "rgba(255, 255, 255, 0.02)",
                      border: "1px solid rgba(255, 255, 255, 0.05)",
                      borderRadius: "8px",
                      fontSize: "0.8rem",
                      color: "var(--text-muted)",
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "1rem",
                      justifyContent: "space-between",
                      marginTop: "1.5rem"
                    }}
                  >
                    <span>🤖 <strong>Modelos de Inteligência Artificial Utilizados:</strong></span>
                    <span>OCR: <code>{result.modelLogs.ocrAgent}</code></span>
                    <span>Gramática: <code>{result.modelLogs.grammarAgent}</code></span>
                    <span>Estrutura: <code>{result.modelLogs.structuralAgent}</code></span>
                    <span>Consolidador: <code>{result.modelLogs.consolidatorAgent}</code></span>
                  </div>
                )}
              </div>

              {/* Tabs detail section */}
              <div className="tabs-container">
                <nav className="tabs-nav">
                  <button
                    onClick={() => setActiveTab("interactive")}
                    className={`tab-btn ${activeTab === "interactive" ? "active" : ""}`}
                  >
                    Texto & Correção Visual
                  </button>
                  <button
                    onClick={() => setActiveTab("grammar")}
                    className={`tab-btn ${activeTab === "grammar" ? "active" : ""}`}
                  >
                    Desvios (Microestrutura)
                  </button>
                  <button
                    onClick={() => setActiveTab("structure")}
                    className={`tab-btn ${activeTab === "structure" ? "active" : ""}`}
                  >
                    Macroestrutura
                  </button>
                  <button
                    onClick={() => setActiveTab("formula")}
                    className={`tab-btn ${activeTab === "formula" ? "active" : ""}`}
                  >
                    Fórmula de Cálculo
                  </button>
                  <button
                    onClick={() => setActiveTab("raw")}
                    className={`tab-btn ${activeTab === "raw" ? "active" : ""}`}
                  >
                    Logs dos Agentes
                  </button>
                </nav>

                <div className="card">
                  {/* Tab 1: Interactive marked text */}
                  {activeTab === "interactive" && (
                    <div className="tab-panel">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <h3 className="form-label" style={{ margin: 0 }}>
                          Texto Transcrito com Hover Educativo
                        </h3>
                        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                          Passe o mouse sobre os erros marcados em vermelho para ver a regra.
                        </span>
                      </div>
                      <div className="essay-paper">
                        {renderInteractiveText(
                          result.transcript,
                          result.consolidated.errosGramaticais
                        )}
                      </div>
                    </div>
                  )}

                  {/* Tab 2: Grammar Table */}
                  {activeTab === "grammar" && (
                    <div className="tab-panel">
                      <h3 className="form-label" style={{ margin: 0 }}>
                        Mapeamento Detalhado de Erros
                      </h3>
                      {result.consolidated.errosGramaticais.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "2rem", color: "var(--success)" }}>
                          <CheckCircle2 size={36} style={{ marginBottom: "0.5rem" }} />
                          <p>Excelente! Nenhum erro gramatical identificado pelo Agente 2.</p>
                        </div>
                      ) : (
                        <div className="error-table-container">
                          <table className="error-table">
                            <thead>
                              <tr>
                                <th>Parágrafo</th>
                                <th>Trecho Original</th>
                                <th>Correção Sugerida</th>
                                <th>Justificativa / Regra</th>
                              </tr>
                            </thead>
                            <tbody>
                              {result.consolidated.errosGramaticais.map((err, idx) => (
                                <tr key={idx}>
                                  <td>
                                    <span className="p-badge">P. {err.paragrafo}</span>
                                  </td>
                                  <td style={{ color: "var(--error)", textDecoration: "line-through" }}>
                                    {err.trechoIncorreto}
                                  </td>
                                  <td style={{ color: "var(--success)", fontWeight: 600 }}>
                                    {err.correcao}
                                  </td>
                                  <td>{err.explicacao}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tab 3: Structural Breakdown */}
                  {activeTab === "structure" && (
                    <div className="tab-panel">
                      <h3 className="form-label" style={{ margin: 0 }}>
                        Análise de Macroestrutura
                      </h3>
                      <div className="structural-grid">
                        <div className="structural-card">
                          <div className="structural-card-header">
                            <BookOpen size={16} />
                            <span>Introdução</span>
                          </div>
                          <div className="structural-card-body">
                            {result.consolidated.analiseEstrutural.introducao}
                          </div>
                        </div>

                        <div className="structural-card">
                          <div className="structural-card-header">
                            <Award size={16} />
                            <span>Desenvolvimento</span>
                          </div>
                          <div className="structural-card-body">
                            {result.consolidated.analiseEstrutural.desenvolvimento}
                          </div>
                        </div>

                        <div className="structural-card">
                          <div className="structural-card-header">
                            <CheckCircle2 size={16} />
                            <span>Conclusão</span>
                          </div>
                          <div className="structural-card-body">
                            {result.consolidated.analiseEstrutural.conclusao}
                          </div>
                        </div>
                      </div>

                      <div className="structural-card" style={{ marginTop: "1rem" }}>
                        <div className="structural-card-header">
                          <Info size={16} />
                          <span>Desempenho nos Tópicos do Edital</span>
                        </div>
                        <div className="structural-card-body">
                          {result.consolidated.desempenhoTopicos}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tab 4: Formula explain */}
                  {activeTab === "formula" && (
                    <div className="tab-panel">
                      <h3 className="form-label" style={{ margin: 0 }}>
                        Critério de Penalização por Erros (Cebraspe)
                      </h3>
                      <div className="formula-callout">
                        <div className="formula-title">
                          <Award size={18} />
                          <span>Fórmula Oficial Aplicada</span>
                        </div>
                        <div className="formula-math">
                          Nota Final = NC - 6 * ( Erros / Palavras )
                        </div>
                        <div className="formula-explanation">
                          A banca Cebraspe avalia a redação em duas frentes primárias:
                          <ul>
                            <li>
                              <strong>Nota de Conteúdo (NC - 0 a 20 pontos)</strong>: Pontuação dada
                              com base nos tópicos macroestruturais propostos no edital.
                            </li>
                            <li>
                              <strong>Microestrutura (Erros / Palavras)</strong>: Penalização
                              direta pelo número de erros de grafia, concordância, regência e
                              pontuação ponderada pela extensão do texto.
                            </li>
                          </ul>
                        </div>
                      </div>

                      <div style={{ marginTop: "1rem" }}>
                        <h4 style={{ marginBottom: "0.5rem", fontSize: "1rem" }}>
                          Cálculo Prático desta Redação:
                        </h4>
                        <div
                          style={{
                            background: "rgba(255, 255, 255, 0.02)",
                            padding: "1rem",
                            borderRadius: "8px",
                            fontSize: "0.9rem",
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.5rem",
                            border: "1px solid rgba(255, 255, 255, 0.05)",
                          }}
                        >
                          <p>
                            1. Nota de Conteúdo (NC):{" "}
                            <strong>{result.consolidated.notaConteudo.toFixed(2)}</strong>
                          </p>
                          <p>
                            2. Número de Erros Gramaticais:{" "}
                            <strong>{result.consolidated.totalErrosGramaticais}</strong>
                          </p>
                          <p>
                            3. Número de Palavras:{" "}
                            <strong>{result.consolidated.totalPalavras}</strong>
                          </p>
                          <p>
                            4. Cálculo da Penalidade: 6 * ({result.consolidated.totalErrosGramaticais} /{" "}
                            {result.consolidated.totalPalavras}) ={" "}
                            <span style={{ color: "var(--error)" }}>
                              -
                              {(
                                (6 * result.consolidated.totalErrosGramaticais) /
                                result.consolidated.totalPalavras
                              ).toFixed(3)}
                            </span>
                          </p>
                          <div
                            style={{
                              borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                              paddingTop: "0.5rem",
                              marginTop: "0.5rem",
                              fontWeight: 700,
                            }}
                          >
                            Nota Final: {result.consolidated.notaConteudo.toFixed(2)} -{" "}
                            {(
                              (6 * result.consolidated.totalErrosGramaticais) /
                              result.consolidated.totalPalavras
                            ).toFixed(3)}{" "}
                            = {result.consolidated.notaFinal.toFixed(2)} (Mínima = 0)
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tab 5: Raw logs */}
                  {activeTab === "raw" && (
                    <div className="tab-panel">
                      <div className="raw-grid">
                        <div>
                          <div className="raw-header">Agente 2: Relatório Gramatical (Bruto)</div>
                          <pre className="raw-content">{result.grammarReport}</pre>
                        </div>
                        <div>
                          <div className="raw-header">
                            Agente 3: Relatório Temático e Estrutural (Bruto)
                          </div>
                          <pre className="raw-content">{result.structuralReport}</pre>
                        </div>
                      </div>
                      <div style={{ marginTop: "1rem" }}>
                        <div className="raw-header">Agente 4: Consolidador Final (JSON Saída)</div>
                        <pre className="raw-content">
                          {JSON.stringify(result.consolidated, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Idle screen, when no results yet */}
          {!result && !loading && (
            <div
              className="card"
              style={{
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                padding: "4rem 2rem",
                color: "var(--text-muted)",
                flex: 1,
              }}
            >
              <div
                style={{
                  width: "64px",
                  height: "64px",
                  borderRadius: "50%",
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid rgba(255, 255, 255, 0.05)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <FileText size={32} />
              </div>
              <h3 style={{ color: "var(--text)", fontSize: "1.25rem", margin: "1rem 0 0.5rem 0" }}>
                Aguardando Análise
              </h3>
              <p style={{ maxWidth: "320px", fontSize: "0.875rem" }}>
                Preencha os dados no formulário lateral e envie a folha de redação para iniciar o
                fluxo multi-agente de correção.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
