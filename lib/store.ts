// Saved research. A rerun is saved as a new version that points at the
// original, so the history of a topic stays together.
import {neon} from '@neondatabase/serverless';
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

export function neonStore(databaseUrl: string): Store {
  const sql = neon(databaseUrl);
  let ready: Promise<unknown> | null = null;
  const init = () => (ready ??= sql.query(SCHEMA)
    .then(() => sql.query('create index if not exists research_topic on research (topic_id, created_at)'))
    .then(() => sql.query(SPEND_SCHEMA)));

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
  };
}

/** In-memory store for tests and for local development without a database. */
export function memoryStore(): Store {
  const items: SavedResearch[] = [];
  const spend: {at: Date; usd: number}[] = [];
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
  };
}

let shared: Store | null = null;
export function getStore(): Store {
  if (!shared) shared = process.env.DATABASE_URL ? neonStore(process.env.DATABASE_URL) : memoryStore();
  return shared;
}
