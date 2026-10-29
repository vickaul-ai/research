import {NextResponse} from 'next/server';
import {getStore} from '@/lib/store';

/** Hide a card from the picker. Past runs keep their snapshot of it. */
export async function DELETE(_: Request, {params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  const archived = await getStore().archiveCard(id);
  return archived ? NextResponse.json({archived: true}) : NextResponse.json({error: 'Not found'}, {status: 404});
}
