import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultServer, validServer } from '../src/webview/server.ts';

test('new installations use loopback; explicit configured origins are normalized', () => {
  assert.equal(defaultServer(), 'http://127.0.0.1:5667');
  assert.equal(defaultServer(''), 'http://127.0.0.1:5667');
  assert.equal(defaultServer(' https://API.EXAMPLE.COM:443/ '), 'https://api.example.com');
  assert.equal(defaultServer('http://localhost:5667/'), 'http://localhost:5667');
});

test('saved service origins never carry credentials, paths, query or fragments', () => {
  for (const value of [
    'https://user:password@example.com', 'https://example.com/v1', 'https://example.com/?token=synthetic',
    'https://example.com/#settings', 'file:///tmp/server', 'javascript:alert(1)', 'not a URL',
  ]) assert.throws(() => validServer(value), undefined, value);
});

test('public HTTP is refused while HTTPS works for remote services', () => {
  for (const value of ['http://example.com', 'http://8.8.8.8:5667', 'http://172.15.1.1', 'http://172.32.1.1', 'http://[2001:db8::1]']) {
    assert.throws(() => validServer(value), /HTTPS/, value);
  }
  assert.equal(validServer('https://example.com:5667'), 'https://example.com:5667');
  assert.equal(validServer('https://[2001:db8::1]/'), 'https://[2001:db8::1]');
});

test('loopback and LAN HTTP remain available for explicitly configured development', () => {
  for (const host of ['localhost', 'dev.localhost', 'server.local', '127.0.0.1', '10.0.0.1', '172.16.0.1', '172.31.255.254', '192.168.50.5', '169.254.1.1', '[::1]', '[fd00::1]', '[fc00::1]', '[fe80::1]']) {
    assert.equal(validServer(`http://${host}:5667/`), `http://${host}:5667`, host);
  }
});
