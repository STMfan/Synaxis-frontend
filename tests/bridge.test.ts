import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Transport, responseBlob } from '../src/webview/transport.ts';
import { parseSse } from '../src/webview/sse.ts';
import { Submission } from '../src/ui/stores/submission.ts';
const tokens = { access_token: 'old', refresh_token: 'r'.repeat(32), expires_in: 3600, refresh_expires_in: 10000, token_type: 'bearer' as const };
test('native adapter response preserves PNG MIME for preview instead of opening save dialog', async () => {
  const r = new Response(new Uint8Array([137, 80, 78, 71]));
  Object.defineProperty(r, 'headers', { value: new Headers({ 'content-type': 'image/png' }) });
  const blob = await responseBlob(r); assert.equal(blob.type, 'image/png'); assert.equal(blob.size, 4);
});
test('concurrent requests rotate refresh token exactly once', async () => {
  let rotations = 0;
  const t = new Transport(() => 'http://test', async (url, init) => {
    if (String(url).endsWith('/refresh')) { rotations++; await new Promise(r => setTimeout(r, 10)); return Response.json({ ...tokens, access_token: 'new', refresh_token: 's'.repeat(32) }); }
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer new'); return Response.json({ ok: true });
  }, () => assert.fail('must not expire'), () => {});
  t.set(tokens); t.expires = 0;
  await Promise.all([t.request('/a'), t.request('/b'), t.request('/c')]); assert.equal(rotations, 1);
});
test('ambiguous refresh clears tokens and never reuses one-time token', async () => {
  let calls = 0, expired = 0;
  const t = new Transport(() => 'http://test', async () => { calls++; throw new TypeError('network'); }, () => expired++, () => {});
  t.set(tokens); t.expires = 0;
  await assert.rejects(t.request('/a')); await assert.rejects(t.request('/b')); assert.equal(calls, 1); assert.equal(expired, 1); assert.equal(t.tokens, null);
});
test('SSE parses split UTF8, CRLF, multiline and final unterminated event', async () => {
  const text = 'id: 4\r\nevent: message\r\ndata: {"message":\r\ndata: {"text":"思考"}}\r\n\r\n: heartbeat\n\nid: 5\nevent: completed\ndata: {}';
  const bytes = new TextEncoder().encode(text); const events: unknown[] = [];
  const body = new ReadableStream<Uint8Array>({ start(c) { for (const byte of bytes) c.enqueue(new Uint8Array([byte])); c.close(); } });
  await parseSse(body, new AbortController().signal, e => events.push(e));
  assert.deepEqual(events, [{ id: 4, event: 'message', data: { message: { text: '思考' } } }, { id: 5, event: 'completed', data: {} }]);
});
test('uncertain submission retains key; changed or successful new input gets a new key', async () => {
  const submission = new Submission(); const keys: string[] = [];
  await assert.rejects(submission.run('create', { message: 'a' }, async key => { keys.push(key); throw new Error('connection lost'); }));
  await submission.run('create', { message: 'a' }, async key => { keys.push(key); return 1; });
  await submission.run('create', { message: 'a' }, async key => { keys.push(key); return 2; });
  assert.equal(keys[0], keys[1]); assert.notEqual(keys[1], keys[2]);
});
test('ordinary network failure never automatically retries a paid POST', async () => {
  let calls = 0; const t = new Transport(() => 'http://test', async () => { calls++; throw new TypeError('network'); }, () => {}, () => {}); t.set(tokens);
  await assert.rejects(t.request('/v1/sessions', { method: 'POST', body: '{}' })); assert.equal(calls, 1);
});
test('late refresh response cannot restore old credentials after server/account switch', async () => {
  let finish!: () => void;
  const barrier = new Promise<void>(resolve => { finish = resolve; });
  const t = new Transport(() => 'http://test', async () => { await barrier; return Response.json({ ...tokens, access_token: 'stale' }); }, () => assert.fail('must not expire new login'), () => {});
  t.set(tokens); t.expires = 0; const old = t.request('/a');
  t.clear(); t.set({ ...tokens, access_token: 'new-login' }); finish();
  await assert.rejects(old); assert.equal(t.tokens!.access_token, 'new-login');
});

