'use client';

import {useState} from 'react';
import {marked} from 'marked';
import {SEED_CARDS} from '@/lib/cards';
import type {ResearchResult, Upload} from '@/lib/research';

const READABLE = /\.(txt|md|markdown|csv|json|html?)$/i;

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

export default function ResearchPage() {
  const [question, setQuestion] = useState('');
  const [links, setLinks] = useState('');
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [cardId, setCardId] = useState<string | null>(null);
  const [model, setModel] = useState<'openai' | 'anthropic'>('openai');
  const [webSearch, setWebSearch] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ResearchResult | null>(null);

  async function addFiles(files: FileList | null) {
    if (!files) return;
    const next: Upload[] = [];
    for (const file of Array.from(files)) {
      if (!READABLE.test(file.name)) {
        setError(`${file.name}: only text files are supported for now (PDF and Word are coming).`);
        continue;
      }
      next.push({name: file.name, text: await file.text()});
    }
    setUploads(current => [...current, ...next].slice(0, 5));
  }

  async function run() {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const response = await fetch('/api/research', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({question, links: links.split(/\s+/).filter(Boolean), uploads, cardId, model, webSearch}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Research failed');
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>Research</h1>

      <label htmlFor="question">Question</label>
      <textarea id="question" rows={4} value={question} onChange={e => setQuestion(e.target.value)}
        placeholder="Type or dictate your question" />

      <label htmlFor="links">Links <span className="hint">articles or YouTube, one per line</span></label>
      <textarea id="links" rows={3} value={links} onChange={e => setLinks(e.target.value)} />

      <label htmlFor="files">Files <span className="hint">text or Markdown for now</span></label>
      <input id="files" type="file" multiple onChange={e => addFiles(e.target.files)} />
      {uploads.length > 0 && <ul className="files">{uploads.map(u => <li key={u.name}>{u.name}</li>)}</ul>}

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
        <button className="primary" disabled={busy || !question.trim()} onClick={run}>
          {busy ? 'Researching…' : 'Research'}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {result && (
        <article className="report">
          <div dangerouslySetInnerHTML={{__html: renderReport(result)}} />
          <ol className="sources">
            {result.sources.map(source => (
              <li key={source.id} id={`src-${source.id}`}>
                {source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a> : source.title}
                {source.truncated && <span className="hint"> (excerpts)</span>}
              </li>
            ))}
          </ol>
          {result.checklist.filter(c => c.status !== 'read').map(c => (
            <p key={c.label} className="unavailable">Not used: {c.label}: {c.reason}</p>
          ))}
          {result.unknownCitations.length > 0 && (
            <p className="unavailable">Warning: the report cited passages that don’t exist ({result.unknownCitations.join(', ')}).</p>
          )}
          <p className="meta">{result.model} · ${result.costUsd.toFixed(3)} · {new Date(result.generatedAt).toLocaleString()}</p>
        </article>
      )}
    </main>
  );
}
