'use client';

import {useEffect, useState} from 'react';
import type {Card} from '@/lib/cards';
import type {Proposal} from '@/lib/proposals';

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
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewing, setReviewing] = useState(false);

  async function loadProposals() {
    try { setProposals(await send('/api/cards/proposals', {method: 'GET'})); } catch { /* shown on next action */ }
  }
  useEffect(() => { loadProposals(); }, []);

  async function review() {
    setError('');
    setReviewNote('');
    setReviewing(true);
    try {
      const outcome = await send('/api/cards/proposals', {method: 'POST'});
      if (outcome.status === 'skipped') setReviewNote(`Not enough new runs to learn from yet: ${outcome.runsSince} since the last review, ${outcome.needed} needed.`);
      else setReviewNote(outcome.proposals.length ? `${outcome.proposals.length} suggestion(s) below.` : 'No changes suggested: the cards fit how you have been using them.');
      await loadProposals();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setReviewing(false); }
  }

  async function decide(proposal: Proposal, accept: boolean) {
    setError('');
    try {
      await send(`/api/cards/proposals/${proposal.id}`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({accept})});
      await loadProposals();
      if (accept) onChange();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  const nameOf = (id: string) => cards.find(c => c.id === id)?.name ?? id;
  const describe = (p: Proposal) => p.kind === 'update' ? `Update “${nameOf(p.targetIds[0])}”`
    : p.kind === 'add' ? `Add “${p.card?.name}”`
    : p.kind === 'hide' ? `Hide “${nameOf(p.targetIds[0])}”`
    : `Merge ${p.targetIds.map(id => `“${nameOf(id)}”`).join(' and ')} into “${p.card?.name}”`;

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
      <div className="actions">
        <button className="secondary" onClick={() => setEditing(BLANK)}>New card</button>
        <button className="secondary" disabled={reviewing} onClick={review}>{reviewing ? 'Reviewing…' : 'Suggest improvements'}</button>
      </div>
      {reviewNote && <p className="meta">{reviewNote}</p>}
      {proposals.length > 0 && (
        <ul className="proposals">
          {proposals.map(p => (
            <li key={p.id}>
              <strong>{describe(p)}</strong>
              <p className="meta">{p.reason}</p>
              {p.card && <p className="brief"><em>{p.card.summary}</em><br />{p.card.brief}</p>}
              <div className="actions">
                <button className="primary" onClick={() => decide(p, true)}>Accept</button>
                <button className="secondary" onClick={() => decide(p, false)}>Reject</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
