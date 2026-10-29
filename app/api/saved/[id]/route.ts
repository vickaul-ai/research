import {NextResponse} from 'next/server';
import {getStore} from '@/lib/store';

export async function GET(_: Request, {params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  const store = getStore();
  const item = await store.get(id);
  if (!item) return NextResponse.json({error: 'Not found'}, {status: 404});
  return NextResponse.json({...item, versions: await store.versions(item.topicId)});
}

/** Delete the whole topic: every saved version of this research. */
export async function DELETE(_: Request, {params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  const store = getStore();
  const item = await store.get(id);
  if (!item) return NextResponse.json({error: 'Not found'}, {status: 404});
  return NextResponse.json({deleted: await store.deleteTopic(item.topicId)});
}
