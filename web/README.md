# Distill Web

> **High-Fidelity Editorial Dashboard Layer**

This repository contains the Next.js frontend of the Distill Engine. It provides a premium dashboard experience for managing sources, analyzing content with DQM, and refining drafts in the Studio.

## 🎨 Design Philosophy

Distill Web is designed with a **"High-Fidelity Industrial"** aesthetic.
- **Glassmorphism**: Subtle backdrops and blurs for UI clarity.
- **Micro-interactions**: Framer Motion animations for seamless state transitions.
- **Consistency**: Standardized dropdowns, icons (Lucide), and viewport frame integrity.

## 🛠️ Architecture

- **App Router**: Leveraging Next.js 15+ App Router for performant data fetching and layouts.
- **Prisma/Supabase**: Direct connection to the PostgreSQL persistence layer.
- **SWR/React Query**: Potential client-side data management strategies.
- **Tailwind v4**: Utilizing the latest CSS ecosystem features for atomic styling.

## 📂 Directory Structure

- `/src/app`: Root layouts, static pages, and API handlers.
- `/src/components`: Atomic UI components and layout wrappers (`AppShell`, `Directory`, `Studio`).
- `/src/hooks`: Custom React hooks for global state and logic.
- `/src/lib`: Shared utilities and database initializers.

## 📦 Local Development

### Installation
```bash
npm install
```

### Environment Setup
Create a `.env` in the root of the `web` folder:
```bash
DATABASE_URL="postgresql://..."
AUTH_SECRET="..."
```

### Run Dev Server
```bash
npm run dev
```

## ⚖️ Quality Standards
- No double arrows on dropdowns.
- Fixed header and sidebar context.
- High-contrast, brand-aligned color palettes.

---
*Built with precision by [svcket](https://github.com/svcket)*
