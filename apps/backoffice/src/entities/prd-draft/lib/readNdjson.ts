/**
 * 응답 본문의 NDJSON 을 줄마다 JSON 으로 읽어 내보낸다. 조각이 줄 경계를 넘어도, 마지막 줄에 개행이 없어도 된다.
 * 빈 줄과 JSON 이 아닌 줄은 건너뛴다.
 */
export async function* readNdjson(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = done ? '' : (lines.pop() ?? '');
      for (const line of lines) {
        const parsed = parseLine(line);
        if (parsed !== undefined) yield parsed;
      }
      if (done) return;
    }
  } finally {
    reader.releaseLock();
  }
}

function parseLine(line: string): unknown {
  const text = line.trim();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
