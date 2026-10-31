# Dev Analyzer

Deterministic analysis engine for GitHub developers and repositories. Lightweight, stateless architecture deployed on Vercel.

---

## Features

- Developer Analysis: Evaluates GitHub user profiles across key performance metrics.
- Repository Analysis: Provides technical depth and maintenance scores for any public repository.
- Battle Mode: Head-to-head metrics comparison between developers or repositories.
- Roast Mode: AI-generated technical feedback based on profile activity.
- Intelligence Reports: Per-category metrics breakdown and deterministic scoring.
- Export Capabilities: Generate downloadable visual summary cards.
- Stateless Architecture: Zero database dependency, real-time GitHub API aggregation.

---

## Commits

This project follows conventional commit standard for git commit history:

- `feat`: New features or capabilities
- `fix`: Bug fixes and corrections
- `docs`: Documentation updates
- `refactor`: Code restructuring without functional changes
- `chore`: Build processes, dependencies, or maintenance

---

## Environment Variables

| Variable | Description | Source |
| --- | --- | --- |
| `GITHUB_PAT` | GitHub Personal Access Token | [github.com/settings/tokens](https://github.com/settings/tokens) |
| `GROQ_API_KEY` | Groq API Key | [console.groq.com](https://console.groq.com) |

---

## Quickstart

### Local Development

1. Install dependencies:
```bash
npm install
cd frontend && npm install
```

2. Start frontend dev server:
```bash
npm run dev
```

---

## Deployment

### Vercel (One-Click)

1. Fork repository to GitHub.
2. Import project at [vercel.com/new](https://vercel.com/new).
3. Configure environment variables (`GITHUB_PAT`, `GROQ_API_KEY`).
4. Click **Deploy**.

Vercel automatically builds the frontend and routes API requests to Vercel Edge Functions.

---

## Project Structure

```
dev-analyzer/
├── api/                    Edge API function
├── frontend/               React + Vite UI application
├── worker/                 Core deterministic backend engine
├── CONTRIBUTING.md         Contribution guidelines
├── CODE_OF_CONDUCT.md      Community behavior standards
├── LICENSE                 MIT License
├── SECURITY.md             Vulnerability reporting policy
└── README.md               Project documentation
```

---

## Governance & Community

- [Contributing](CONTRIBUTING.md)
- [Security Policy](SECURITY.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [License](LICENSE) (MIT License)

## PythosX Edition

DevAnalyzer — Analyzed by [PythosX](https://github.com/PythosX). Original project by ajisth69 (MIT, see LICENSE).

### New in this edition
- **PythosX Professional Developer Review** (Developer Profile): public-data snapshot, transparent Professional Presence Score (8 weighted components with method + disclaimer), strengths, improvements and verdict. It scores public GitHub presentation only — not hiring suitability.
- **PythosX Repository Intelligence**: the 3 most recently updated and the 2 most-starred public repos (GitHub GraphQL `UPDATED_AT` / `STARGAZERS` ordering, originals preferred, overlap shown once with both badges). Each gets a deterministic 10-point review, README Reality Check, Ghost Detector, Testing Vacation Alert, Star vs Substance and a roast.
- **Roast levels**: Friendly Roast, Spicy Roast, Brutal Code Review — generated from real findings, aimed at code/docs/practices, never the person.
- **Follow-to-unlock**: the repository section is blurred until the visitor clicks through to github.com/PythosX and returns (focus/visibility events, `sessionStorage`, manual fallback button). This is a click-through only: without GitHub OAuth the app cannot verify a follow and does not claim to.
- PythosX branding in headings, footer, PDF export and the shareable card.

### API
`POST /api/analyze` now also returns a `pythosx` object (`professionalReview`, `repositoryIntelligence`, `profileRoasts`, `funnyVerdict`). Existing endpoints and fields are unchanged. The extra review costs one GraphQL request plus a compact evidence fetch per repo (max 5) and at most one additional Groq call, all within the existing fetch budget. No database; no secrets in the frontend.

### Setup
Unchanged: set `GITHUB_PAT` (and optionally `GROQ_API_KEY`) as Worker/Vercel env vars. Run `npm test` in `worker/` and `frontend/`, and `npm run build` in `frontend/`.
