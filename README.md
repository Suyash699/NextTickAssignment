# Mahindra Multistage AI Agent

This project is a Next.js + TypeScript conversational assistant for Mahindra-related sales and service flows. It pairs a Groq-backed LLM with Zoho CRM integrations so the agent can respond to vehicle questions, create leads, check deals, manage bookings, and open service cases.

## Stack

- Next.js App Router
- TypeScript
- Groq via the OpenAI-compatible SDK
- Zoho CRM REST API v6

## Local setup

1. Copy the environment template:

```bash
cp .env.example .env.local
```

2. Fill in your credentials in `.env.local`:

```bash
GROQ_API_KEY=
GROQ_MODEL=llama-3.3-70b-versatile
ZOHO_CLIENT_ID=
ZOHO_CLIENT_SECRET=
ZOHO_REFRESH_TOKEN=
ZOHO_ACCOUNTS_URL=https://accounts.zoho.in
ZOHO_API_DOMAIN=https://www.zohoapis.in
```

3. Install dependencies if needed:

```bash
npm install
```

4. Run the app:

```bash
npm run dev
```

5. Open http://localhost:3000

## Project structure

- app/page.tsx — chat shell entry point
- app/api/chat/route.ts — SSE endpoint for streaming responses
- src/components/Chat.tsx — UI that renders the chat window
- src/lib/agent.ts — LLM tool-calling loop
- src/lib/tools.ts — tool schemas and CRM handlers
- src/lib/zoho.ts — OAuth + Zoho CRM API helper
- src/lib/session.ts — in-memory session store
- docs/architecture.md — Mermaid diagram of the flow

## Notes

- The session store is intentionally in-memory for local demo usage.
- Zoho custom fields should be created in the target CRM before using lead, deal, booking, and service flows.
- The current implementation uses the same normalized 10-digit Indian mobile format for lookup and writes to avoid duplicate or missed records.
