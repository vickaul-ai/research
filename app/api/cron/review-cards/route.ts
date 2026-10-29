import {NextResponse} from 'next/server';
import {reviewCards} from '@/lib/learn';

// Called monthly by Vercel Cron (vercel.json). Vercel sends CRON_SECRET as a bearer token.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }
  try {
    return NextResponse.json(await reviewCards());
  } catch (error) {
    return NextResponse.json({error: error instanceof Error ? error.message : 'Review failed'}, {status: 500});
  }
}
