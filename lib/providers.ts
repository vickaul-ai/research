// Thin HTTP clients for the paid research services. Ported from the old M0
// runner, minus the reservation ledger: every call adds its cost to a meter
// that refuses new calls once the per-run cap is reached.
import {ModelConfig, SUPADATA_CREDIT_USD, TAVILY_CREDIT_USD, tokenCost} from './models';

export class ProviderError extends Error {
  constructor(public code: string, public status?: number) {
    super(`Provider request failed: ${code}${status ? ` (HTTP ${status})` : ''}`);
    this.name = 'ProviderError';
  }
}

export interface Keys {
  openai?: string;
  anthropic?: string;
  tavily?: string;
  supadata?: string;
}

export interface CostLine {
  operation: string;
  usd: number;
}

export class CostMeter {
  lines: CostLine[] = [];
  constructor(public capUsd: number) {}
  get total(): number {
    return this.lines.reduce((sum, line) => sum + line.usd, 0);
  }
  /** Refuse a call whose worst-case cost would push the run over its cap. */
  check(operation: string, maxUsd: number) {
    if (this.total + maxUsd > this.capUsd) throw new ProviderError(`run_cap_reached:${operation}`);
  }
  add(operation: string, usd: number) {
    this.lines.push({operation, usd});
  }
}

const TIMEOUT_MS = 90_000;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

export function youtubeId(value: string): string | null {
  let u: URL;
  try { u = new URL(value); } catch { return null; }
  let id: string | null = null;
  if (u.hostname === 'youtu.be') id = u.pathname.split('/')[1] ?? null;
  else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(u.hostname)) {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else if (/^\/(shorts|live|embed)\//.test(u.pathname)) id = u.pathname.split('/')[2] ?? null;
  }
  return id && YOUTUBE_ID.test(id) ? id : null;
}

export function publicUrl(value: string): string {
  let u: URL;
  try { u = new URL(value.trim()); } catch { throw new ProviderError('invalid_url'); }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || !u.hostname.includes('.') ||
      /(^|\.)(localhost|local|internal|test|invalid)$/.test(u.hostname) || /^[\d.]+$/.test(u.hostname) ||
      u.hostname.startsWith('[')) {
    throw new ProviderError('invalid_url');
  }
  return u.href;
}

