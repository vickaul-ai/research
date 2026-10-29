import {describe, expect, it, beforeEach} from 'vitest';
import {passwordMatches, sessionToken, validSession} from '@/lib/auth';
import {monthStart, runResearch} from '@/lib/run';
import {memoryStore} from '@/lib/store';

const page = 'Opening.\n\nNeon offers a free tier.';
const fakeFetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const url = String(input);
  if (String(init.body ?? '').includes('timeout.example')) throw new Error('timed out');
  const body = url.includes('openai.com')
    ? {status: 'completed', output: [{type: 'message', content: [{type: 'output_text', text: '# R\n\nYes [S1:P2].'}]}], usage: {input_tokens: 2000, output_tokens: 800}}
    : {};
  return new Response(JSON.stringify(body), {status: url.includes('openai.com') ? 200 : 500});
}) as typeof fetch;

beforeEach(() => { process.env.OPENAI_API_KEY = 'k'; process.env.TAVILY_API_KEY = 'k'; });

describe('spend caps', () => {
  it('records the cost of every run against the month', async () => {
    const store = memoryStore();
    await runResearch({question: 'Q', uploads: [{name: 'n.md', text: page}], webSearch: false}, {store, fetchImpl: fakeFetch});
    expect(await store.spendSince(monthStart())).toBeGreaterThan(0);
  });

  it('records spend even when the run fails', async () => {
    const store = memoryStore();
    await expect(runResearch({question: 'Q', links: ['https://example.com/a', 'https://timeout.example.com/b'], webSearch: false}, {store, fetchImpl: fakeFetch}))
      .rejects.toThrow(/None of the sources/);
    // The HTTP error is not billed; the timed-out extraction might be, so it counts.
    expect(await store.spendSince(monthStart())).toBeCloseTo(0.008);
  });

  it('refuses new runs once the monthly budget is used up', async () => {
    const store = memoryStore();
    await store.recordSpend(25, 'gpt-6-luna');
    await expect(runResearch({question: 'Q', uploads: [{name: 'n.md', text: page}]}, {store, fetchImpl: fakeFetch}))
      .rejects.toThrow(/budget/);
  });

  it('starts the month on the first, UTC', () => {
    expect(monthStart(new Date('2026-10-29T20:00:00Z')).toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });
});

describe('login', () => {
  it('accepts only the right password and its session cookie', () => {
    expect(passwordMatches('secret', 'secret')).toBe(true);
    expect(passwordMatches('wrong', 'secret')).toBe(false);
    expect(validSession(sessionToken('secret'), 'secret')).toBe(true);
    expect(validSession(sessionToken('old'), 'secret')).toBe(false);
    expect(validSession(undefined, 'secret')).toBe(false);
  });
});
