# Corretor de Redação Multi-Agente (Cebraspe)

Este repositório contém uma aplicação full-stack desenvolvida com Next.js (App Router), TypeScript e CSS Customizado, projetada para servir como portfólio de Engenharia de IA. O sistema orquestra **4 agentes autônomos** baseados em modelos Gemini 2.5 para corrigir redações discursivas com critérios oficiais de bancas de concursos públicos (como o padrão Cebraspe).

---

## 🛠️ Arquitetura dos Agentes

O projeto implementa uma cadeia de orquestração de IA dividida em quatro partes principais:

1. **Agente 1: OCR Transcritor (`gemini-2.5-flash`)**
   Recebe a imagem da folha de redação e realiza a transcrição literal e idêntica da caligrafia, preservando os erros, quebras de parágrafo e eventuais rasuras ou palavras ilegíveis.
2. **Agente 2: Analista Gramatical (`gemini-2.5-flash`)**
   Analisa o texto sob os critérios de microestrutura (ortografia, regência, concordância, crase e pontuação), identificando cada desvio e mapeando-o para seu respectivo parágrafo.
3. **Agente 3: Analista Temático e Estrutural (`gemini-2.5-flash`)**
   Compara o texto transcrito com o tema proposto e a lista de tópicos obrigatórios exigidos no edital da prova (macroestrutura). Avalia a coesão das partes (Introdução, Desenvolvimento e Conclusão).
4. **Agente 4: Consolidador de Notas (`gemini-2.5-flash`)**
   Lê o texto transcrito e os relatórios dos agentes especialista (A2 e A3). Realiza a contagem de palavras e erros gramaticais, atribui a Nota de Conteúdo (NC) e calcula a Nota Final usando a fórmula matemática oficial do Cebraspe:
   $$NF = NC - 6 \times \left(\frac{\text{Erros}}{\text{Palavras}}\right)$$
   Toda a saída do consolidador é gerada em um formato JSON estrito através do recurso de **Structured Outputs** da API do Gemini.

---

## 🚀 Como Iniciar Localmente

### Pré-requisitos
- Node.js (v18+)
- Uma chave de API do Gemini (Google AI Studio)

### Passos de Instalação
1. Clone este repositório
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Crie um arquivo `.env.local` na raiz e adicione sua chave de API (opcional, você também pode inserir a chave direto na interface gráfica):
   ```env
   GEMINI_API_KEY=sua_chave_aqui
   ```
4. Inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```
5. Abra [http://localhost:3000](http://localhost:3000) no seu navegador.

---

## 💡 Destaques de Engenharia de IA

- **Execução Paralela**: Redução de tempo de processamento em cerca de 50% rodando o Agente Gramatical e o Agente Temático em paralelo com `Promise.all`.
- **Structured Outputs**: Validação de esquema estático de JSON no Agente Consolidador, eliminando falhas de parsing de dados estruturados na integração frontend/backend.
- **Folha de Redação Procedural (Canvas)**: Geração dinâmica de uma folha de redação manuscrita simulada no navegador (com pautas, margens e fonte cursiva) para que recrutadores possam testar o OCR imediatamente e sem uploads de arquivos pessoais.
- **Anotações e Diffs no Texto**: Substituição tokenizada de expressões no texto original para criar um realce interativo de erros com tooltips educativos no hover do mouse.
