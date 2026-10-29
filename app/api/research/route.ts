import {NextResponse} from 'next/server';
import {parseInput} from '@/lib/input';
import {runResearch} from '@/lib/run';

// A run reads a handful of sources and makes two model calls; allow up to 5 minutes.
export const maxDuration = 300;

export async function POST(request: Request) {
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({error: 'Invalid request'}, {status: 400}); }
  try {
    return NextResponse.json(await runResearch(parseInput(body)));
  } catch (error) {
    return NextResponse.json({error: error instanceof Error ? error.message : 'Research failed'}, {status: 422});
  }
}
