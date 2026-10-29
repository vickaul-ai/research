// Turns an uploaded file into plain text for the research pipeline.
import mammoth from 'mammoth';
import {extractText} from 'unpdf';

export const MAX_FILE_BYTES = 4 * 1024 * 1024; // Vercel caps request bodies at 4.5 MB.
const TEXT = /\.(txt|md|markdown|csv|json|html?)$/i;

export async function fileToText(name: string, bytes: Uint8Array): Promise<string> {
  if (bytes.byteLength > MAX_FILE_BYTES) throw new Error(`${name} is larger than 4 MB`);
  let text: string;
  if (/\.pdf$/i.test(name)) {
    const {text: pages} = await extractText(new Uint8Array(bytes), {mergePages: false});
    text = pages.map(page => page.trim()).filter(Boolean).join('\n\n');
  } else if (/\.docx$/i.test(name)) {
    text = (await mammoth.extractRawText({buffer: Buffer.from(bytes)})).value;
  } else if (TEXT.test(name)) {
    text = new TextDecoder().decode(bytes);
  } else {
    throw new Error(`${name}: use PDF, Word (.docx), text or Markdown`);
  }
  if (!text.trim()) throw new Error(`${name} has no readable text (a scanned PDF needs OCR first)`);
  return text;
}
