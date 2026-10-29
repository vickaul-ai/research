import {describe, expect, it} from 'vitest';
import {parseInput} from '@/lib/input';
import {memoryStore} from '@/lib/store';
import type {ResearchResult} from '@/lib/research';

const result = (title: string): ResearchResult => ({
  title, markdown: `# ${title}`, sources: [], checklist: [], queries: [], unknownCitations: [],
  costUsd: 0.01, costLines: [], model: 'gpt-6-luna', generatedAt: new Date().toISOString(),
});

const input = parseInput({question: 'Is Neon free?', links: ['https://neon.com'], cardId: 'check-claim'});

describe('saved research', () => {
  it('normalises page input', () => {
    expect(input).toEqual({question: 'Is Neon free?', links: ['https://neon.com'], uploads: [], cardId: 'check-claim', model: 'openai', webSearch: true});
    expect(parseInput({model: 'anthropic', webSearch: false}).model).toBe('anthropic');
  });

  it('saves, lists, reruns as versions and deletes a whole topic', async () => {
    const store = memoryStore();
    const first = await store.save(input, result('Neon pricing'));
    await store.save(parseInput({question: 'Other'}), result('Something else'));
    const second = await store.save(input, result('Neon pricing, updated'), first.topicId);

    const list = await store.list();
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({id: second.id, title: 'Neon pricing, updated', versions: 2});

    expect((await store.list('neon')).map(i => i.title)).toEqual(['Neon pricing, updated']);
    expect((await store.versions(first.topicId)).map(v => v.id)).toEqual([second.id, first.id]);
    expect((await store.get(first.id))?.input.links).toEqual(['https://neon.com']);

    expect(await store.deleteTopic(first.topicId)).toBe(2);
    expect(await store.get(second.id)).toBeNull();
    expect(await store.list()).toHaveLength(1);
  });
});
