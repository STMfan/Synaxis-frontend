import test from 'node:test';
import assert from 'node:assert/strict';
import { ReasoningStreams } from '../src/ui/stores/reasoning.ts';
import { OutputPreview } from '../src/ui/stores/output.ts';
import { pricingSnapshot } from '../src/ui/stores/pricing.ts';
import type { TeachingEvent } from '../src/webview/types.ts';
const start = (id = 'reasoning'): TeachingEvent => ({ id: 1, event: 'reasoning_start', data: { stream_id: id, round: 1, effort: 'low' } });
const delta = (sequence: number, text: string, id = 'reasoning'): TeachingEvent => ({ id: sequence+1, event: 'reasoning_delta', data: { stream_id: id, sequence, text } });
test('independent body/reasoning sequences, replay deduplication, and formal answer keep provider text', () => {
  const thoughts = new ReasoningStreams(), body = new OutputPreview();
  const events: TeachingEvent[] = [start(), { id: 2, event: 'output_start', data: { stream_id: 'body', round: 1, effort: 'low' } }, delta(1,'检查条件。'), { id: 4, event: 'output_delta', data: { stream_id: 'body', sequence: 1, text: '答案。' } }, delta(1,'检查条件。'), delta(2,'<script>不执行</script>'), { id: 7, event: 'reasoning_end', data: { stream_id: 'reasoning', status: 'received' } }, { id: 8, event: 'presentation', data: { version: '1.0', blocks: [{ type: 'markdown', text: '正式答案' }] } }];
  for (const e of events) { thoughts.accept(e); body.accept(e); }
  assert.equal(body.snapshot(), null); assert.equal(thoughts.snapshots()[0].text, '检查条件。<script>不执行</script>'); assert.equal(thoughts.snapshots()[0].status,'received');
});
test('reasoning gaps/orphans fail without advancing and recover through replay', () => {
  const r = new ReasoningStreams(); assert.throws(() => r.accept(delta(1,'x')),/起始/); r.accept(start()); r.accept(delta(1,'a'));
  assert.throws(() => r.accept(delta(3,'c')),/不连续/); r.accept(delta(2,'b')); r.accept(delta(3,'c')); assert.equal(r.snapshots()[0].text,'abc');
});
test('aborted provider reasoning and tool-only logs remain accessible without a presentation', () => {
  const r = new ReasoningStreams(); r.accept(start()); r.accept(delta(1,'未完成'));
  r.accept({ id: 3, event: 'cancelled', data: { code: 'CANCELLED' } });
  const log: TeachingEvent = { id: 4, event: 'artifact', data: { round: 1, status: 'aborted', artifact_id: 'owned-log', name: 'round-1.log', mime: 'text/plain', bytes: 1024 } };
  r.accept(log); r.accept(log); assert.equal(r.snapshots()[0].status,'aborted'); assert.equal(r.logs().length,1);
  assert.equal(new ReasoningStreams().snapshots().length,0); // Off means no fabricated reasoning.
});
test('large reasoning is bounded per channel and older retained rounds are bounded', () => {
  const r = new ReasoningStreams(); r.accept(start()); r.accept(delta(1,'x'.repeat(1000000))); assert.equal(r.snapshots()[0].text.length,r.limit); assert.equal(r.snapshots()[0].truncated,true);
  for (let i=0;i<20;i++) r.accept(start(`round-${i}`)); assert.equal(r.snapshots().length,r.retainedRounds);
});
test('pricing uses recorded request-start snapshot, preserving excluded/unknown/historical basis', () => {
  const p = pricingSnapshot('estimate:deepseek-2026-10-08:off_peak:CNY/1M;request_start=2026-10-08T01:01:00Z;rates=0.1,1,1.5;mode=auto');
  assert.equal(p?.label,'谷时费率'); assert.equal(p?.rates,'0.1,1,1.5'); assert.equal(p?.start,'2026-10-08T01:01:00Z'); assert.equal(pricingSnapshot('excluded:siliconflow:voucher'),null); assert.equal(pricingSnapshot('estimate:old'),null);
});
