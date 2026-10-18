import type { Status } from '../../webview/types';

interface RecoveryOptions {
  foreground(): boolean;
  authenticated(): boolean;
  synchronize(signal: AbortSignal): Promise<Status>;
  stream(signal: AbortSignal, healthy: () => void): Promise<void>;
  healthy(): void;
  issue(error: unknown): void;
  retryDelay?(attempt: number): number;
}
const running = (status: Status) => status === 'queued' || status === 'running';
function pause(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>(resolve => {
    const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); };
    const timer = setTimeout(done, milliseconds);
    signal.addEventListener('abort', done, { once: true });
    if (signal.aborted) done();
  });
}

/** One read-only recovery task, one live subscriber; callbacks from old generations are inert. */
export class SessionRecovery {
  private options: RecoveryOptions;
  private controller: AbortController | null = null;
  private recovery: Promise<Status | null> | null = null;
  private disposed = false;
  constructor(options: RecoveryOptions) { this.options = options; }
  private current(controller: AbortController) {
    return !this.disposed && this.controller === controller && !controller.signal.aborted && this.options.foreground();
  }
  suspend() { this.controller?.abort(); this.controller = null; this.recovery = null; }
  dispose() { this.disposed = true; this.suspend(); }
  recover(): Promise<Status | null> {
    if (this.disposed || !this.options.foreground()) return Promise.resolve(null);
    if (this.recovery) return this.recovery;
    this.suspend();
    const controller = new AbortController(); this.controller = controller;
    const task = this.synchronize(controller);
    void task.then(status => { if (this.current(controller) && (!status || running(status))) void this.consume(controller, status); });
    return task;
  }
  private synchronize(controller: AbortController): Promise<Status | null> {
    const task = Promise.resolve().then(() => this.options.synchronize(controller.signal)).then(status => {
      if (!this.current(controller)) return null;
      this.options.healthy(); return status;
    }).catch(error => {
      if (this.current(controller)) this.options.issue(error);
      return null;
    }).finally(() => { if (this.recovery === task) this.recovery = null; });
    this.recovery = task;
    return task;
  }
  private async consume(controller: AbortController, status: Status | null) {
    let attempts = 0;
    while (this.current(controller) && this.options.authenticated()) {
      if (status) {
        if (!running(status)) return;
        try {
          await this.options.stream(controller.signal, () => {
            if (this.current(controller)) { attempts = 0; this.options.healthy(); }
          });
          if (!this.current(controller)) return;
          // Normal EOF is a round boundary. Query immediately, including empty terminal tails.
          status = await this.synchronize(controller);
          if (status && !running(status)) return;
        } catch (error) {
          if (!this.current(controller)) return;
          this.options.issue(error);
        }
      }
      if (!this.options.authenticated()) return;
      attempts++;
      await pause(this.options.retryDelay?.(attempts) ?? Math.min(15000, 1000 * 2 ** Math.min(attempts - 1, 4)), controller.signal);
      if (!this.current(controller)) return;
      // A failed read must not open an unverified subscription or repeat a teaching POST.
      status = await this.synchronize(controller);
    }
  }
}
