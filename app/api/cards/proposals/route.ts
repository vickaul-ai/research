import {NextResponse} from 'next/server';
import {reviewCards} from '@/lib/learn';
import {getStore} from '@/lib/store';

export async function GET() {
  return NextResponse.json(await getStore().listProposals('pending'));
}

/** "Suggest card improvements" from the page: review now if there are at least 3 new runs. */
export async function POST() {
  try {
    return NextResponse.json(await reviewCards({force: true}));
  } catch (error) {
    return NextResponse.json({error: error instanceof Error ? error.message : 'Review failed'}, {status: 422});
  }
}
