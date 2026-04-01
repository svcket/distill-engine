# Distill Engine

> **The Industrial Editorial Intelligence Layer**

Distill Engine is an advanced, high-fidelity content transformation platform designed for modern digital agencies and editorial teams. It automates the extraction, synthesis, and creative restructuring of long-form audio and visual media into premium, brand-aligned digital assets.

## 🏛️ Core Architecture

The system is built on a decoupled, three-tier architecture ensuring maximum reliability and performant data processing:

- **Next.js Frontend**: A premium, high-fidelity UI/UX built with Tailwind CSS, Framer Motion, and Lucide icons.
- **Python Execution Layer**: A robust media processing engine utilizing Whisper (speech-to-text), custom scraping adapters (Spotify, Apple Podcasts, YouTube), and LLM-driven editorial reasoning.
- **PostgreSQL Database**: Persistent storage for source metadata, transcripts, and generated editorial drafts.

## 🚀 Key Features

- **Multi-Source Ingestion**: Seamlessly ingest content from Spotify, Apple Podcasts, YouTube, and Vimeo.
- **Deep Density Intelligence (DQM)**: Quantitative scoring of content depth, accuracy, and brand alignment.
- **Draft Studio**: A high-fidelity editor for refining AI-generated content into publish-ready assets.
- **Regeneration Engine**: Real-time tactical restructuring of content based on specific editorial strategies.

## 🛠️ Technology Stack

- **Frontend**: Next.js 15+, TypeScript, Tailwind CSS, Framer Motion.
- **Backend**: Python 3.11+, PyTorch (Whisper), Requests, BeautifulSoup.
- **Database**: PostgreSQL (Supabase/Prisma).
- **Tooling**: Docker, Turbo, ESLint, Prettier.

## 📦 Getting Started

### Prerequisites
- Node.js 18+
- Python 3.11+
- PostgreSQL instance

### Quick Start
```bash
# Clone the repository
git clone https://github.com/svcket/distill-engine.git

# Install web dependencies
cd web
npm install
npm run dev

# Setup execution layer
cd ../execution
pip install -r requirements.txt
python main.py
```

## 🛡️ License
Distill Engine is proprietary software. All rights reserved.

---
*Built with precision by [svcket](https://github.com/svcket)*
