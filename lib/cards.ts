// Seed cards (VIC-423). Each card is a short brief that steers the research.
// Draft wording: Vic confirms or edits these, and they become editable in the app.
export interface Card {
  id: string;
  name: string;
  summary: string;
  brief: string;
}

export const SEED_CARDS: Card[] = [
  {
    id: 'assess-fit',
    name: 'Assess fit',
    summary: 'Is this partner, company or use case worth pursuing?',
    brief: `Assess whether the opportunity is worth pursuing. Describe what the company or option actually offers and what it publicly prioritises. Explain the value mechanism: who gains what, and what has to be true. Check whether existing capabilities already cover the need. End with a clear go, no-go or "need more evidence", the strongest reason against, and the smallest next step that would settle it.`,
  },
  {
    id: 'compare',
    name: 'Compare and choose',
    summary: 'Weigh two or more options and recommend one.',
    brief: `Compare the options on the few criteria that matter most for this decision (state them). Use a short table if it helps. Note where evidence is uneven between options. Recommend one, say under what conditions the answer would flip, and flag anything that could not be verified.`,
  },
  {
    id: 'check-claim',
    name: 'Check a claim',
    summary: 'Is this claim or assumed need actually true?',
    brief: `State the claim precisely, then test it against the evidence. Separate what is documented, what is a vendor or author claim, and what is assumed. Give a verdict (supported, partly supported, unsupported, or unclear) and the evidence that would change it.`,
  },
  {
    id: 'explain',
    name: 'Explain or brief',
    summary: 'Explain a topic clearly for a specific audience.',
    brief: `Explain the topic for the audience named in the question (default: a smart non-specialist executive). Lead with the one-paragraph answer, then how it works, one concrete example from the sources, and what it does not cover. Avoid jargon unless the audience needs it.`,
  },
];

export function findCard(id: string | undefined | null, cards: Card[] = SEED_CARDS): Card | undefined {
  return id ? cards.find(card => card.id === id) : undefined;
}
