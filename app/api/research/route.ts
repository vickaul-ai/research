import {NextResponse} from 'next/server';
import {runResearch} from '@/lib/run';

// A run reads a handful of sources and makes two model calls; allow up to 5 minutes.
export const maxDuration = 300;

export async function POST(request: Request) {
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({error: 'Invalid request'}, {status: 400}); }
  try {
    const result = await runResearch({
      question: String(body.question ?? ''),
      links: Array.isArray(body.links) ? body.links.map(String) : [],
      uploads: Array.isArray(body.uploads) ? body.uploads.map((u: any) => ({name: String(u.name), text: String(u.text)})) : [],
      cardId: typeof body.cardId === 'string' ? body.cardId : null,
      model: body.model === 'anthropic' ? 'anthropic' : 'openai',
      webSearch: body.webSearch !== false,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({error: error instanceof Error ? error.message : 'Research failed'}, {status: 422});
  }
}
