'use client';

import {useState} from 'react';

/** Thumbs up or down on one run. This is the signal the cards learn from. */
export function Feedback({runId}: {runId: string}) {
  const [rating, setRating] = useState<1 | -1 | null>(null);
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function submit(value: 1 | -1, text = note) {
    setRating(value);
    setError('');
    try {
      const response = await fetch('/api/feedback', {method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({runId, rating: value, note: text})});
      if (!response.ok) throw new Error((await response.json()).error || 'Could not save feedback');
      setSent(true);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  return (
    <div className="feedback">
      <span className="meta">Was this useful?</span>
      <button className="secondary" aria-pressed={rating === 1} onClick={() => submit(1)}>👍</button>
      <button className="secondary" aria-pressed={rating === -1} onClick={() => submit(-1)}>👎</button>
      {rating !== null && (
        <>
          <input type="text" placeholder="What would have made it better? (optional)" value={note}
            onChange={e => { setNote(e.target.value); setSent(false); }} />
          <button className="link" onClick={() => submit(rating)}>{sent && note ? 'Saved' : 'Save note'}</button>
        </>
      )}
      {error && <span className="error">{error}</span>}
    </div>
  );
}
