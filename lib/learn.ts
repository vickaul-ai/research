// Reviews recent runs and turns them into card proposals Vic can accept.
import {DEFAULT_MODEL, MODELS} from './models';
import {MIN_RUNS, Proposal, proposeCardChanges} from './proposals';
import {CostMeter, createProviders} from './providers';
import {spendStatus} from './run';
import {getStore, Store} from './store';

const REVIEW_CAP_USD = 0.05;

export type ReviewOutcome =
  | {status: 'skipped'; runsSince: number; needed: number}
  | {status: 'reviewed'; runsSince: number; proposals: Proposal[]; costUsd: number};

/** Review cards once enough new runs have accumulated. `force` lowers the bar to 3 runs. */
export async function reviewCards({store = getStore(), force = false, fetchImpl = fetch}: {store?: Store; force?: boolean; fetchImpl?: typeof fetch} = {}): Promise<ReviewOutcome> {
  const last = await store.lastReviewAt();
  const recent = await store.listRuns(200);
  const runsSince = recent.filter(r => !last || new Date(r.createdAt) > last).length;
  const needed = force ? 3 : MIN_RUNS;
  if (runsSince < needed) return {status: 'skipped', runsSince, needed};

  const {remainingUsd} = await spendStatus(store);
  if (remainingUsd < REVIEW_CAP_USD) throw new Error("This month's budget is used up, so the card review was skipped.");
  const model = MODELS[DEFAULT_MODEL];
  const meter = new CostMeter(REVIEW_CAP_USD);
  const providers = createProviders({model, meter, fetchImpl, keys: {openai: process.env.OPENAI_API_KEY, anthropic: process.env.ANTHROPIC_API_KEY}});
  try {
    const proposals = await proposeCardChanges(await store.listCards(), recent, providers);
    const saved = await store.recordReview(runsSince, proposals);
    return {status: 'reviewed', runsSince, proposals: saved, costUsd: meter.total};
  } finally {
    if (meter.total > 0) await store.recordSpend(meter.total, model.id);
  }
}

/** Accept or reject a pending proposal. Accepting applies it to the cards. */
export async function decideProposal(id: string, accept: boolean, store: Store = getStore()): Promise<Proposal> {
  const pending = (await store.listProposals('pending')).find(p => p.id === id);
  if (!pending) throw new Error('That proposal was already decided or does not exist');
  if (accept) {
    const cards = await store.listCards();
    const missing = pending.targetIds.filter(t => !cards.some(c => c.id === t));
    if (missing.length) throw new Error('A card this proposal changes has since been edited away; reject it and run a new review');
    if (pending.kind === 'update' || pending.kind === 'add') await store.saveCard(pending.card!);
    if (pending.kind === 'merge') {
      await store.saveCard(pending.card!);
      for (const target of pending.targetIds) await store.archiveCard(target);
    }
    if (pending.kind === 'hide') await store.archiveCard(pending.targetIds[0]);
  }
  const decided = await store.setProposalStatus(id, accept ? 'accepted' : 'rejected');
  if (!decided) throw new Error('That proposal was already decided');
  return decided;
}
