// Saved research. A rerun is saved as a new version that points at the
// original, so the history of a topic stays together.
import {neon} from '@neondatabase/serverless';
import {Card, SEED_CARDS} from './cards';
import type {ResearchResult, Upload} from './research';

export interface SavedInput {
  question: string;
  links: string[];
  uploads: Upload[];
  cardId: string | null;
  model: 'openai' | 'anthropic';
  webSearch: boolean;
}

export interface SavedResearch {
  id: string;
  topicId: string; // id of the first version
  createdAt: string;
  title: string;
  input: SavedInput;
  result: ResearchResult;
}

export interface SavedSummary {
  id: string;
  topicId: string;
  createdAt: string;
  title: string;
  question: string;
  cardId: string | null;
  versions: number;
}

export interface Store {
  save(input: SavedInput, result: ResearchResult, topicId?: string): Promise<SavedResearch>;
  list(query?: string): Promise<SavedSummary[]>;
  get(id: string): Promise<SavedResearch | null>;
  versions(topicId: string): Promise<SavedSummary[]>;
  deleteTopic(topicId: string): Promise<number>;
  /** Spend log for the monthly cap: every run is recorded, saved or not. */
  recordSpend(usd: number, model: string): Promise<void>;
  spendSince(since: Date): Promise<number>;
  /** Cards Vic can edit. Seeded with SEED_CARDS the first time. */
  listCards(): Promise<Card[]>;
  saveCard(card: Card): Promise<Card>;
  archiveCard(id: string): Promise<boolean>;
  /** One row per research run, for learning which cards work (VIC-431). */
  logRun(run: Omit<RunLog, 'createdAt' | 'rating' | 'note'>): Promise<void>;
  rateRun(id: string, rating: 1 | -1, note: string): Promise<boolean>;
  listRuns(limit?: number): Promise<RunLog[]>;
}

export interface RunLog {
  id: string;
  createdAt: string;
  question: string;
  cardId: string | null;
  cardName: string | null;
  cardBrief: string | null;
  model: string;
  costUsd: number;
  rating: 1 | -1 | null;
  note: string | null;
}

const SCHEMA = `create table if not exists research (
  id uuid primary key,
  topic_id uuid not null,
  created_at timestamptz not null default now(),
  title text not null,
  question text not null,
  card_id text,
  input jsonb not null,
  result jsonb not null
)`;

const SPEND_SCHEMA = `create table if not exists spend (
  created_at timestamptz not null default now(),
  usd numeric not null,
  model text not null
)`;

const CARD_SCHEMA = `create table if not exists cards (
  id text primary key,
  name text not null,
  summary text not null,
  brief text not null,
  position int not null default 0,
  archived boolean not null default false,
  updated_at timestamptz not null default now()
)`;

const RUN_SCHEMA = `create table if not exists runs (
  id uuid primary key,
  created_at timestamptz not null default now(),
  question text not null,
  card_id text,
  card_name text,
  card_brief text,
  model text not null,
  cost_usd numeric not null,
  rating smallint,
  note text
)`;

export function validCard(card: any): Card {
  const text = (value: unknown, max: number, label: string) => {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`Card ${label} is required`);
    if (value.length > max) throw new Error(`Card ${label} is too long (${max} characters max)`);
    return value.trim();
  };
  const id = typeof card?.id === 'string' && /^[a-z0-9-]{1,60}$/.test(card.id) ? card.id : null;
  const name = text(card?.name, 60, 'name');
  return {
    id: id ?? (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'card') + '-' + Math.random().toString(36).slice(2, 6),
    name,
    summary: text(card?.summary, 160, 'summary'),
    brief: text(card?.brief, 2000, 'brief'),
  };
}

