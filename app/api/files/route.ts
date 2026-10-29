import {NextResponse} from 'next/server';
import {fileToText} from '@/lib/files';

/** Extract the text of one uploaded file; the page keeps the text with the question. */
export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({error: 'No file'}, {status: 400});
  try {
    const text = await fileToText(file.name, new Uint8Array(await file.arrayBuffer()));
    return NextResponse.json({name: file.name, text});
  } catch (error) {
    return NextResponse.json({error: error instanceof Error ? error.message : 'Could not read file'}, {status: 422});
  }
}
