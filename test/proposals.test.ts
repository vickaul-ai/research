import {describe, expect, it, beforeEach} from 'vitest';
import {SEED_CARDS} from '@/lib/cards';
import {decideProposal, reviewCards} from '@/lib/learn';
import {parseProposals} from '@/lib/proposals';
import {memoryStore} from '@/lib/store';

const reply = (proposals: unknown) => (async () => new Response(JSON.stringify({
  status: 'completed', output: [{type: 'message', content: [{type: 'output_text', text: JSON.stringify({proposals})}]}],
  usage: {input_tokens: 3000, output_tokens: 400},
}), {status: 200})) as unknown as typeof fetch;

async function storeWithRuns(n: number) {
  const store = memoryStore();
  for (let i = 0; i < n; i++) {
    await store.logRun({id: crypto.randomUUID(), question: `Q${i}`, cardId: 'compare', cardName: 'Compare and choose', cardBrief: 'b', model: 'gpt-6-luna', costUsd: 0.01});
  }
  return store;
}

beforeEach(() => { process.env.OPENAI_API_KEY = 'k'; });

describe('parsing proposals', () => {
  it('keeps well-formed proposals for real cards and drops the rest', () => {
    const parsed = parseProposals({proposals: [
      {kind: 'update', targetIds: ['compare'], card: {name: 'Compare', summary: 's', brief: 'shorter'}, reason: 'Rated down for length 4/6'},
      {kind: 'hide', targetIds: ['nope'], reason: 'unknown card'},
      {kind: 'merge', targetIds: ['check-claim'], card: {name: 'X', summary: 's', brief: 'b'}, reason: 'needs two'},
      {kind: 'add', card: {name: 'People diligence', summary: 's', brief: 'b'}, reason: '5 runs about people'},
      {kind: 'update', targetIds: ['explain'], card: {name: 'E', summary: 's', brief: 'b'}, reason: ''},
    ]}, SEED_CARDS);
    expect(parsed.map(p => p.kind)).toEqual(['update', 'add']);
    expect(parsed[0].card?.id).toBe('compare');
    expect(parsed[1].targetIds).toEqual([]);
  });
});

describe('card review', () => {
  it('waits for enough new runs', async () => {
    const store = await storeWithRuns(4);
    expect(await reviewCards({store, fetchImpl: reply([])})).toMatchObject({status: 'skipped', runsSince: 4, needed: 10});
    expect(await reviewCards({store, force: true, fetchImpl: reply([])})).toMatchObject({status: 'reviewed', proposals: []});
    // The review resets the count.
    expect(await reviewCards({store, force: true, fetchImpl: reply([])})).toMatchObject({status: 'skipped', runsSince: 0});
  });

  it('stores proposals, applies accepted ones and records the review cost', async () => {
    const store = await storeWithRuns(12);
    const outcome = await reviewCards({store, fetchImpl: reply([
      {kind: 'merge', targetIds: ['compare', 'assess-fit'], card: {name: 'Decide', summary: 'Pick or reject an option.', brief: 'Merged brief.'}, reason: 'Used interchangeably in 8 runs'},
      {kind: 'hide', targetIds: ['explain'], reason: 'Never used'},
    ])});
    expect(outcome.status).toBe('reviewed');
    if (outcome.status !== 'reviewed') return;
    expect(outcome.costUsd).toBeGreaterThan(0);

    const [merge, hide] = outcome.proposals;
    await decideProposal(merge.id, true, store);
    await decideProposal(hide.id, false, store);
    expect((await store.listCards()).map(c => c.name)).toEqual(['Check a claim', 'Explain or brief', 'Decide']);
    expect(await store.listProposals('pending')).toEqual([]);
    await expect(decideProposal(merge.id, true, store)).rejects.toThrow(/already decided/);
  });
});
