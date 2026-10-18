import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAbort, deadlineSignal } from '../src/webview/abort.ts';
import { Transport } from '../src/webview/transport.ts';

test('HTTP and SSE work when any, timeout and throwIfAborted are absent from the WebView', async t => {
  const entries: [object, string][] = [[AbortSignal, 'any'], [AbortSignal, 'timeout'], [AbortSignal.prototype, 'throwIfAborted']];
  for (const [object, key] of entries) {
    const descriptor = Object.getOwnPropertyDescriptor(object, key)!;
    Object.defineProperty(object, key, { configurable: true, value: undefined });
    t.after(() => Object.defineProperty(object, key, descriptor));
  }
  const states: boolean[] = []; let calls = 0;
  const transport = new Transport(() => 'http://fixture', async () => { calls++; return Response.json({ ok: true }); }, () => {}, value => states.push(value));
  const result = await transport.request('/health', {}, false);
  assert.deepEqual(await result.json(), { ok: true }); assert.equal(calls, 1); assert.deepEqual(states, [true]);
  const ctrl = new AbortController(); ctrl.abort();
  await assert.rejects(transport.request('/health', { signal: ctrl.signal }, false), { name: 'AbortError' });
  assert.equal(calls, 1); assert.deepEqual(states, [true]);
  transport.set({ access_token: 'synthetic', refresh_token: 'synthetic-refresh', expires_in: 3600, refresh_expires_in: 3600, token_type: 'bearer' });
  await transport.stream('/events', 0, new AbortController().signal, () => {});
  assert.equal(calls, 2); assert.ok(!states.includes(false));
});

test('deadline relays the first parent abort reason and releases its timer/listener', async () => {
  const parent = new AbortController(); let removed = 0;
  const remove = parent.signal.removeEventListener.bind(parent.signal);
  parent.signal.removeEventListener = (...args) => { removed++; remove(...args); };
  const signal = deadlineSignal(parent.signal, 30), reason = new DOMException('route changed', 'AbortError');
  parent.abort(reason); assert.equal(signal.aborted, true); assert.throws(() => checkAbort(signal), error => error === reason);
  await new Promise(resolve => setTimeout(resolve, 45));
  assert.throws(() => checkAbort(signal), error => error === reason); assert.equal(removed, 1);
});

test('deadline expires without modern AbortSignal methods and detaches the parent', async () => {
  const parent = new AbortController(); let removed = 0;
  const remove = parent.signal.removeEventListener.bind(parent.signal);
  parent.signal.removeEventListener = (...args) => { removed++; remove(...args); };
  const signal = deadlineSignal(parent.signal, 5);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.throws(() => checkAbort(signal), { name: 'TimeoutError' }); assert.equal(removed, 1); assert.equal(parent.signal.aborted, false);
});

test('already aborted parents stay cancelled, including old signals without a reason property', () => {
  const ctrl = new AbortController(); ctrl.abort();
  Object.defineProperty(ctrl.signal, 'reason', { value: undefined });
  const signal = deadlineSignal(ctrl.signal);
  assert.equal(signal.aborted, true); assert.throws(() => checkAbort(signal), { name: 'AbortError' });
});
