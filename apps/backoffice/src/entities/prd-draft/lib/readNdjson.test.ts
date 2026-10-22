import { describe, expect, it } from 'vitest';
import { readNdjson } from './readNdjson';

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(body: ReadableStream<Uint8Array>): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const value of readNdjson(body)) out.push(value);
  return out;
}

describe('readNdjson', () => {
  it('reads one JSON value per line', async () => {
    const body = new Response('{"a":1}\n{"b":2}\n').body;
    if (!body) throw new Error('no body');
    await expect(collect(body)).resolves.toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('joins chunks that cross a line boundary', async () => {
    await expect(collect(streamOf(['{"a":', '1}\n{"b"', ':2}\n']))).resolves.toEqual([
      { a: 1 },
      { b: 2 },
    ]);
  });

  it('reads the last line without a trailing newline', async () => {
    await expect(collect(streamOf(['{"a":1}\n{"b":2}']))).resolves.toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('skips blank lines and lines that are not JSON', async () => {
    await expect(collect(streamOf(['\n{"a":1}\r\n\nnot json\n{"b":2}\n']))).resolves.toEqual([
      { a: 1 },
      { b: 2 },
    ]);
  });

  it('decodes multi-byte characters split across chunks', async () => {
    const bytes = new TextEncoder().encode('{"t":"초안"}\n');
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 8));
        controller.enqueue(bytes.slice(8));
        controller.close();
      },
    });
    await expect(collect(body)).resolves.toEqual([{ t: '초안' }]);
  });
});
