/** One key per logical submission; uncertain retries reuse the original key. */
export class Submission {
  private signature = '';
  private key = '';
  private inFlight = false;
  async run<T>(operation: string, payload: unknown, submit: (key: string) => Promise<T>) {
    if (this.inFlight) throw new Error('当前提交尚未完成');
    const signature = JSON.stringify([operation, payload]);
    if (signature !== this.signature) { this.signature = signature; this.key = crypto.randomUUID(); }
    this.inFlight = true;
    try { const result = await submit(this.key); this.signature = ''; this.key = ''; return result; }
    finally { this.inFlight = false; }
  }
}