export interface GenerateResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export function createProviders({model, keys, meter, fetchImpl = fetch, sleep = (ms: number) => new Promise(r => setTimeout(r, ms))}: {
  model: ModelConfig;
  keys: Keys;
  meter: CostMeter;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<unknown>;
}) {
  function key(name: keyof Keys): string {
    const value = keys[name];
    if (!value) throw new ProviderError(`missing_${name}_key`);
    return value;
  }

  /** Make a paid request. A timeout or dropped connection may still be billed, so it
   * counts at the full price; an HTTP error response is treated as not billed. */
  async function paid(operation: string, maxUsd: number, url: string, init: RequestInit) {
    try {
      return await request(url, init);
    } catch (error) {
      if (error instanceof ProviderError && error.code === 'transport_or_timeout') meter.add(operation, maxUsd);
      throw error;
    }
  }

  async function request(url: string, init: RequestInit): Promise<{status: number; data: any}> {
    let response: Response;
    try {
      response = await fetchImpl(url, {...init, signal: AbortSignal.timeout(TIMEOUT_MS)});
    } catch {
      throw new ProviderError('transport_or_timeout');
    }
    let data: any = null;
    try { data = await response.json(); } catch { /* handled below */ }
    if (response.status < 200 || response.status >= 300) throw new ProviderError('http_error', response.status);
    if (!data || typeof data !== 'object') throw new ProviderError('invalid_json', response.status);
    return {status: response.status, data};
  }

  return {
    async search(query: string): Promise<{url: string; title: string}[]> {
      meter.check('tavily.search', TAVILY_CREDIT_USD);
      const {data} = await paid('tavily.search', TAVILY_CREDIT_USD, 'https://api.tavily.com/search', {
        method: 'POST',
        headers: {Authorization: `Bearer ${key('tavily')}`, 'Content-Type': 'application/json'},
        body: JSON.stringify({query, search_depth: 'basic', max_results: 5, include_answer: false, include_raw_content: false}),
      });
      meter.add('tavily.search', TAVILY_CREDIT_USD);
      if (!Array.isArray(data.results)) throw new ProviderError('invalid_response');
      const results: {url: string; title: string}[] = [];
      for (const row of data.results) {
        if (typeof row?.url !== 'string') continue;
        try { results.push({url: publicUrl(row.url), title: typeof row.title === 'string' ? row.title : row.url}); } catch { /* skip */ }
      }
      return results;
    },

    async extract(url: string): Promise<{title: string; text: string}> {
      url = publicUrl(url);
      meter.check('tavily.extract', TAVILY_CREDIT_USD);
      const {data} = await paid('tavily.extract', TAVILY_CREDIT_USD, 'https://api.tavily.com/extract', {
        method: 'POST',
        headers: {Authorization: `Bearer ${key('tavily')}`, 'Content-Type': 'application/json'},
        body: JSON.stringify({urls: [url], extract_depth: 'basic', format: 'markdown'}),
      });
      // Tavily bills extraction in batches; count a whole credit per URL to stay conservative.
      meter.add('tavily.extract', TAVILY_CREDIT_USD);
      const row = Array.isArray(data.results) ? data.results.find((r: any) => r?.url === url) ?? data.results[0] : undefined;
      if (!row || typeof row.raw_content !== 'string' || !row.raw_content.trim()) throw new ProviderError('extraction_unavailable');
      return {title: typeof row.title === 'string' && row.title ? row.title : url, text: row.raw_content};
    },

    /** Native YouTube captions only. Missing captions never trigger paid AI transcription. */
    async transcript(url: string): Promise<{text: string; segments: {text: string; offset: number}[]}> {
      const id = youtubeId(url);
      if (!id) throw new ProviderError('invalid_youtube_url');
      meter.check('supadata.transcript', SUPADATA_CREDIT_USD);
      const token = key('supadata');
      const endpoint = new URL('https://api.supadata.ai/v1/transcript');
      endpoint.search = new URLSearchParams({url: `https://www.youtube.com/watch?v=${id}`, mode: 'native', text: 'false'}).toString();
      let {status, data} = await paid('supadata.transcript', SUPADATA_CREDIT_USD, endpoint.href, {method: 'GET', headers: {'x-api-key': token}});
      meter.add('supadata.transcript', SUPADATA_CREDIT_USD);
      if (status === 206) throw new ProviderError('transcript_unavailable', 206);
      if (status === 202 && typeof data.jobId === 'string') {
        // Status reads are free. Poll briefly, then give up rather than re-requesting.
        const jobId = data.jobId;
        for (let i = 0; i < 10; i++) {
          await sleep(1000);
          ({data} = await request(`https://api.supadata.ai/v1/transcript/${encodeURIComponent(jobId)}`, {method: 'GET', headers: {'x-api-key': token}}));
          if (data.status === 'failed') throw new ProviderError('transcript_job_failed');
          if (data.status === 'completed') { data = data.result ?? data; break; }
        }
        if (!Array.isArray(data.content)) throw new ProviderError('transcript_pending', 202);
      }
      if (!Array.isArray(data.content)) throw new ProviderError('invalid_transcript');
      const segments = data.content
        .filter((s: any) => typeof s?.text === 'string')
        .map((s: any) => ({text: s.text, offset: Number(s.offset) || 0}));
      const spoken = segments.some((s: {text: string}) => s.text.replace(/\[(?:music|applause|laughter|silence)\]/gi, '').replace(/[♫♪♬♩\s]/gu, ''));
      if (!spoken) throw new ProviderError('transcript_unavailable');
      return {text: segments.map((s: {text: string}) => s.text).join(' '), segments};
    },

    async generate({system, input, maxOutputTokens, operation = 'generate'}: {
      system: string; input: string; maxOutputTokens: number; operation?: string;
    }): Promise<GenerateResult> {
      // Rough worst case: ~4 bytes per token for input, full output allowance.
      const maxUsd = tokenCost(model, Math.ceil((system.length + input.length) / 3), maxOutputTokens);
      meter.check(operation, maxUsd);
      const isOpenAI = model.provider === 'openai';
      const {data} = await paid(operation, maxUsd, isOpenAI ? 'https://api.openai.com/v1/responses' : 'https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: isOpenAI
          ? {Authorization: `Bearer ${key('openai')}`, 'Content-Type': 'application/json'}
          : {'x-api-key': key('anthropic'), 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json'},
        body: JSON.stringify(isOpenAI
          ? {model: model.id, instructions: system, input, reasoning: {effort: 'low'}, max_output_tokens: maxOutputTokens, store: false}
          : {model: model.id, system, messages: [{role: 'user', content: input}], max_tokens: maxOutputTokens}),
      });
      const inputTokens = Number(data.usage?.input_tokens) || 0;
      const outputTokens = Number(data.usage?.output_tokens) || 0;
      meter.add(operation, inputTokens || outputTokens ? tokenCost(model, inputTokens, outputTokens) : maxUsd);
      let text: string;
      if (isOpenAI) {
        if (!Array.isArray(data.output)) throw new ProviderError('invalid_output');
        text = data.output.filter((item: any) => item?.type === 'message')
          .flatMap((item: any) => item.content ?? [])
          .filter((c: any) => c?.type === 'output_text').map((c: any) => c.text).join('\n');
        if (data.status && data.status !== 'completed') throw new ProviderError('incomplete_output');
      } else {
        if (!Array.isArray(data.content)) throw new ProviderError('invalid_output');
        text = data.content.filter((c: any) => c?.type === 'text').map((c: any) => c.text).join('\n');
        if (data.stop_reason === 'max_tokens') throw new ProviderError('incomplete_output');
      }
      if (!text.trim()) throw new ProviderError('empty_output');
      return {text, inputTokens, outputTokens};
    },
  };
}

export type Providers = ReturnType<typeof createProviders>;
