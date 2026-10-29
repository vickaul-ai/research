'use client';

import {useEffect, useState} from 'react';
import {marked} from 'marked';
import {SEED_CARDS, findCard} from '@/lib/cards';
import type {ResearchResult, Upload} from '@/lib/research';
import type {SavedInput, SavedResearch, SavedSummary} from '@/lib/store';

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Reports are written from untrusted web content: show any raw HTML as text.
marked.use({renderer: {
  html: ({text}) => escapeHtml(text),
  link: ({href, text}) => /^https?:\/\//i.test(href)
    ? `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${escapeHtml(text)}</a>`
    : escapeHtml(text),
  image: ({text}) => escapeHtml(text),
}});

function renderReport(result: ResearchResult): string {
  const html = marked.parse(result.markdown, {async: false}) as string;
  // Turn [S1:P2] markers into small links to the source list.
  return html.replace(/\[(S\d+):(P\d+)\]/g, (_, s, p) => `<a class="cite" href="#src-${s}" title="${s} ${p}">${s.slice(1)}</a>`);
}

const formatDate = (iso: string) => new Date(iso).toLocaleString(undefined, {dateStyle: 'medium', timeStyle: 'short'});

type Opened = SavedResearch & {versions: SavedSummary[]};

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export default function ResearchPage() {
  const [question, setQuestion] = useState('');
  const [links, setLinks] = useState('');
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [cardId, setCardId] = useState<string | null>(null);
  const [model, setModel] = useState<'openai' | 'anthropic'>('openai');
  const [webSearch, setWebSearch] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  // A fresh, unsaved result and the input that produced it.
  const [draft, setDraft] = useState<{input: SavedInput; result: ResearchResult} | null>(null);
  // A saved research item being viewed.
  const [opened, setOpened] = useState<Opened | null>(null);

  const [spend, setSpend] = useState<{spentUsd: number; monthlyCapUsd: number} | null>(null);
  const [saved, setSaved] = useState<SavedSummary[]>([]);
  const [search, setSearch] = useState('');

  async function refreshSaved(query = search) {
    try { setSaved(await call<SavedSummary[]>(`/api/saved${query ? `?q=${encodeURIComponent(query)}` : ''}`)); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  async function refreshSpend() {
    try { setSpend(await call('/api/spend')); } catch { /* the header just omits it */ }
  }
  useEffect(() => { refreshSaved(''); refreshSpend(); }, []);

  async function work(label: string, task: () => Promise<void>) {
    setBusy(label);
    setError('');
    try { await task(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(''); refreshSpend(); }
  }

  const addFiles = (files: FileList | null) => work('Reading files…', async () => {
    if (!files) return;
    const next: Upload[] = [];
    const problems: string[] = [];
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append('file', file);
      try { next.push(await call<Upload>('/api/files', {method: 'POST', body: form})); }
      catch (e) { problems.push(e instanceof Error ? e.message : String(e)); }
    }
    setUploads(current => [...current, ...next].slice(0, 5));
    if (problems.length) throw new Error(problems.join(' '));
  });

  const run = () => work('Researching…', async () => {
    const input: SavedInput = {question, links: links.split(/\s+/).filter(Boolean), uploads, cardId, model, webSearch};
    setOpened(null);
    setDraft(null);
    const result = await call<ResearchResult>('/api/research', {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(input),
    });
    setDraft({input, result});
  });

  const save = () => work('Saving…', async () => {
    if (!draft) return;
    const item = await call<SavedResearch>('/api/saved', {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(draft),
    });
    setDraft(null);
    setOpened({...item, versions: [{id: item.id, topicId: item.topicId, createdAt: item.createdAt, title: item.title,
      question: item.input.question, cardId: item.input.cardId, versions: 1}]});
    await refreshSaved();
  });

  const open = (id: string) => work('Opening…', async () => {
    setDraft(null);
    setOpened(await call<Opened>(`/api/saved/${id}`));
    window.scrollTo({top: 0, behavior: 'smooth'});
  });

  const rerun = () => work('Rerunning with fresh sources…', async () => {
    if (!opened) return;
    setOpened(await call<Opened>(`/api/saved/${opened.id}/rerun`, {method: 'POST'}));
    await refreshSaved();
  });

  const remove = () => work('Deleting…', async () => {
    if (!opened) return;
    const count = opened.versions.length;
    if (!window.confirm(`Delete "${opened.title}"${count > 1 ? ` and all ${count} versions` : ''}? This can't be undone.`)) return;
    await call(`/api/saved/${opened.id}`, {method: 'DELETE'});
    setOpened(null);
    await refreshSaved();
  });

  function startFrom(input: SavedInput) {
    setQuestion(input.question);
    setLinks(input.links.join('\n'));
    setUploads(input.uploads);
    setCardId(input.cardId);
    setModel(input.model);
    setWebSearch(input.webSearch);
    setOpened(null);
    window.scrollTo({top: 0, behavior: 'smooth'});
  }

  const shown = opened?.result ?? draft?.result;

  return (
    <main>
      <header className="top">
        <h1>Research</h1>
        {spend && <span className="meta">This month: ${spend.spentUsd.toFixed(2)} of ${spend.monthlyCapUsd.toFixed(0)}</span>}
      </header>

      <label htmlFor="question">Question</label>
      <textarea id="question" rows={4} value={question} onChange={e => setQuestion(e.target.value)}
        placeholder="Type or dictate your question" />

      <label htmlFor="links">Links <span className="hint">articles or YouTube, one per line</span></label>
      <textarea id="links" rows={3} value={links} onChange={e => setLinks(e.target.value)} />

      <label htmlFor="files">Files <span className="hint">PDF, Word, text or Markdown, up to 4 MB each</span></label>
      <input id="files" type="file" multiple accept=".pdf,.docx,.txt,.md,.markdown,.csv,.json,.html,.htm"
        onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
      {uploads.length > 0 && (
        <ul className="files">
          {uploads.map(u => (
            <li key={u.name}>{u.name} <button className="link" onClick={() => setUploads(uploads.filter(x => x !== u))}>remove</button></li>
          ))}
        </ul>
      )}

      <label>Card <span className="hint">optional, steers the research</span></label>
      <div className="cards">
        {SEED_CARDS.map(card => (
          <button key={card.id} type="button" className="card" aria-pressed={cardId === card.id}
            onClick={() => setCardId(cardId === card.id ? null : card.id)}>
            <strong>{card.name}</strong>
            <span>{card.summary}</span>
          </button>
        ))}
      </div>

      <div className="row">
        <label><input type="radio" checked={model === 'openai'} onChange={() => setModel('openai')} /> GPT-6 Luna</label>
        <label><input type="radio" checked={model === 'anthropic'} onChange={() => setModel('anthropic')} /> Claude Haiku</label>
        <label><input type="checkbox" checked={webSearch} onChange={e => setWebSearch(e.target.checked)} /> Search the web too</label>
        <button className="primary" disabled={!!busy || !question.trim()} onClick={run}>Research</button>
      </div>

      {busy && <p className="meta">{busy}</p>}
      {error && <p className="error">{error}</p>}

      {shown && (
        <article className="report">
          <div className="actions">
            {draft && <button className="primary" disabled={!!busy} onClick={save}>Save</button>}
            {opened && <>
              <button className="primary" disabled={!!busy} onClick={rerun}>Rerun with fresh sources</button>
              <button className="secondary" disabled={!!busy} onClick={() => startFrom(opened.input)}>Edit and run as new</button>
              <button className="danger" disabled={!!busy} onClick={remove}>Delete</button>
            </>}
          </div>
          {opened && opened.versions.length > 1 && (
            <p className="meta">
              Versions:{' '}
              {opened.versions.map((v, i) => (
                <span key={v.id}>
                  {i > 0 && ' · '}
                  {v.id === opened.id ? <strong>{formatDate(v.createdAt)}</strong>
                    : <button className="link" onClick={() => open(v.id)}>{formatDate(v.createdAt)}</button>}
                </span>
              ))}
            </p>
          )}
          <div dangerouslySetInnerHTML={{__html: renderReport(shown)}} />
          <ol className="sources">
            {shown.sources.map(source => (
              <li key={source.id} id={`src-${source.id}`}>
                {source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a> : source.title}
                {source.truncated && <span className="hint"> (excerpts)</span>}
              </li>
            ))}
          </ol>
          {shown.checklist.filter(c => c.status !== 'read').map(c => (
            <p key={c.label} className="unavailable">Not used: {c.label}: {c.reason}</p>
          ))}
          {shown.unknownCitations.length > 0 && (
            <p className="unavailable">Warning: the report cited passages that don’t exist ({shown.unknownCitations.join(', ')}).</p>
          )}
          <p className="meta">
            {(opened ? findCard(opened.input.cardId)?.name : findCard(draft?.input.cardId)?.name) ?? 'No card'} · {shown.model} · ${shown.costUsd.toFixed(3)} · {formatDate(shown.generatedAt)}
          </p>
        </article>
      )}

      <section className="saved">
        <h2>Saved research</h2>
        <input type="text" placeholder="Search saved research" value={search}
          onChange={e => { setSearch(e.target.value); refreshSaved(e.target.value); }} />
        {saved.length === 0 && <p className="meta">Nothing saved yet.</p>}
        <ul>
          {saved.map(item => (
            <li key={item.topicId}>
              <button className="link" onClick={() => open(item.id)}>{item.title}</button>
              <span className="meta"> · {formatDate(item.createdAt)}{item.versions > 1 ? ` · ${item.versions} versions` : ''}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
