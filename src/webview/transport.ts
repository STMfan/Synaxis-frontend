import type { ClientFault, Tokens, TeachingEvent } from './types.ts';
import { parseSse } from './sse.ts';
import { checkAbort, deadlineSignal } from './abort.ts';
/** Some native fetch adapters override public Headers but not Body's MIME slot. */
export async function responseBlob(response: Response) {
  const value = await response.blob();
  return new Blob([value], { type: response.headers.get('Content-Type')?.split(';')[0].trim() || value.type || 'application/octet-stream' });
}
export class ApiFault extends Error implements ClientFault {
  code: string; status: number; offline: boolean;
  constructor(code: string, message: string, status = 0, offline = false) { super(message); this.name = 'ApiFault'; this.code = code; this.status = status; this.offline = offline; }
}
/** Refresh rotation is single-flight; an ambiguous response discards both tokens. */
export class Transport {
  tokens: Tokens | null = null;
  expires = 0;
  deadline = Infinity;
  private generation = 0;
  private refreshing: Promise<void> | null = null;
  private base: () => string;
  private fetcher: typeof fetch;
  private expired: () => void;
  private connected: (online: boolean) => void;
  private rotated: (tokens: Tokens) => Promise<void>;
  private rotation: { lock: (action: () => Promise<void>) => Promise<void>; token: () => Promise<string | null> } | undefined;
  constructor(base: () => string, fetcher: typeof fetch, expired: () => void, connected: (online: boolean) => void, rotated: (tokens: Tokens) => Promise<void> = async () => {}, rotation?: { lock: (action: () => Promise<void>) => Promise<void>; token: () => Promise<string | null> }) { this.base = base; this.fetcher = fetcher; this.expired = expired; this.connected = connected; this.rotated = rotated; this.rotation = rotation; }
  clear() { this.tokens = null; this.expires = 0; this.deadline = Infinity; this.generation++; this.refreshing = null; }
  set(tokens: Tokens) { this.tokens = tokens; this.expires = Date.now() + tokens.expires_in * 1000; }
  private async refresh() {
    if (!this.tokens) throw new ApiFault('UNAUTHORIZED', '请先登录', 401);
    if (!this.refreshing) {
      const generation = this.generation;
      const rotate = async () => {
        if (this.generation !== generation) throw new ApiFault('SESSION_CHANGED', '登录已变更');
        const refresh_token = await this.rotation?.token() || this.tokens!.refresh_token;
        if (this.generation !== generation) throw new ApiFault('SESSION_CHANGED', '登录已变更');
        if (Date.now() >= this.deadline) { this.clear(); this.expired(); throw new ApiFault('LOGIN_EXPIRED', '28 天自动登录凭据已过期，请重新登录', 401); }
        try { const r = await this.raw('/v1/auth/refresh', { method: 'POST', body: JSON.stringify({ refresh_token }), headers: { 'Content-Type': 'application/json' } }); const tokens = await r.json(); if (this.generation !== generation) throw new ApiFault('SESSION_CHANGED', '服务连接或登录已变更'); this.set(tokens); await this.rotated(tokens); }
        catch (error) { if (this.generation === generation) { this.clear(); this.expired(); } throw error; }
      };
      const operation = this.rotation ? this.rotation.lock(rotate) : rotate();
      this.refreshing = operation;
      void operation.finally(() => { if (this.refreshing === operation) this.refreshing = null; }).catch(() => {});
    }
    await this.refreshing;
  }
  private async raw(path: string, init: RequestInit) {
    try {
      // Read cancellation must retain the ordinary request deadline; live SSE has no body deadline.
      const streaming = new Headers(init.headers).get('Accept') === 'text/event-stream';
      const signal = streaming && init.signal ? init.signal : deadlineSignal(init.signal);
      const response = await this.fetcher(this.base() + path, { ...init, redirect: 'error', signal });
      checkAbort(signal);
      this.connected(true);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const detailCode = typeof body.detail === 'string' && /^[A-Z][A-Z0-9_]+$/.test(body.detail) ? body.detail : undefined;
        throw new ApiFault(body.code || detailCode || `HTTP_${response.status}`, typeof body.detail === 'string' ? body.detail : '请求未完成，请检查输入或服务状态', response.status);
      }
      return response;
    } catch (error) {
      if (error instanceof ApiFault || init.signal?.aborted) throw error;
      if (typeof error === 'string' && /not allowed|denied|invalid args/i.test(error)) throw new ApiFault('NATIVE_PERMISSION', `原生通信权限或参数错误：${error}`);
      this.connected(false); throw new ApiFault('OFFLINE', '无法连接服务。已保留当前内容；不会自动重新提交收费请求。', 0, true);
    }
  }
  async request(path: string, init: RequestInit = {}, auth = true) {
    checkAbort(init.signal);
    if (auth && this.tokens && Date.now() >= this.deadline) { this.clear(); this.expired(); throw new ApiFault('LOGIN_EXPIRED', '28 天自动登录凭据已过期，请重新登录', 401); }
    const generation = this.generation;
    if (auth && this.tokens && this.expires < Date.now() + 30000) await this.refresh();
    checkAbort(init.signal);
    if (generation !== this.generation) throw new ApiFault('SESSION_CHANGED', '服务连接或登录已变更');
    const issued = this.tokens?.access_token;
    const headers = new Headers(init.headers);
    if (auth) { if (!issued) throw new ApiFault('UNAUTHORIZED', '请先登录', 401); headers.set('Authorization', `Bearer ${issued}`); }
    try { return await this.raw(path, { ...init, headers }); }
    catch (error) {
      if (auth && error instanceof ApiFault && error.status === 401 && this.tokens && generation === this.generation) {
        if (this.tokens.access_token === issued) await this.refresh();
        if (generation !== this.generation) throw new ApiFault('SESSION_CHANGED', '服务连接或登录已变更');
        headers.set('Authorization', `Bearer ${this.tokens!.access_token}`);
        try { return await this.raw(path, { ...init, headers }); }
        catch (second) { if (second instanceof ApiFault && second.status === 401) { this.clear(); this.expired(); } throw second; }
      }
      throw error;
    }
  }
  async stream(path: string, after: number, signal: AbortSignal, callback: (event: TeachingEvent) => void, healthy = () => {}) {
    const response = await this.request(path, { headers: { Accept: 'text/event-stream', 'Last-Event-ID': String(after) }, signal });
    checkAbort(signal);
    if (!response.body) throw new ApiFault('STREAM_UNAVAILABLE', '当前 WebView 不支持事件流');
    await parseSse(response.body, signal, event => {
      // A non-durable authentication frame is not a failed teaching round.
      if (event.event === 'failed' && event.data.code === 'UNAUTHORIZED' && event.id === 0) {
        this.expires = 0; throw new ApiFault('STREAM_AUTH_EXPIRED', '事件流需要刷新登录', 401);
      }
      callback(event);
    }, () => { this.connected(true); healthy(); }, () => this.connected(false));
  }
}
