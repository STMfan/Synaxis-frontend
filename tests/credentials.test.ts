import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Credentials, LOGIN_LIFETIME } from '../src/webview/credentials.ts';
import { Transport } from '../src/webview/transport.ts';
const token = { access_token: 'access-secret', refresh_token: 'r'.repeat(64), expires_in: 3600, refresh_expires_in: 30 * 86400, token_type: 'bearer' as const };
function fixture() {
  let raw: string | null = null, now = 100000;
  const store = { read: async () => raw, write: async (value: string) => { raw = value; }, remove: async () => { raw = null; } };
  return { store, get raw() { return raw; }, get now() { return now; }, advance: (ms: number) => { now += ms; }, clock: () => now };
}
test('restart restores refresh only; rotation does not extend the original 28-day deadline', async () => {
  const f = fixture(); const first = new Credentials(f.store, f.clock);
  await first.remember('http://test', token); const deadline = first.record!.expiresAt;
  assert.equal(deadline, f.now + LOGIN_LIFETIME); assert.equal(f.raw!.includes('access-secret'), false);
  f.advance(27 * 86400000); const restarted = new Credentials(f.store, f.clock);
  assert.equal((await restarted.load('http://test'))!.refreshToken, token.refresh_token);
  await restarted.rotate({ ...token, refresh_token: 's'.repeat(64) });
  assert.equal(restarted.record!.expiresAt, deadline); assert.equal(f.raw!.includes('r'.repeat(64)), false);
  f.advance(86400000); assert.equal(await new Credentials(f.store, f.clock).load('http://test'), null); assert.equal(f.raw, null);
});
test('server switch and explicit forget erase persisted credentials', async () => {
  const f = fixture(); const c = new Credentials(f.store, f.clock);
  await c.remember('http://test', token); assert.equal(await c.load('http://other'), null); assert.equal(f.raw, null);
  await c.remember('http://test', token); await c.clear(); assert.equal(f.raw, null);
});
test('queued rotation cannot resurrect credentials after logout', async () => {
  const f = fixture(); const c = new Credentials(f.store, f.clock); await c.remember('http://test', token);
  await Promise.all([c.rotate({ ...token, refresh_token: 'new'.repeat(22) }), c.clear()]); assert.equal(f.raw, null);
});
test('open application expires before any authenticated network request at 28-day limit', async () => {
  let requests = 0, expired = 0;
  const t = new Transport(() => 'http://test', async () => { requests++; return Response.json({}); }, () => expired++, () => {});
  t.set(token); t.deadline = Date.now() - 1;
  await assert.rejects(t.request('/v1/me'), /28 天/); assert.equal(requests, 0); assert.equal(expired, 1);
});
test('rotated credentials are durably written before authenticated requests continue', async () => {
  let persisted = false;
  const t = new Transport(() => 'http://test', async url => {
    if (String(url).endsWith('/refresh')) return Response.json({ ...token, access_token: 'new' });
    assert.equal(persisted, true); return Response.json({});
  }, () => {}, () => {}, async () => { await new Promise(resolve => setTimeout(resolve, 10)); persisted = true; });
  t.set(token); t.expires = 0; await t.request('/v1/me');
});
