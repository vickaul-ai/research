// Wires the pipeline to environment keys, the chosen model and the spend caps.
import {DEFAULT_MODEL, MODELS, ModelKey} from './models';
import {CostMeter, createProviders} from './providers';
import {research, ResearchResult, Upload} from './research';
import {getStore, Store} from './store';

export const RUN_CAP_USD = Number(process.env.RUN_CAP_USD) || 0.25;
export const MONTHLY_CAP_USD = Number(process.env.MONTHLY_CAP_USD) || 20;

export interface RunRequest {
  question: string;
  links?: string[];
  uploads?: Upload[];
  cardId?: string | null;
  model?: ModelKey;
  webSearch?: boolean;
  previous?: {markdown: string; generatedAt: string};
}

export function monthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function spendStatus(store: Store = getStore()) {
  const spent = await store.spendSince(monthStart());
  return {spentUsd: spent, monthlyCapUsd: MONTHLY_CAP_USD, runCapUsd: RUN_CAP_USD, remainingUsd: Math.max(0, MONTHLY_CAP_USD - spent)};
}

export async function runResearch(request: RunRequest, {store = getStore(), fetchImpl = fetch}: {store?: Store; fetchImpl?: typeof fetch} = {}): Promise<ResearchResult> {
  const {remainingUsd} = await spendStatus(store);
  if (remainingUsd < 0.01) throw new Error(`This month's research budget ($${MONTHLY_CAP_USD}) is used up. Raise MONTHLY_CAP_USD to continue.`);
  const model = MODELS[request.model ?? DEFAULT_MODEL] ?? MODELS[DEFAULT_MODEL];
  const meter = new CostMeter(Math.min(RUN_CAP_USD, remainingUsd));
  const providers = createProviders({
    model,
    meter,
    fetchImpl,
    keys: {
      openai: process.env.OPENAI_API_KEY,
      anthropic: process.env.ANTHROPIC_API_KEY,
      tavily: process.env.TAVILY_API_KEY,
      supadata: process.env.SUPADATA_API_KEY,
    },
  });
  const card = request.cardId ? (await store.listCards()).find(c => c.id === request.cardId) : undefined;
  try {
    const result = await research(
      {question: request.question, links: request.links, uploads: request.uploads, card, webSearch: request.webSearch,
        previous: request.previous},
      {providers, model: model.id, meterTotal: () => meter.total, costLines: () => meter.lines},
    );
    // Snapshot the card as used, so feedback stays meaningful after the card is edited.
    result.runId = crypto.randomUUID();
    result.cardName = card?.name ?? null;
    await store.logRun({id: result.runId, question: request.question, cardId: card?.id ?? null, cardName: card?.name ?? null,
      cardBrief: card?.brief ?? null, model: model.id, costUsd: result.costUsd});
    return result;
  } finally {
    // Failed runs still cost money, so they count toward the month too.
    if (meter.total > 0) await store.recordSpend(meter.total, model.id);
  }
}
