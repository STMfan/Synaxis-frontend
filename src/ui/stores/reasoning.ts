import type { Effort, RoundArtifact, TeachingEvent } from '../../webview/types';

export interface ReasoningSnapshot { stream: string; round: number; submission: number; effort: Effort; text: string; status: 'streaming' | 'received' | 'aborted'; truncated: boolean }
/** Provider-returned text only. Independent sequence/cursor validation from body. */
export class ReasoningStreams {
  private streams = new Map<string, ReasoningSnapshot & { sequence: number }>();
  private artifacts = new Map<string, RoundArtifact>();
  private submission = 0;
  readonly limit = 24000;
  readonly retainedRounds = 12;
  snapshots(): ReasoningSnapshot[] { return [...this.streams.values()].map(({ sequence: _, ...value }) => ({ ...value })); }
  logs(): RoundArtifact[] { return [...this.artifacts.values()].map(x => ({ ...x })); }
  accept(event: TeachingEvent): boolean {
    if (event.event === 'message' && event.data.message.role === 'student') this.submission = event.data.message.id;
    if (event.event === 'reasoning_start') {
      const d = event.data;
      if (this.streams.has(d.stream_id)) return false;
      this.streams.set(d.stream_id, { stream: d.stream_id, round: d.round, submission: this.submission, effort: d.effort, text: '', sequence: 0, status: 'streaming', truncated: false });
      if (this.streams.size > this.retainedRounds) this.streams.delete(this.streams.keys().next().value!);
      return true;
    }
    if (event.event === 'reasoning_delta') {
      const d = event.data, current = this.streams.get(d.stream_id);
      if (!current) throw new Error('思考缺少起始事件，正在重新同步');
      if (d.sequence <= current.sequence) return false;
      if (d.sequence !== current.sequence + 1) throw new Error('思考分片不连续，正在重新同步');
      const text = current.text + d.text;
      this.streams.set(d.stream_id, { ...current, text: text.slice(-this.limit), sequence: d.sequence, truncated: current.truncated || text.length > this.limit });
      return true;
    }
    if (event.event === 'reasoning_end') {
      const current = this.streams.get(event.data.stream_id);
      if (!current) throw new Error('思考缺少起始事件，正在重新同步');
      this.streams.set(current.stream, { ...current, status: event.data.status }); return true;
    }
    if (event.event === 'artifact') {
      if (this.artifacts.has(event.data.artifact_id)) return false;
      this.artifacts.set(event.data.artifact_id, { ...event.data }); return true;
    }
    if (event.event === 'cancelled' || event.event === 'failed') {
      let changed = false;
      for (const [id, s] of this.streams) if (s.status === 'streaming') { this.streams.set(id, { ...s, status: 'aborted' }); changed = true; }
      return changed;
    }
    return false;
  }
}
