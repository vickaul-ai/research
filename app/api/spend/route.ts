import {NextResponse} from 'next/server';
import {spendStatus} from '@/lib/run';

export async function GET() {
  return NextResponse.json(await spendStatus());
}
