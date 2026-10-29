import {NextResponse} from 'next/server';
import {getStore} from '@/lib/store';

/** Thumbs up or down on a run, with an optional note. */
export async function POST(request: Request) {
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({error: 'Invalid request'}, {status: 400}); }
  const rating = body?.rating === 1 || body?.rating === -1 ? body.rating : null;
  if (typeof body?.runId !== 'string' || rating === null) return NextResponse.json({error: 'runId and rating (1 or -1) are required'}, {status: 400});
  const note = typeof body.note === 'string' ? body.note.slice(0, 2000) : '';
  const ok = await getStore().rateRun(body.runId, rating, note);
  return ok ? NextResponse.json({ok: true}) : NextResponse.json({error: 'Run not found'}, {status: 404});
}
