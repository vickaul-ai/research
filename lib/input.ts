import type {SavedInput} from './store';

/** Normalise a research request body from the page. */
export function parseInput(body: any): SavedInput {
  return {
    question: String(body?.question ?? ''),
    links: Array.isArray(body?.links) ? body.links.map(String).filter(Boolean) : [],
    uploads: Array.isArray(body?.uploads) ? body.uploads.map((u: any) => ({name: String(u?.name), text: String(u?.text)})) : [],
    cardId: typeof body?.cardId === 'string' ? body.cardId : null,
    model: body?.model === 'anthropic' ? 'anthropic' : 'openai',
    webSearch: body?.webSearch !== false,
  };
}
