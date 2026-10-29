import {describe, expect, it, beforeEach} from 'vitest';
import {SEED_CARDS} from '@/lib/cards';
import {runResearch} from '@/lib/run';
import {memoryStore, validCard} from '@/lib/store';

const fakeFetch = (async (_: RequestInfo | URL, init: RequestInit = {}) => {
  const body = JSON.parse(String(init.body));
  return new Response(JSON.stringify({status: 'completed', output: [{type: 'message', content: [{type: 'output_text', text: '# R\n\nok [S1:P1].'}]}],
    usage: {input_tokens: 100, output_tokens: 100}, echo: body.instructions}), {status: 200});
}) as typeof fetch;

beforeEach(() => { process.env.OPENAI_API_KEY = 'k'; });

describe('cards', () => {
  it('starts with the seed cards and supports edit, add and hide', async () => {
    const store = memoryStore();
    expect((await store.listCards()).map(c => c.id)).toEqual(SEED_CARDS.map(c => c.id));
    await store.saveCard({...SEED_CARDS[0], brief: 'A new brief for assessing fit, long enough to matter.'});
    const added = await store.saveCard({id: '', name: 'People diligence', summary: 'Who is this person?', brief: 'Check their background.'} as any);
    expect(added.id).toMatch(/^people-diligence-/);
    await store.archiveCard(SEED_CARDS[1].id);
    const cards = await store.listCards();
    expect(cards.map(c => c.name)).toEqual(['Assess fit', 'Check a claim', 'Explain or brief', 'People diligence']);
    expect(cards[0].brief).toContain('A new brief');
  });

  it('rejects incomplete cards', () => {
    expect(() => validCard({name: 'x', summary: '', brief: 'b'})).toThrow(/summary/);
    expect(() => validCard({name: 'x'.repeat(61), summary: 's', brief: 'b'})).toThrow(/too long/);
  });
});

describe('run log and feedback', () => {
  it('logs each run with a snapshot of the edited card, and records a rating', async () => {
    const store = memoryStore();
    await store.saveCard({...SEED_CARDS[0], brief: 'Edited brief: always end with a go or no-go.'});
    const result = await runResearch({question: 'Is X a fit?', uploads: [{name: 'n.md', text: 'Some notes.'}], cardId: 'assess-fit', webSearch: false},
      {store, fetchImpl: fakeFetch});
    expect(result.cardName).toBe('Assess fit');
    const [run] = await store.listRuns();
    expect(run).toMatchObject({id: result.runId, question: 'Is X a fit?', cardId: 'assess-fit', cardBrief: 'Edited brief: always end with a go or no-go.', rating: null});
    expect(await store.rateRun(result.runId!, -1, 'Too long')).toBe(true);
    expect((await store.listRuns())[0]).toMatchObject({rating: -1, note: 'Too long'});
    expect(await store.rateRun('missing', 1, '')).toBe(false);
  });
});
