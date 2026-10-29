// Turns extracted pages, captions and uploads into numbered passages the model
// can cite. Selection keeps the opening plus the passages that best match the
// question, presented in source order. Ported from the old M0 runner.
export type Origin = 'link' | 'upload' | 'discovered';

export interface Passage {
  id: string; // e.g. "S2:P3"
  text: string;
  locator: string; // "¶4" or "12:31"
}

export interface Source {
  id: string; // e.g. "S2"
  url: string | null;
  title: string;
  origin: Origin;
  kind: 'page' | 'video' | 'file';
  truncated: boolean;
  passages: Passage[];
}

const STOP_WORDS = new Set(('a an and are as at be been but by can could did do does for from had has have how i if in into is it its may ' +
  'more most not of on or our should so some than that the their them then there these they this those to use using was we were what ' +
  'when where which who why will with would you your').split(' '));

function terms(text: string): string[] {
  return (text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []).filter(t => !STOP_WORDS.has(t));
}

function splitLong(text: string, maxChars = 900): string[] {
  if (text.length <= maxChars) return [text];
  const parts: string[] = [];
  let rest = text;
  while (rest.length > maxChars) {
    let cut = rest.lastIndexOf('. ', maxChars);
    if (cut < maxChars / 2) cut = maxChars;
    parts.push(rest.slice(0, cut + 1));
    rest = rest.slice(cut + 1);
  }
  if (rest.trim()) parts.push(rest);
  return parts;
}

export function formatTimestamp(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0'), ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

interface Chunk { text: string; locator: string }

export function textChunks(text: string): Chunk[] {
  return text.split(/\n\s*\n/).flatMap((paragraph, i) =>
    splitLong(paragraph.trim()).filter(Boolean).map(part => ({text: part, locator: `¶${i + 1}`})));
}

/** Group caption segments into ~60-second chunks so timestamps stay useful. */
export function captionChunks(segments: {text: string; offset: number}[]): Chunk[] {
  const chunks: Chunk[] = [];
  let current: {text: string[]; start: number} | null = null;
  for (const segment of segments) {
    if (!current || segment.offset - current.start >= 60_000) {
      if (current) chunks.push({text: current.text.join(' '), locator: formatTimestamp(current.start)});
      current = {text: [], start: segment.offset};
    }
    current.text.push(segment.text);
  }
  if (current) chunks.push({text: current.text.join(' '), locator: formatTimestamp(current.start)});
  return chunks.flatMap(c => splitLong(c.text).map(text => ({text, locator: c.locator})));
}

export function makeSource(index: number, input: {
  url: string | null; title: string; origin: Origin; kind: Source['kind']; chunks: Chunk[]; focus: string; maxChars?: number;
}): Source {
  const id = `S${index}`;
  const maxChars = input.maxChars ?? 6000;
  const readable = input.chunks.map((chunk, index) => ({...chunk, index})).filter(c => c.text.trim());
  const queryTerms = new Set(terms(input.focus));
  const sets = readable.map(c => new Set(terms(c.text)));
  const weight = (t: string) => 1 + Math.log((readable.length + 1) / (1 + sets.filter(s => s.has(t)).length));
  const raw = sets.map(s => [...queryTerms].reduce((sum, t) => sum + (s.has(t) ? weight(t) : 0), 0));
  const hasMatch = raw.some(s => s > 0);
  const ranked = readable
    .map((chunk, i) => ({...chunk, score: Math.max(raw[i], (raw[i - 1] || 0) * 0.35, (raw[i + 1] || 0) * 0.35)}))
    .sort((a, b) => hasMatch ? b.score - a.score || a.index - b.index : a.index - b.index);
  const selected = new Map<number, Chunk & {index: number}>();
  let used = 0;
  const take = (chunk?: Chunk & {index: number}) => {
    if (!chunk || selected.has(chunk.index) || used + chunk.text.length > maxChars) return;
    used += chunk.text.length;
    selected.set(chunk.index, chunk);
  };
  take(readable[0]);
  for (const chunk of ranked) take(chunk);
  const passages = [...selected.values()].sort((a, b) => a.index - b.index)
    .map((chunk, i) => ({id: `${id}:P${i + 1}`, text: chunk.text, locator: chunk.locator}));
  if (!passages.length) throw new Error('No readable text in this source');
  return {id, url: input.url, title: input.title, origin: input.origin, kind: input.kind,
    truncated: selected.size < readable.length, passages};
}
