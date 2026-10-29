import {NextResponse} from 'next/server';
import {getStore} from '@/lib/store';

export async function GET() {
  return NextResponse.json(await getStore().listCards());
}

/** Create or update a card. A new card gets an id from its name. */
export async function POST(request: Request) {
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({error: 'Invalid request'}, {status: 400}); }
  try {
    return NextResponse.json(await getStore().saveCard(body));
  } catch (error) {
    return NextResponse.json({error: error instanceof Error ? error.message : 'Could not save card'}, {status: 422});
  }
}
