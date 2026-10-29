// Cheap models only. Rates are USD per million tokens, checked 2026-10-28
// against the providers' public pricing; recheck before changing caps.
export type ModelKey = 'openai' | 'anthropic';

export interface ModelConfig {
  key: ModelKey;
  provider: 'openai' | 'anthropic';
  id: string;
  label: string;
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
}

export const MODELS: Record<ModelKey, ModelConfig> = {
  openai: {
    key: 'openai',
    provider: 'openai',
    id: 'gpt-6-luna',
    label: 'GPT-6 Luna',
    inputUsdPerMillion: 0.1,
    outputUsdPerMillion: 0.5,
  },
  anthropic: {
    key: 'anthropic',
    provider: 'anthropic',
    id: 'claude-haiku-5-5',
    label: 'Claude Haiku 5.5',
    inputUsdPerMillion: 0.1,
    outputUsdPerMillion: 0.5,
  },
};

export const DEFAULT_MODEL: ModelKey = 'openai';

// Per-credit prices for paid tools, used for the cost shown on each report.
export const TAVILY_CREDIT_USD = 0.008;
export const SUPADATA_CREDIT_USD = 0.01;

export function tokenCost(model: ModelConfig, inputTokens: number, outputTokens: number): number {
  return (inputTokens * model.inputUsdPerMillion + outputTokens * model.outputUsdPerMillion) / 1_000_000;
}
