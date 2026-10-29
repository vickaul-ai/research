'use client';

import {useState} from 'react';
import type {Card} from '@/lib/cards';

const BLANK: Card = {id: '', name: '', summary: '', brief: ''};

async function send(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

/** Edit, add or hide cards. Changes apply to future runs only. */
export function CardEditor({cards, onChange}: {cards: Card[]; onChange: () => void}) {
  const [editing, setEditing] = useState<Card | null>(null);
  const [error, setError] = useState('');

  async function save() {
    if (!editing) return;
    setError('');
    try {
      await send('/api/cards', {method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(editing.id ? editing : {...editing, id: undefined})});
      setEditing(null);
      onChange();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  async function hide(card: Card) {
    if (!window.confirm(`Hide the "${card.name}" card? Past research keeps a copy of it.`)) return;
    try { await send(`/api/cards/${card.id}`, {method: 'DELETE'}); onChange(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  if (editing) {
    return (
      <div className="editor">
        <label htmlFor="card-name">Name</label>
        <input id="card-name" type="text" value={editing.name} onChange={e => setEditing({...editing, name: e.target.value})} />
        <label htmlFor="card-summary">One-line summary <span className="hint">shown on the picker</span></label>
        <input id="card-summary" type="text" value={editing.summary} onChange={e => setEditing({...editing, summary: e.target.value})} />
        <label htmlFor="card-brief">Brief <span className="hint">what the research should do</span></label>
        <textarea id="card-brief" rows={6} value={editing.brief} onChange={e => setEditing({...editing, brief: e.target.value})} />
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button className="primary" onClick={save}>Save card</button>
          <button className="secondary" onClick={() => { setEditing(null); setError(''); }}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="editor">
      <ul className="card-list">
        {cards.map(card => (
          <li key={card.id}>
            <strong>{card.name}</strong> <span className="meta">{card.summary}</span>
            <span className="row-actions">
              <button className="link" onClick={() => setEditing(card)}>edit</button>
              <button className="link" onClick={() => hide(card)}>hide</button>
            </span>
          </li>
        ))}
      </ul>
      {error && <p className="error">{error}</p>}
      <button className="secondary" onClick={() => setEditing(BLANK)}>New card</button>
    </div>
  );
}
