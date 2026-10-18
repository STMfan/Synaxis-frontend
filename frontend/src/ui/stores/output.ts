import type { Effort, TeachingEvent } from '../../webview/types';

export interface OutputSnapshot { stream: string; round: number; effort: Effort; text: string; status: 'streaming' | 'received' | 'aborted'; structured: boolean; truncated: boolean }
/** Provisional output never enters saved messages or executes presentation blocks. */
export class OutputPreview {
  private latestStudent = 0;
  private eligible = true;
  private finalKnown = false;
  private sequence = 0;
  private prefix = '';
  private value: OutputSnapshot | null = null;
  readonly limit = 24000;

  begin(latestStudent: number, finalKnown = false) {
    this.latestStudent = latestStudent; this.finalKnown = finalKnown;
    this.eligible = latestStudent === 0 && !finalKnown;
    this.value = null; this.sequence = 0; this.prefix = '';
  }
  snapshot(): OutputSnapshot | null { return this.value && { ...this.value }; }
  accept(event: TeachingEvent): boolean {
    if (event.event === 'message') {
      const m = event.data.message;
      if (m.role === 'student' && m.id >= this.latestStudent) {
        if (m.id > this.latestStudent) this.begin(m.id);
        this.eligible = !this.finalKnown;
      }
      if (m.role === 'assistant' && m.presentation && m.id > this.latestStudent) {
        this.finalKnown = true; this.eligible = false; this.value = null; return true;
      }
    }
    if (!this.eligible) return false;
    if (event.event === 'presentation') { this.finalKnown = true; this.eligible = false; this.value = null; return true; }
    if (event.event === 'output_start') {
      if (this.value?.stream === event.data.stream_id) return false;
      this.sequence = 0; this.prefix = '';
      this.value = { stream: event.data.stream_id, round: event.data.round, effort: event.data.effort, text: '', status: 'streaming', structured: false, truncated: false };
      return true;
    }
    if (event.event === 'output_delta') {
      if (!this.value || this.value.stream !== event.data.stream_id) throw new Error('输出缺少起始事件，正在重新同步');
      if (event.data.sequence <= this.sequence) return false;
      if (event.data.sequence !== this.sequence + 1) throw new Error('输出分片不连续，正在重新同步');
      this.sequence = event.data.sequence;
      this.prefix = (this.prefix + event.data.text).slice(0, 256);
      const text = this.value.text + event.data.text;
      this.value = { ...this.value, text: text.slice(-this.limit), truncated: this.value.truncated || text.length > this.limit,
        structured: /^\s*(?:```json\b|(?:```\s*)?\{)/.test(this.prefix) };
      return true;
    }
    if (event.event === 'output_end' && this.value?.stream === event.data.stream_id) {
      this.value = { ...this.value, status: event.data.status }; return true;
    }
    if ((event.event === 'cancelled' || event.event === 'failed') && this.value) {
      this.value = { ...this.value, status: 'aborted' }; return true;
    }
    return false;
  }
}
