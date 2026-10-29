// Wires the pipeline to environment keys, the chosen model and a per-run cap.
import {findCard} from './cards';
import {DEFAULT_MODEL, MODELS, ModelKey} from './models';
import {CostMeter, createProviders} from './providers';
import {research, ResearchResult, Upload} from './research';

export const RUN_CAP_USD = Number(process.env.RUN_CAP_USD) || 0.25;

export interface RunRequest {
  question: string;
  links?: string[];
  uploads?: Upload[];
  cardId?: string | null;
  model?: ModelKey;
  webSearch?: boolean;
  previous?: {markdown: string; generatedAt: string};
}

export async function runResearch(request: RunRequest, fetchImpl: typeof fetch = fetch): Promise<ResearchResult> {
  const model = MODELS[request.model ?? DEFAULT_MODEL] ?? MODELS[DEFAULT_MODEL];
  const meter = new CostMeter(RUN_CAP_USD);
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
  return research(
    {question: request.question, links: request.links, uploads: request.uploads, card: findCard(request.cardId), webSearch: request.webSearch,
      previous: request.previous},
    {providers, model: model.id, meterTotal: () => meter.total, costLines: () => meter.lines},
  );
}
