import {describe, expect, it} from 'vitest';
import {SEED_CARDS} from '@/lib/cards';
import {captionChunks, formatTimestamp, makeSource, textChunks} from '@/lib/evidence';
import {MODELS} from '@/lib/models';
import {CostMeter, createProviders, publicUrl, youtubeId} from '@/lib/providers';
import {checkCitations, research} from '@/lib/research';

type Handler = (url: string, init: RequestInit) => {status?: number; body: unknown};

function fakeFetch(handler: Handler) {
  const calls: {url: string; body: any}[] = [];
  const impl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({url, body: init.body ? JSON.parse(String(init.body)) : undefined});
    const {status = 200, body} = handler(url, init);
    return new Response(JSON.stringify(body), {status});
  }) as typeof fetch;
  return {impl, calls};
}

const keys = {openai: 'k', anthropic: 'k', tavily: 'k', supadata: 'k'};
const page = 'Intro paragraph about the market.\n\nNeon offers serverless Postgres with a free tier.\n\nUnrelated closing text.';

function openaiText(text: string) {
  return {status: 'completed', output: [{type: 'message', content: [{type: 'output_text', text}]}], usage: {input_tokens: 1000, output_tokens: 500}};
}

function setup(handler: Handler, cap = 1) {
  const meter = new CostMeter(cap);
  const fake = fakeFetch(handler);
  const providers = createProviders({model: MODELS.openai, keys, meter, fetchImpl: fake.impl, sleep: async () => {}});
  const deps = {providers, model: MODELS.openai.id, meterTotal: () => meter.total, costLines: () => meter.lines};
  return {meter, fake, deps};
}

describe('helpers', () => {
  it('recognises YouTube links', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=0BDi0d1j7u0')).toBe('0BDi0d1j7u0');
    expect(youtubeId('https://youtu.be/0BDi0d1j7u0')).toBe('0BDi0d1j7u0');
    expect(youtubeId('https://example.com/watch?v=0BDi0d1j7u0')).toBeNull();
  });

  it('rejects private or malformed URLs', () => {
    expect(() => publicUrl('http://localhost/x')).toThrow();
    expect(() => publicUrl('http://10.0.0.1/x')).toThrow();
    expect(() => publicUrl('not a url')).toThrow();
    expect(publicUrl('https://example.com/a')).toBe('https://example.com/a');
  });

  it('formats caption timestamps', () => {
    expect(formatTimestamp(65_000)).toBe('1:05');
    expect(formatTimestamp(3_725_000)).toBe('1:02:05');
  });

  it('groups captions into minute-long passages', () => {
    const chunks = captionChunks([{text: 'a', offset: 0}, {text: 'b', offset: 30_000}, {text: 'c', offset: 61_000}]);
    expect(chunks.map(c => [c.text, c.locator])).toEqual([['a b', '0:00'], ['c', '1:01']]);
  });

  it('keeps the opening and the passages that match the question, in source order', () => {
    const source = makeSource(1, {url: 'https://x.com', title: 'X', origin: 'link', kind: 'page',
      chunks: textChunks(page), focus: 'Neon serverless Postgres', maxChars: 90});
    expect(source.passages.map(p => p.locator)).toEqual(['¶1', '¶2']);
    expect(source.passages[1].id).toBe('S1:P2');
    expect(source.truncated).toBe(true);
  });

  it('flags citations that do not exist', () => {
    const source = makeSource(1, {url: null, title: 'f', origin: 'upload', kind: 'file', chunks: textChunks(page), focus: ''});
    expect(checkCitations('Fact [S1:P1]. Other [S9:P1].', [source])).toEqual(['S9:P1']);
  });

  it('ships four seed cards with briefs', () => {
    expect(SEED_CARDS).toHaveLength(4);
    for (const card of SEED_CARDS) expect(card.brief.length).toBeGreaterThan(50);
  });
});

