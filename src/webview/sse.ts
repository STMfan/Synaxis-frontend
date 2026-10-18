import type { TeachingEvent } from './types.ts';
/** Incremental parser: CRLF, split UTF-8, multiline data and final frame. */
export async function parseSse(body: ReadableStream<Uint8Array>, signal: AbortSignal, callback: (event: TeachingEvent) => void, healthy = () => {}, readFailed = () => {}) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  function dispatch(frame: string) {
    let id = 0, event = 'message'; const data: string[] = [];
    for (const line of frame.split('\n')) {
      if (line.startsWith('id:')) id = Number(line.slice(3).trim());
      if (line.startsWith('event:')) event = line.slice(6).trim();
      if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
    if (signal.aborted) return;
    if (data.length) { callback({ id, event, data: JSON.parse(data.join('\n')) } as TeachingEvent); healthy(); }
    else if (frame.split('\n').some(line => line.startsWith(':'))) healthy();
  }
  try {
    while (!signal.aborted) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try { chunk = await reader.read(); } catch (error) { if (!signal.aborted) readFailed(); throw error; }
      const { done, value } = chunk;
      buffer += decoder.decode(value, { stream: !done });
      buffer = buffer.replace(/\r\n/g, '\n');
      let end: number;
      while ((end = buffer.indexOf('\n\n')) >= 0) { dispatch(buffer.slice(0, end)); buffer = buffer.slice(end + 2); }
      if (done) { if (buffer.trim()) dispatch(buffer); if (!signal.aborted) healthy(); break; }
    }
  } finally { signal.removeEventListener('abort', abort); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
