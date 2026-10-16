/**
 * sse-writer.ts — streams TurnEvents to the client as Server-Sent Events.
 * Each event is one `data:` line carrying a JSON object (the discriminated
 * TurnEvent). Headers are sent lazily on the first event so an error raised
 * before the stream starts (missing session / ownership) still surfaces as a
 * normal HTTP error via Nest's exception filter instead of a half-open stream.
 */
import type { Response } from 'express';
import type { TurnEvent } from '../application/dto/turn-event';

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
} as const;

export async function pipeSse(res: Response, events: AsyncIterable<TurnEvent>): Promise<void> {
  try {
    for await (const event of events) {
      if (!res.headersSent) {
        res.writeHead(200, SSE_HEADERS);
      }
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  } catch (error) {
    if (!res.headersSent) {
      throw error; // nothing sent yet — let the exception filter render the error
    }
    // already streaming: closing without a `done` event signals failure to the client
  } finally {
    if (res.headersSent) {
      res.end();
    }
  }
}