export function neonStore(databaseUrl: string): Store {
  const sql = neon(databaseUrl);
  let ready: Promise<unknown> | null = null;
  const init = () => (ready ??= sql.query(SCHEMA)
    .then(() => sql.query('create index if not exists research_topic on research (topic_id, created_at)'))
    .then(() => sql.query(SPEND_SCHEMA))
    .then(() => sql.query(CARD_SCHEMA))
    .then(() => sql.query(RUN_SCHEMA)));
  const runLog = (row: any): RunLog => ({
    id: row.id, createdAt: new Date(row.created_at).toISOString(), question: row.question, cardId: row.card_id,
    cardName: row.card_name, cardBrief: row.card_brief, model: row.model, costUsd: Number(row.cost_usd),
    rating: row.rating === null ? null : Number(row.rating) as 1 | -1, note: row.note,
  });

  const summary = (row: any): SavedSummary => ({
    id: row.id, topicId: row.topic_id, createdAt: new Date(row.created_at).toISOString(), title: row.title,
    question: row.question, cardId: row.card_id, versions: Number(row.versions ?? 1),
  });

  return {
    async save(input, result, topicId) {
      await init();
      const id = crypto.randomUUID();
      const rows = await sql.query(
        `insert into research (id, topic_id, title, question, card_id, input, result)
         values ($1, $2, $3, $4, $5, $6, $7) returning created_at`,
        [id, topicId ?? id, result.title, input.question, input.cardId, JSON.stringify(input), JSON.stringify(result)],
      );
      return {id, topicId: topicId ?? id, createdAt: new Date(rows[0].created_at).toISOString(), title: result.title, input, result};
    },

    async list(query) {
      await init();
      // Latest version of each topic, newest first.
      const rows = await sql.query(
        `select distinct on (topic_id) id, topic_id, created_at, title, question, card_id,
           count(*) over (partition by topic_id) as versions
         from research
         where $1::text is null or title ilike '%' || $1 || '%' or question ilike '%' || $1 || '%'
         order by topic_id, created_at desc`,
        [query?.trim() || null],
      );
      return rows.map(summary).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async get(id) {
      await init();
      const rows = await sql.query('select * from research where id = $1', [id]);
      const row = rows[0];
      return row ? {id: row.id, topicId: row.topic_id, createdAt: new Date(row.created_at).toISOString(),
        title: row.title, input: row.input, result: row.result} : null;
    },

    async versions(topicId) {
      await init();
      const rows = await sql.query('select id, topic_id, created_at, title, question, card_id from research where topic_id = $1 order by created_at desc', [topicId]);
      return rows.map(summary);
    },

    async deleteTopic(topicId) {
      await init();
      const rows = await sql.query('delete from research where topic_id = $1 returning id', [topicId]);
      return rows.length;
    },

    async recordSpend(usd, model) {
      await init();
      await sql.query('insert into spend (usd, model) values ($1, $2)', [usd, model]);
    },

    async spendSince(since) {
      await init();
      const rows = await sql.query('select coalesce(sum(usd), 0) as total from spend where created_at >= $1', [since.toISOString()]);
      return Number(rows[0].total);
    },

    async listCards() {
      await init();
      let rows = await sql.query('select id, name, summary, brief from cards where not archived order by position, updated_at');
      if (!rows.length) {
        const existing = await sql.query('select count(*) as n from cards');
        if (Number(existing[0].n) === 0) {
          for (const [i, card] of SEED_CARDS.entries()) {
            await sql.query('insert into cards (id, name, summary, brief, position) values ($1, $2, $3, $4, $5) on conflict do nothing',
              [card.id, card.name, card.summary, card.brief, i]);
          }
          rows = await sql.query('select id, name, summary, brief from cards where not archived order by position, updated_at');
        }
      }
      return rows.map((r: any) => ({id: r.id, name: r.name, summary: r.summary, brief: r.brief}));
    },

    async saveCard(input) {
      await init();
      const card = validCard(input);
      await sql.query(
        `insert into cards (id, name, summary, brief, position) values ($1, $2, $3, $4, (select coalesce(max(position), 0) + 1 from cards))
         on conflict (id) do update set name = excluded.name, summary = excluded.summary, brief = excluded.brief, archived = false, updated_at = now()`,
        [card.id, card.name, card.summary, card.brief],
      );
      return card;
    },

    async archiveCard(id) {
      await init();
      const rows = await sql.query('update cards set archived = true, updated_at = now() where id = $1 returning id', [id]);
      return rows.length > 0;
    },

    async logRun(run) {
      await init();
      await sql.query(
        'insert into runs (id, question, card_id, card_name, card_brief, model, cost_usd) values ($1, $2, $3, $4, $5, $6, $7)',
        [run.id, run.question, run.cardId, run.cardName, run.cardBrief, run.model, run.costUsd],
      );
    },

    async rateRun(id, rating, note) {
      await init();
      const rows = await sql.query('update runs set rating = $2, note = $3 where id = $1 returning id', [id, rating, note || null]);
      return rows.length > 0;
    },

    async listRuns(limit = 200) {
      await init();
      const rows = await sql.query('select * from runs order by created_at desc limit $1', [limit]);
      return rows.map(runLog);
    },
  };
}

/** In-memory store for tests and for local development without a database. */
export function memoryStore(): Store {
  const items: SavedResearch[] = [];
  const spend: {at: Date; usd: number}[] = [];
  type StoredCard = Card & {archived?: boolean};
  let cards: StoredCard[] | null = null;
  const seed = (): StoredCard[] => SEED_CARDS.map(card => ({...card}));
  const runs: RunLog[] = [];
  const toSummary = (item: SavedResearch): SavedSummary => ({
    id: item.id, topicId: item.topicId, createdAt: item.createdAt, title: item.title, question: item.input.question,
    cardId: item.input.cardId, versions: items.filter(i => i.topicId === item.topicId).length,
  });
  let clock = 0;
  return {
    async save(input, result, topicId) {
      const id = crypto.randomUUID();
      const item = {id, topicId: topicId ?? id, createdAt: new Date(Date.now() + clock++).toISOString(), title: result.title, input, result};
      items.push(item);
      return item;
    },
    async list(query) {
      const q = query?.trim().toLowerCase();
      const latest = new Map<string, SavedResearch>();
      for (const item of items) {
        const current = latest.get(item.topicId);
        if (!current || item.createdAt > current.createdAt) latest.set(item.topicId, item);
      }
      return [...latest.values()]
        .filter(item => !q || item.title.toLowerCase().includes(q) || item.input.question.toLowerCase().includes(q))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(toSummary);
    },
    async get(id) {
      return items.find(i => i.id === id) ?? null;
    },
    async versions(topicId) {
      return items.filter(i => i.topicId === topicId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(toSummary);
    },
    async deleteTopic(topicId) {
      const before = items.length;
      for (let i = items.length - 1; i >= 0; i--) if (items[i].topicId === topicId) items.splice(i, 1);
      return before - items.length;
    },
    async recordSpend(usd) {
      spend.push({at: new Date(), usd});
    },
    async spendSince(since) {
      return spend.filter(s => s.at >= since).reduce((sum, s) => sum + s.usd, 0);
    },
    async listCards() {
      cards ??= seed();
      return cards.filter(c => !c.archived).map(({archived, ...card}) => card);
    },
    async saveCard(input) {
      cards ??= seed();
      const card = validCard(input);
      const index = cards.findIndex(c => c.id === card.id);
      if (index >= 0) cards[index] = card; else cards.push(card);
      return card;
    },
    async archiveCard(id) {
      const card = (cards ??= seed()).find(c => c.id === id);
      if (card) card.archived = true;
      return !!card;
    },
    async logRun(run) {
      runs.unshift({...run, createdAt: new Date().toISOString(), rating: null, note: null});
    },
    async rateRun(id, rating, note) {
      const run = runs.find(r => r.id === id);
      if (run) Object.assign(run, {rating, note: note || null});
      return !!run;
    },
    async listRuns(limit = 200) {
      return runs.slice(0, limit);
    },
  };
}

let shared: Store | null = null;
export function getStore(): Store {
  if (!shared) shared = process.env.DATABASE_URL ? neonStore(process.env.DATABASE_URL) : memoryStore();
  return shared;
}
