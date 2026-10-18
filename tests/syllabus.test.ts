import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Transport } from '../src/webview/transport.ts';
import { syllabusApi } from '../src/webview/syllabus.ts';
import { pageNumbers, sourcePages, scopeName, syllabusAccess, syllabusError } from '../src/ui/stores/syllabus.ts';
import type { SyllabusInfo } from '../src/webview/types.ts';
const tokens = { access_token: 'student', refresh_token: 'r'.repeat(48), expires_in: 3600, refresh_expires_in: 2592000, token_type: 'bearer' as const };
test('syllabus search carries student JWT and all filters as JSON; section IDs never become artifact URLs', async () => {
  const calls: { path: string; method: string; body?: string }[] = [];
  const t = new Transport(() => 'http://test', async (path, init) => {
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer student');
    calls.push({ path: String(path), method: init?.method || 'GET', body: init?.body as string }); return Response.json({});
  }, () => {}, () => {}); t.set(tokens); const api = syllabusApi(t);
  await api.searchSyllabus({ query: ' 函数 ', subject: 'math', course_category: '必修课程', mode: 'hybrid', top_k: 10 });
  await api.syllabusSection('section/one?part=two');
  assert.deepEqual(JSON.parse(calls[0].body!), { query: '函数', subject: 'math', course_category: '必修课程', mode: 'hybrid', top_k: 10 });
  assert.equal(calls[0].method, 'POST'); assert.equal(calls[0].path, 'http://test/v1/syllabus/search');
  assert.equal(calls[1].path, 'http://test/v1/syllabus/sections/section%2Fone%3Fpart%3Dtwo'); assert.equal(calls[1].method, 'GET');
});
test('search network failures are never retried or changed into a teaching POST', async () => {
  let calls = 0; const t = new Transport(() => 'http://test', async () => { calls++; throw new TypeError('offline'); }, () => {}, () => {}); t.set(tokens);
  await assert.rejects(syllabusApi(t).searchSyllabus({ query: '函数' })); assert.equal(calls, 1);
});
test('503 detail reason remains machine-readable; 512-token limit produces a useful local message', async () => {
  const t = new Transport(() => 'http://test', async () => Response.json({ detail: 'SYLLABUS_MODEL_UNAVAILABLE' }, { status: 503 }), () => {}, () => {}); t.set(tokens);
  await assert.rejects(syllabusApi(t).searchSyllabus({ query: '函数' }), e => {
    assert.equal((e as { code: string }).code, 'SYLLABUS_MODEL_UNAVAILABLE'); assert.match(syllabusError(e), /词项检索/); return true;
  });
  assert.match(syllabusError({ code: 'SYLLABUS_QUERY_TOO_LONG', status: 400 }), /512 token/);
  assert.match(syllabusError({ status: 404 }), /重新检索/);
});
test('legacy/disabled services stay unavailable; missing vectors permit explicit lexical access only', () => {
  assert.equal(syllabusAccess().enabled, false);
  const info = { availability: 'unavailable', reason: 'SYLLABUS_MODEL_UNAVAILABLE', modes: ['lexical'], default_mode: 'hybrid' } as SyllabusInfo;
  assert.deepEqual(syllabusAccess(info), { enabled: true, modes: ['lexical'], mode: 'lexical', fallback: true });
  assert.equal(syllabusAccess({ ...info, availability: 'disabled' }).enabled, false);
});
test('source pages retain PDF/printed distinction; course scope never implies exam confidence', () => {
  assert.equal(pageNumbers([3, 1, 2, 2, 7, 9, 8]), '1–3、7–9');
  assert.match(sourcePages({ file: 'x.pdf', sha256: 'a'.repeat(64), pdf_pages: [20], printed_pages: [10], pdf_page_start: 20, pdf_page_end: 20 }), /PDF 第 20 页 · 印刷第 10 页/);
  assert.equal(scopeName('shared_with_elective'), '与选修共用'); assert.equal(scopeName('shared_across_courses'), '跨课程共用');
});
