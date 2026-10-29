import {NextResponse} from 'next/server';
import {decideProposal} from '@/lib/learn';

/** Body: {"accept": true | false}. */
export async function POST(request: Request, {params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({error: 'Invalid request'}, {status: 400}); }
  try {
    return NextResponse.json(await decideProposal(id, body?.accept === true));
  } catch (error) {
    return NextResponse.json({error: error instanceof Error ? error.message : 'Could not decide'}, {status: 422});
  }
}
