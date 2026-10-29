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

Each run has a spend cap (`RUN_CAP_USD`, default $0.25). Every paid call is checked against it before it is made, and the run's cost is shown on the report.

## Code

- `lib/research.ts`: the pipeline and report prompt
- `lib/providers.ts`: Tavily, Supadata, OpenAI and Anthropic clients plus the cost meter
- `lib/evidence.ts`: turns pages, captions and files into citable passages
- `lib/cards.ts`: the four seed cards
- `lib/models.ts`: model IDs and rates
- `app/`: the page and the `/api/research` route

The research core is a simplified port of the earlier M0 runner (`/Users/vic/Documents/Projects/research/m0`), without its audit and ledger machinery.
