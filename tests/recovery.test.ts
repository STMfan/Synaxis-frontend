import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SessionRecovery } from '../src/ui/stores/recovery.ts';
import type { Status } from '../src/webview/types.ts';
const tick = () => new Promise(resolve => setTimeout(resolve, 10));
const pending = (signal: AbortSignal) => new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }));

test('foreground, pageshow and online share one recovery; hiding cancels it without an error', async () => {
  let reads = 0, streams = 0, visible = true, release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const r = new SessionRecovery({ foreground: () => visible, authenticated: () => true,
    synchronize: async signal => { reads++; await barrier; signal.throwIfAborted(); return 'running'; },
    stream: async signal => { streams++; await pending(signal); }, healthy: () => {}, issue: () => assert.fail('intentional abort') });
  const a = r.recover(), b = r.recover(), c = r.recover(); assert.equal(a, b); assert.equal(b, c);
  await tick(); visible = false; r.suspend(); release(); await a; assert.equal(reads, 1); assert.equal(streams, 0);
  visible = true; await r.recover(); await tick(); assert.equal(streams, 1); r.dispose();
});

test('old stream events and health cannot change the recovered session; at most one active reader', async () => {
  let active = 0, max = 0, healthy = 0; const callbacks: (() => void)[] = [];
  const r = new SessionRecovery({ foreground: () => true, authenticated: () => true, synchronize: async () => 'running',
    stream: async (signal, health) => { callbacks.push(health); max = Math.max(max, ++active); await pending(signal); active--; },
    healthy: () => healthy++, issue: () => assert.fail('obsolete stream') });
  await r.recover(); await tick(); await r.recover(); await tick(); const before = healthy; callbacks[0](); assert.equal(healthy, before);
  assert.equal(max, 1); assert.equal(active, 1); r.dispose(); await tick(); assert.equal(active, 0);
});

test('all four terminal states recover through reads only, with no stream or retry loop', async () => {
  for (const status of ['waiting', 'completed', 'failed', 'cancelled'] as Status[]) {
    let reads = 0, streams = 0;
    const r = new SessionRecovery({ foreground: () => true, authenticated: () => true, synchronize: async () => { reads++; return status; },
      stream: async () => { streams++; }, healthy: () => {}, issue: () => assert.fail('terminal EOF') });
    await Promise.all([r.recover(), r.recover(), r.recover()]); await tick(); assert.equal(reads, 1); assert.equal(streams, 0); r.dispose();
  }
});

test('normal empty EOF immediately refreshes terminal status without reporting interruption', async () => {
  let reads = 0, streams = 0;
  const r = new SessionRecovery({ foreground: () => true, authenticated: () => true,
    synchronize: async () => ++reads === 1 ? 'running' : 'completed', stream: async () => { streams++; },
    healthy: () => {}, issue: () => assert.fail('normal EOF') });
  await r.recover(); await tick(); assert.equal(reads, 2); assert.equal(streams, 1); r.dispose();
});

test('network failure retries reads before subscribing; heartbeat clears stale errors during an active round', async () => {
  let reads = 0, streams = 0, note = '', beat!: () => void;
  const r = new SessionRecovery({ foreground: () => true, authenticated: () => true,
    synchronize: async () => { if (++reads < 3) throw new Error('offline'); return 'running'; },
    stream: async (signal, health) => { streams++; beat = health; await pending(signal); },
    healthy: () => { note = ''; }, issue: () => { note = 'disconnected'; }, retryDelay: () => 1 });
  await r.recover(); assert.equal(note, 'disconnected'); await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(reads, 3); assert.equal(streams, 1); note = 'stale'; beat(); assert.equal(note, ''); r.dispose();
});

test('resuming interrupts retry backoff immediately and does not repeat a teaching submission', async () => {
  let streams = 0, reads = 0, issue = 0;
  const r = new SessionRecovery({ foreground: () => true, authenticated: () => true, synchronize: async () => { reads++; return 'running'; },
    stream: async signal => { if (++streams === 1) throw new Error('TCP disconnected'); await pending(signal); },
    healthy: () => {}, issue: () => { issue++; }, retryDelay: () => 60000 });
  await r.recover(); await tick(); assert.equal(issue, 1); await r.recover(); await tick(); assert.equal(reads, 2); assert.equal(streams, 2); r.dispose();
});
