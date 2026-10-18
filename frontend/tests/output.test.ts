import test from 'node:test';
import assert from 'node:assert/strict';
import { OutputPreview } from '../src/ui/stores/output.ts';
import type { TeachingEvent, PublicMessage } from '../src/webview/types.ts';
const start = (stream = 's'): TeachingEvent => ({ id: 1, event: 'output_start', data: { stream_id: stream, round: 1, effort: 'low' } });
const delta = (sequence: number, text: string, stream = 's'): TeachingEvent => ({ id: sequence + 1, event: 'output_delta', data: { stream_id: stream, sequence, text } });
const message = (id: number, role: 'student' | 'assistant'): TeachingEvent => ({ id, event: 'message', data: { message: { id, role, presentation: role === 'assistant' ? { version: '1.0', blocks: [] } : null } as PublicMessage } });
test('incremental text survives replay and received remains provisional until final message', () => {
  const p = new OutputPreview(); p.accept(start()); p.accept(delta(1, '你好')); p.accept(delta(1, '你好')); p.accept(delta(2, '世界'));
  p.accept({ id: 4, event: 'output_end', data: { stream_id: 's', status: 'received' } });
  assert.equal(p.snapshot()?.text, '你好世界'); assert.equal(p.snapshot()?.status, 'received');
  p.accept(message(10, 'assistant')); assert.equal(p.snapshot(), null);
  p.accept({ id: 11, event: 'presentation', data: { version: '1.0', blocks: [] } }); assert.equal(p.snapshot(), null);
});
test('missing sequences fail before advancing state and can be recovered', () => {
  const p = new OutputPreview(); p.accept(start()); p.accept(delta(1, 'a'));
  assert.throws(() => p.accept(delta(3, 'c')), /不连续/); p.accept(delta(2, 'b')); p.accept(delta(3, 'c')); assert.equal(p.snapshot()?.text, 'abc');
});
test('history replay cannot resurrect a completed answer or a previous turn', () => {
  const p = new OutputPreview(); p.begin(20); p.accept(message(1, 'student')); p.accept(start()); p.accept(delta(1, 'old')); p.accept(message(2, 'assistant'));
  assert.equal(p.snapshot(), null); p.accept(message(20, 'student')); p.accept(start('new')); p.accept(delta(1, 'new', 'new')); assert.equal(p.snapshot()?.text, 'new');
  p.begin(20, true); p.accept(message(20, 'student')); p.accept(start()); p.accept(delta(1, 'already saved')); assert.equal(p.snapshot(), null);
});
test('tool rounds replace the provisional preview; aborted output never becomes final', () => {
  const p = new OutputPreview(); p.accept(start()); p.accept(delta(1, 'tool draft')); p.accept(start('next')); p.accept(delta(1, 'answer', 'next'));
  p.accept({ id: 5, event: 'failed', data: { code: 'UPSTREAM_ERROR' } }); assert.equal(p.snapshot()?.text, 'answer'); assert.equal(p.snapshot()?.status, 'aborted');
});
test('large previews are bounded and structured payloads are not shown as rich output', () => {
  const p = new OutputPreview(); p.accept(start()); p.accept(delta(1, '{"version":"1.0","blocks":['));
  p.accept(delta(2, 'x'.repeat(1000000))); assert.equal(p.snapshot()?.structured, true); assert.equal(p.snapshot()?.text.length, p.limit); assert.equal(p.snapshot()?.truncated, true);
});
