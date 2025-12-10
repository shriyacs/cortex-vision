# Cortex Vision

> AI-powered code architecture visualization tool that generates interactive diagrams from live codebases

<p align="center">
  <img src="public/web-app-manifest-512x512.png" alt="Cortex Vision Logo" width="200"/>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-18.3-61DAFB?logo=react" alt="React"/>
  <img src="https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/FastAPI-Python-009688?logo=fastapi" alt="FastAPI"/>
  <img src="https://img.shields.io/badge/Anthropic-Claude-191919" alt="Claude"/>
</p>

---

## 📖 Overview

Cortex analyzes code structure (modules, classes, services, dependencies, call graphs), identifies architectural patterns, and produces interactive Mermaid diagrams.

## ✨ Features

- 🔍 **Repository Analysis** - Analyze Git repos (GitHub, GitLab, Bitbucket) or upload code archives
- 📊 **Multi-Level Granularity** - View architecture at folder, file, or method/symbol level
- 🎨 **Interactive Diagrams** - Mermaid visualizations with zoom, pan, and full-screen viewer
- 🔗 **Call Flow Visualization** - Highlight method call flows with animations
- 🌳 **Git Navigation** - Switch between branches, tags, and commits with caching
- 💾 **Export** - Download diagrams as PNG or SVG (high resolution)

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Python 3.8+
- [Anthropic API key](https://console.anthropic.com/)

### Installation

```bash
# Clone the repository
git clone https://github.com/shriyacs/cortex-vision.git
cd cortex-vision

# Install dependencies
npm install
pip install -r requirements.txt

# Configure API key
cd src/backend
cp .env.example .env
# Edit .env: ANTHROPIC_API_KEY=your-api-key-here
```

### Running Locally

```bash
# Terminal 1: Start backend
cd src/backend && python backend_server.py

# Terminal 2: Start frontend
npm run dev
```

Visit `http://localhost:8080`

## 🛠️ Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, Mermaid |
| **Backend** | FastAPI, LangGraph, Anthropic Claude API, NetworkX |
| **Languages Supported** | Python, JavaScript, TypeScript, Java, C/C++, Go, Rust, Ruby, PHP, Scala, Kotlin, and more |

## 📁 Project Structure

```
cortex-vision/
├── src/
│   ├── pages/                          # React pages
│   ├── components/ui/                  # shadcn/ui components
│   ├── backend/
│   │   ├── backend_server.py           # FastAPI server
│   │   ├── code_architecture_agent.py  # LangGraph agent
│   │   └── .env.example                # API key template
│   └── hooks/                          # React hooks
├── public/                             # Static assets
├── package.json
├── requirements.txt
└── README.md
```

## 🔌 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/analysis` | Start a new code analysis job |
| `GET` | `/api/jobs/{job_id}` | Get job status and progress |
| `GET` | `/api/results/{job_id}` | Retrieve analysis results |
| `POST` | `/api/upload` | Upload code archive (ZIP/TAR) |
| `GET` | `/api/call-flow/{job_id}` | Get method call flow data |
| `WS` | `/ws/jobs/{job_id}` | Real-time progress updates |

## 🏗️ Architecture

The backend uses a **LangGraph multi-agent system**:

1. **Repo Reader** → Fetches repository files
2. **Static Analyzer** → Parses code structure
3. **Graph Builder** → Constructs dependency graphs
4. **Pattern Mapper** → Identifies architecture patterns
5. **LLM Orchestrator** → Uses Claude for code understanding
6. **Validator** → Ensures output quality
7. **Output Renderer** → Generates Mermaid diagrams

## 🔒 Security

> ⚠️ **Never commit `.env` files or API keys**

- `.env` is in `.gitignore`
- Use `.env.example` as template
- Rotate keys immediately if exposed

## 🤝 Contributing

Contributions are welcome! Please fork the repo and submit a pull request.

## 👤 Author

**Sri Shriya Challapuram**

**Powered by:** React • TypeScript • Vite • Tailwind • shadcn/ui • Mermaid • Anthropic Claude • FastAPI • LangGraph

---

<p align="center">Made with ❤️ for architectural discovery</p>
