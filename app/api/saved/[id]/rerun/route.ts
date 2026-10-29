import {NextResponse} from 'next/server';
import {runResearch} from '@/lib/run';
import {getStore} from '@/lib/store';

export const maxDuration = 300;

/** Run the same research again with fresh sources and save it as a new version. */
export async function POST(_: Request, {params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  const store = getStore();
  const item = await store.get(id);
  if (!item) return NextResponse.json({error: 'Not found'}, {status: 404});
  try {
    const result = await runResearch({...item.input, previous: {markdown: item.result.markdown, generatedAt: item.result.generatedAt}});
    const saved = await store.save(item.input, result, item.topicId);
    return NextResponse.json({...saved, versions: await store.versions(item.topicId)});
  } catch (error) {
    return NextResponse.json({error: error instanceof Error ? error.message : 'Rerun failed'}, {status: 422});
  }
}
