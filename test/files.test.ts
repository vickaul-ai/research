import {readFile} from 'node:fs/promises';
import {describe, expect, it} from 'vitest';
import {fileToText} from '@/lib/files';

const fixture = async (name: string) => new Uint8Array(await readFile(new URL(`./fixtures/${name}`, import.meta.url)));

describe('file uploads', () => {
  it('reads PDF text page by page', async () => {
    const text = await fileToText('sample.pdf', await fixture('sample.pdf'));
    expect(text).toContain('Neon offers a free tier.');
    expect(text.split('\n\n')).toHaveLength(2);
  });

  it('reads Word documents', async () => {
    const text = await fileToText('sample.docx', await fixture('sample.docx'));
    expect(text).toContain('Supadata reads native captions.');
    expect(text).toContain('Second paragraph.');
  });

  it('reads plain text and rejects other formats, empty files and large files', async () => {
    expect(await fileToText('a.md', new TextEncoder().encode('# hi'))).toBe('# hi');
    await expect(fileToText('a.xlsx', new Uint8Array(10))).rejects.toThrow(/use PDF/);
    await expect(fileToText('a.txt', new TextEncoder().encode('  '))).rejects.toThrow(/no readable text/);
    await expect(fileToText('a.txt', new Uint8Array(5 * 1024 * 1024))).rejects.toThrow(/4 MB/);
  });
});
