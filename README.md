# KORD

> The Architecture of Ultimate Efficiency for the Indian Legal Elite.

## What is KORD?

KORD is a Heavy Mass Legal AI infrastructure built to eliminate inefficiency 
in Indian Jurisprudence. AI-powered Supreme Court precedent mapping and 
research automation for Indian advocates.

Built specifically for Indian litigation — not corporate law, not Western 
legal systems.

## The Problem

- Case research takes 3–4 days manually
- Existing tools cost ₹50,000+/year (Manupatra, SCC Online)
- No tool understands Indian court protocols
- 1.7 million advocates in India are underserved

## The KORD Protocol

- Hallucination-free judgment search across Supreme Court and High Courts
- AI analysis with key ratios, holdings, and relevance mapping
- Petition evaluation engine (coming soon)
- Hindi and Bengali language support (coming soon)
- Priced at ₹2,499/month

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python + FastAPI |
| AI | Claude API (Anthropic) |
| Data | India Kanoon API |
| Frontend | Next.js + Tailwind CSS |

## Modules

- **Module 1 — Research Accelerator** ✅ In Progress
- **Module 2 — Petition Evaluation Engine** 🔜 Coming Soon
- **Module 3 — Court Protocol Navigator** 🔜 Coming Soon
- **Module 4 — Vernacular Bridge** 🔜 Coming Soon

## Getting Started (Local Development)

### Backend
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Environment Variables

Create a `backend/.env` file:

KANOON_API_KEY=your_india_kanoon_key
ANTHROPIC_API_KEY=your_claude_api_key

---

*Execution is the only metric.*