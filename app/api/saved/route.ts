import {NextResponse} from 'next/server';
import {parseInput} from '@/lib/input';
import {getStore} from '@/lib/store';

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q') ?? undefined;
  return NextResponse.json(await getStore().list(query));
}

/** Save a finished report together with what was asked. */
export async function POST(request: Request) {
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({error: 'Invalid request'}, {status: 400}); }
  if (!body?.result?.markdown) return NextResponse.json({error: 'Nothing to save'}, {status: 400});
  const saved = await getStore().save(parseInput(body.input), body.result);
  return NextResponse.json(saved);
}
