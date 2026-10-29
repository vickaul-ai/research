# Research

A personal research app. Ask a question (typed or dictated), add links to articles or YouTube videos, attach files, and pick a card to steer the research. The app reads what you gave it, searches the web for gaps, and writes a short cited report using cheap models.

Tracking: Linear project "Research app (reset)".

## Run locally

Requires Node 22+.

```sh
npm install
cp .env.example .env.local   # add your keys
npm run dev                  # http://localhost:3000
npm test
```

## How a run works

1. Supplied files and links are read first. Articles go through Tavily extract. YouTube links use Supadata **native captions only**: a video without captions is reported as unreadable, never sent for paid AI transcription.
2. If web search is on, a cheap model proposes up to two searches for missing evidence (or the question itself is searched when nothing was supplied). Up to four results are read.
3. The model writes a ~800-word Markdown report citing passage IDs like `[S1:P2]`. Citations to passages that don't exist are flagged.

Each run has a spend cap (`RUN_CAP_USD`, default $0.25) and the month has a budget (`MONTHLY_CAP_USD`, default $20, counted from the 1st, UTC). Every paid call is checked against the run cap before it is made; every run's cost, including failed runs, is logged against the month, and new runs are refused once the budget is used. The cost is shown on each report and the month's total at the top of the page.

## Saved research

Save keeps the question, links, files, card and the full report with its sources. Rerun repeats the same inputs with fresh sources and saves a new version with a "What changed" section. Delete removes every version. Saved research needs `DATABASE_URL` (Neon); without it, it is kept in memory and lost on restart.

## Deploy (Vercel)

1. Import `vickaul-ai/research` in Vercel.
2. Add a Neon database (Vercel Storage → Neon, or paste a Neon connection string as `DATABASE_URL`). Tables are created on first use.
3. Set environment variables: `APP_PASSWORD`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `TAVILY_API_KEY`, `SUPADATA_API_KEY`, optionally `RUN_CAP_USD` and `MONTHLY_CAP_USD`.
4. Deploy. Without `APP_PASSWORD` the deployed app refuses every request.

## Code

- `lib/research.ts`: the pipeline and report prompt
- `lib/providers.ts`: Tavily, Supadata, OpenAI and Anthropic clients plus the cost meter
- `lib/evidence.ts`: turns pages, captions and files into citable passages
- `lib/cards.ts`: the four seed cards
- `lib/models.ts`: model IDs and rates
- `lib/store.ts`: saved research and the spend log (Neon, or memory for local dev)
- `lib/auth.ts`, `proxy.ts`: single-user password login
- `lib/run.ts`: wires keys, caps and the store to the pipeline
- `app/`: the page and the `/api/research` route

The research core is a simplified port of the earlier M0 runner (`/Users/vic/Documents/Projects/research/m0`), without its audit and ledger machinery.