test('SSE heartbeat reports health without creating a teaching event; body read failure marks offline', async () => {
  let body!: ReadableStreamDefaultController<Uint8Array>, healthy = 0; const connection: boolean[] = [], events: unknown[] = [];
  const t = new Transport(() => 'http://test', async () => new Response(new ReadableStream<Uint8Array>({ start(c) { body = c; } })), () => {}, v => connection.push(v)); t.set(tokens);
  const stream = t.stream('/events?after=7', 7, new AbortController().signal, e => events.push(e), () => healthy++);
  await new Promise(r => setTimeout(r, 5)); body.enqueue(new TextEncoder().encode(': heartbeat\r\n\r\n')); await new Promise(r => setTimeout(r, 5));
  assert.equal(healthy, 1); assert.equal(events.length, 0); body.error(new TypeError('TCP read failed')); await assert.rejects(stream); assert.equal(connection.at(-1), false);
});

test('intentional stream abort stays silent and empty terminal response is healthy', async () => {
  let closed = 0; const connection: boolean[] = [];
  const t = new Transport(() => 'http://test', async () => new Response(new ReadableStream<Uint8Array>({ cancel() { closed++; } })), () => {}, v => connection.push(v)); t.set(tokens);
  const ctrl = new AbortController(); const reading = t.stream('/events', 0, ctrl.signal, () => assert.fail('event')); await new Promise(r => setTimeout(r, 5)); ctrl.abort(); await reading;
  assert.equal(closed, 1); assert.ok(!connection.includes(false));
  const empty = new Transport(() => 'http://test', async () => new Response(new Uint8Array()), () => {}, () => {}); empty.set(tokens); let healthy = 0;
  await empty.stream('/events?after=9', 9, new AbortController().signal, () => assert.fail('terminal event'), () => healthy++); assert.equal(healthy, 1);
});

test('only no-ID UNAUTHORIZED refreshes stream auth; durable failed stays a teaching result', async () => {
  let calls = 0, refreshes = 0; const events: unknown[] = [];
  const t = new Transport(() => 'http://test', async (url, init) => {
    if (String(url).endsWith('/refresh')) { refreshes++; return Response.json({ ...tokens, access_token: 'new' }); }
    calls++; assert.equal(new Headers(init?.headers).get('Last-Event-ID'), '4');
    if (calls === 1) return new Response('event: failed\ndata: {"code":"UNAUTHORIZED"}\n\n');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer new');
    return new Response('id: 5\nevent: failed\ndata: {"code":"UNAUTHORIZED"}\n\n');
  }, () => assert.fail('refresh should preserve login'), () => {}); t.set(tokens);
  await assert.rejects(t.stream('/events?after=4', 4, new AbortController().signal, e => events.push(e)), { code: 'STREAM_AUTH_EXPIRED' }); assert.equal(events.length, 0);
  await t.stream('/events?after=4', 4, new AbortController().signal, e => events.push(e)); assert.equal(refreshes, 1); assert.deepEqual(events, [{ id: 5, event: 'failed', data: { code: 'UNAUTHORIZED' } }]);
});

test('a read cancelled while refreshing never sends its stale request', async () => {
  let release!: () => void; const barrier = new Promise<void>(r => { release = r; }); let reads = 0;
  const t = new Transport(() => 'http://test', async url => { if (String(url).endsWith('/refresh')) { await barrier; return Response.json(tokens); } reads++; return Response.json({}); }, () => {}, () => {}); t.set(tokens); t.expires = 0;
  const ctrl = new AbortController(), request = t.request('/session', { signal: ctrl.signal }); ctrl.abort(); release(); await assert.rejects(request); assert.equal(reads, 0);
});

test('late headers from an aborted native request cannot mark an obsolete connection healthy', async () => {
  let finish!: () => void; const barrier = new Promise<void>(resolve => { finish = resolve; }); const connection: boolean[] = [];
  const t = new Transport(() => 'http://test', async () => { await barrier; return Response.json({}); }, () => {}, value => connection.push(value)); t.set(tokens);
  const controller = new AbortController(), request = t.request('/session', { signal: controller.signal }); controller.abort(); finish(); await assert.rejects(request); assert.deepEqual(connection, []);
});

test('cancellable ordinary reads retain a deadline, while SSE keeps its unlimited lifecycle signal', async () => {
  const ctrl = new AbortController(); let readSignal: AbortSignal | null = null, streamSignal: AbortSignal | null = null;
  const t = new Transport(() => 'http://test', async (url, init) => {
    if (String(url).endsWith('/events')) { streamSignal = init!.signal!; return new Response(new Uint8Array()); }
    readSignal = init!.signal!; return Response.json({});
  }, () => {}, () => {}); t.set(tokens);
  await t.request('/session', { signal: ctrl.signal }); assert.notEqual(readSignal, ctrl.signal);
  await t.stream('/events', 0, ctrl.signal, () => {}); assert.equal(streamSignal, ctrl.signal);
  ctrl.abort(); assert.equal(readSignal!.aborted, true);
});