describe('research pipeline', () => {
  it('reads supplied links, skips search when evidence suffices, and writes a cited report', async () => {
    const {fake, deps} = setup(url => {
      if (url.includes('tavily.com/extract')) return {body: {results: [{url: 'https://example.com/neon', title: 'Neon pricing', raw_content: page}]}};
      if (url.includes('openai.com')) {
        return fake.calls.filter(c => c.url.includes('openai')).length === 1
          ? {body: openaiText('{"queries": []}')}
          : {body: openaiText('# Neon free tier\n\n**Bottom line:** Neon has a free tier [S1:P2].')};
      }
      throw new Error(`unexpected ${url}`);
    });
    const result = await research({question: 'Does Neon have a free tier?', links: ['https://example.com/neon'], card: SEED_CARDS[2]}, deps);
    expect(result.title).toBe('Neon free tier');
    expect(result.sources).toHaveLength(1);
    expect(result.unknownCitations).toEqual([]);
    expect(fake.calls.some(c => c.url.includes('tavily.com/search'))).toBe(false);
    const reportCall = fake.calls.at(-1)!;
    expect(reportCall.body.model).toBe('gpt-6-luna');
    expect(reportCall.body.input).toContain('State the claim precisely');
    expect(result.costUsd).toBeGreaterThan(0);
  });

  it('searches the web when only a question is given', async () => {
    const {deps} = setup((url, init) => {
      if (url.includes('tavily.com/search')) return {body: {results: [{url: 'https://a.com/1', title: 'A'}, {url: 'https://b.com/2', title: 'B'}]}};
      if (url.includes('tavily.com/extract')) {
        const target = JSON.parse(String(init.body)).urls[0];
        return {body: {results: [{url: target, title: target, raw_content: page}]}};
      }
      if (url.includes('openai.com')) return {body: openaiText('# Answer\n\n**Bottom line:** yes [S1:P1][S2:P1].')};
      throw new Error(`unexpected ${url}`);
    });
    const result = await research({question: 'Is serverless Postgres cheap?'}, deps);
    expect(result.queries).toEqual(['Is serverless Postgres cheap?']);
    expect(result.sources.map(s => s.url)).toEqual(['https://a.com/1', 'https://b.com/2']);
  });

  it('reports videos without captions instead of paying for transcription', async () => {
    const {fake, deps} = setup(url => {
      if (url.includes('supadata.ai')) return {status: 206, body: {error: 'transcript-unavailable'}};
      if (url.includes('openai.com')) return {body: openaiText('# R\n\n**Bottom line:** from the file [S1:P1].')};
      throw new Error(`unexpected ${url}`);
    });
    const result = await research({
      question: 'What does the video say?',
      links: ['https://www.youtube.com/watch?v=0BDi0d1j7u0'],
      uploads: [{name: 'notes.md', text: page}],
      webSearch: false,
    }, deps);
    const video = result.checklist.find(c => c.url?.includes('youtube'))!;
    expect(video.status).toBe('unavailable');
    expect(video.reason).toMatch(/no captions/);
    expect(fake.calls.filter(c => c.url.includes('supadata')).every(c => c.url.includes('mode=native'))).toBe(true);
  });

  it('reads native captions with timestamps', async () => {
    const {deps} = setup(url => {
      if (url.includes('supadata.ai')) return {body: {lang: 'en', content: [{text: 'Hello world', offset: 0, duration: 1000}, {text: 'later point', offset: 125_000, duration: 1000}]}};
      if (url.includes('openai.com')) return {body: openaiText('# R\n\nok [S1:P2].')};
      throw new Error(`unexpected ${url}`);
    });
    const result = await research({question: 'Summarise', links: ['https://youtu.be/0BDi0d1j7u0'], webSearch: false}, deps);
    expect(result.sources[0].kind).toBe('video');
    expect(result.sources[0].passages.map(p => p.locator)).toEqual(['0:00', '2:05']);
  });

  it('on a rerun, sends the previous report for comparison but not as evidence', async () => {
    const {fake, deps} = setup(url => {
      if (url.includes('openai.com')) return {body: openaiText('# R\n\n**Bottom line:** same [S1:P1].\n\n## What changed since the last version\nNothing material.')};
      throw new Error(`unexpected ${url}`);
    });
    await research({question: 'Q', uploads: [{name: 'n.md', text: page}], webSearch: false,
      previous: {markdown: '# Old report', generatedAt: '2026-07-01T00:00:00Z'}}, deps);
    const body = fake.calls.at(-1)!.body;
    expect(body.instructions).toContain('What changed since the last version');
    expect(JSON.parse(body.input).previousReport.markdown).toBe('# Old report');
  });

  it('refuses to write a report with no readable evidence', async () => {
    const {deps} = setup(() => ({status: 500, body: {}}));
    await expect(research({question: 'Q', links: ['https://example.com/x'], webSearch: false}, deps)).rejects.toThrow(/None of the sources/);
  });

  it('stops paid calls once the per-run cap is reached', async () => {
    const {deps} = setup(url => {
      if (url.includes('tavily.com/extract')) return {body: {results: [{url: 'https://example.com/a', raw_content: page}]}};
      throw new Error(`unexpected ${url}`);
    }, 0.009);
    await expect(research({question: 'Q', links: ['https://example.com/a', 'https://example.com/b'], webSearch: false}, deps))
      .rejects.toThrow(/run_cap_reached/);
  });
});
