import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen, emit } from '@tauri-apps/api/event';
import { fetch as nativeFetch } from '@tauri-apps/plugin-http';
import type { BridgeEvents, ClientBridge, LocalSettings, Query, Session, SessionPatch, Tokens, TutorInput, MessageInput, Preferences } from './types';
import { Transport, ApiFault, responseBlob } from './transport';
import { Credentials, LOGIN_LIFETIME } from './credentials';
import { syllabusApi } from './syllabus';
import { defaultServer, validServer } from './server';

const DEFAULT_SERVER = defaultServer(import.meta.env.VITE_API_BASE_URL);
export function createBridge(): ClientBridge {
  const native = isTauri();
  const desktop = native && !/Android|iPhone|iPad/i.test(navigator.userAgent);
  let settings: LocalSettings = { server: DEFAULT_SERVER, theme: 'system', closeToTray: true };
  try { const saved = JSON.parse(localStorage.getItem('synaxis.settings') || '{}'); settings = { ...settings, ...saved, server: validServer(saved.server || DEFAULT_SERVER) }; } catch { /* invalid settings use safe defaults */ }
  const bus = new EventTarget();
  function publish<K extends keyof BridgeEvents>(key: K, data: BridgeEvents[K]) { bus.dispatchEvent(new CustomEvent(key, { detail: data })); }
  let nativePaused = false;
  const foreground = () => !nativePaused && document.visibilityState !== 'hidden';
  const lifecycle = () => publish('lifecycle', foreground());
  document.addEventListener('visibilitychange', lifecycle);
  window.addEventListener('pageshow', lifecycle);
  window.addEventListener('online', () => { if (foreground()) lifecycle(); });
  if (native && !desktop) {
    window.addEventListener('synaxis:native-pause', () => { nativePaused = true; lifecycle(); });
    window.addEventListener('synaxis:native-resume', () => { nativePaused = false; lifecycle(); });
  }
  if (native && !desktop) window.addEventListener('synaxis:native-back', event => {
    const request = { handled: false }; publish('back', request);
    if (request.handled) event.preventDefault();
  });
  const fetcher: typeof fetch = native ? (input, init) => nativeFetch(input, { ...init, maxRedirections: 0, connectTimeout: 10000 }) : window.fetch.bind(window);
  const storageKey = 'synaxis.login.v1';
  const credentials = new Credentials(native ? {
    read: () => invoke('plugin:secure-keystore|get_item', { key: storageKey }).then(value => (value as { value: string | null }).value),
    write: value => invoke('plugin:secure-keystore|set_item', { key: storageKey, value }),
    remove: () => invoke('plugin:secure-keystore|delete_item', { key: storageKey }),
  } : {
    read: async () => localStorage.getItem(storageKey),
    write: async value => { localStorage.setItem(storageKey, value); },
    remove: async () => { localStorage.removeItem(storageKey); },
  });
  let cleanup: Promise<void> = Promise.resolve();
  const transport = new Transport(() => settings.server, fetcher, () => {
    cleanup = credentials.clear(); void cleanup.catch(() => {}); publish('auth:expired', undefined);
  }, value => publish('connection', value), async tokens => { await credentials.rotate(tokens); }, {
    lock: async action => { if (!native && navigator.locks) await navigator.locks.request('synaxis.login.rotation', action); else await action(); },
    token: async () => {
      if (!credentials.record) return null;
      const saved = await credentials.load(settings.server);
      if (!saved) { transport.clear(); publish('auth:expired', undefined); throw new ApiFault('LOGIN_EXPIRED', '自动登录已结束，请重新登录', 401); }
      return saved.refreshToken;
    },
  });
  if (!native) window.addEventListener('storage', e => { if (e.key === storageKey && e.newValue === null) { accountGeneration++; transport.clear(); credentials.record = null; publish('auth:expired', undefined); } });
  let restoring: Promise<boolean> | null = null;
  let accountGeneration = 0;
  async function forget() {
    accountGeneration++; transport.clear(); publish('auth:expired', undefined);
    await cleanup.catch(() => {}); await credentials.clear();
  }
  const query = (params: Query = {}) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== '') q.set(k, String(v)); return q.size ? `?${q}` : ''; };
  const sid = (id: string) => `/v1/sessions/${encodeURIComponent(id)}`;
  async function blob(path: string) { return responseBlob(await transport.request(path)); }
  async function json<T>(path: string, init?: RequestInit, auth = true): Promise<T> { const r = await transport.request(path, init, auth); return r.status === 204 ? undefined as T : r.json(); }
  function write<T>(path: string, method: string, value?: unknown, key?: string) { return json<T>(path, { method, headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) }, body: value === undefined ? undefined : JSON.stringify(value) }); }
  if (desktop) {
    void invoke('set_close_behavior', { hide: settings.closeToTray });
    void listen<string>('navigate', e => publish('navigate', e.payload));
  }
  return {
    ...syllabusApi(transport),
    native, desktop, settings: () => ({ ...settings }),
    async appearance(theme) { if (native && !desktop) window.SynaxisSystemUi?.setDark(theme === 'dark'); },
    async configure(value) {
      const server = validServer(value.server);
      if (desktop) await invoke('set_close_behavior', { hide: value.closeToTray });
      if (settings.server !== server) await forget();
      settings = { ...value, server }; localStorage.setItem('synaxis.settings', JSON.stringify(settings)); publish('settings', settings);
      if (native) await emit('client:settings', { theme: settings.theme });
    },
    on(event, callback) { const fn = (e: Event) => callback((e as CustomEvent).detail); bus.addEventListener(event, fn); return () => bus.removeEventListener(event, fn); },
    health: () => json('/health', undefined, false),
    restore() {
      if (restoring) return restoring;
      const generation = accountGeneration, server = settings.server;
      const operation = (async () => {
        await cleanup;
        const saved = await credentials.load(server);
        if (!saved || generation !== accountGeneration) return false;
        // Check connectivity before consuming a one-time refresh token.
        await json('/health', undefined, false);
        if (generation !== accountGeneration) return false;
        transport.set({ access_token: '', refresh_token: saved.refreshToken, expires_in: 0, refresh_expires_in: 0, token_type: 'bearer' });
        transport.expires = 0; transport.deadline = saved.expiresAt;
        await transport.request('/v1/me'); return generation === accountGeneration;
      })();
      restoring = operation;
      void operation.finally(() => { if (restoring === operation) restoring = null; }).catch(() => {});
      return operation;
    },
    async login(username, password, remember = true) {
      await forget(); const generation = accountGeneration;
      const body = new URLSearchParams({ username, password });
      const tokens = await json<Tokens>('/v1/auth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() }, false);
      if (generation !== accountGeneration) throw new ApiFault('SESSION_CHANGED', '登录已变更');
      transport.set(tokens);
      transport.deadline = Date.now() + Math.min(LOGIN_LIFETIME, tokens.refresh_expires_in * 1000);
      if (remember) { try { await credentials.remember(settings.server, tokens); transport.deadline = credentials.record!.expiresAt; } catch { await forget(); throw new ApiFault('SECURE_STORAGE', '无法保存自动登录凭据，请检查系统安全存储或取消自动登录后重试'); } }
    },
    async logout() { try { await write('/v1/auth/logout', 'POST'); } finally { await forget(); } },
    forget,
    authenticated: () => transport.tokens !== null,
    foreground,
    profile: () => json('/v1/me'), preferences: () => json('/v1/me/preferences'), setPreferences: (value: Preferences) => write('/v1/me/preferences', 'PUT', value),
    async changePassword(current_password, new_password) { await write('/v1/me/password', 'POST', { current_password, new_password }); await forget(); },
    experts: () => json('/v1/experts'), capabilities: () => json('/v1/capabilities'), errors: () => json('/v1/error-codes'),
    sessions: params => json('/v1/sessions' + query(params)), session: (id, signal) => json(sid(id), { signal }),
    create: (value: TutorInput, key) => write<Session>('/v1/sessions', 'POST', value, key),
    patch: (id, patch: SessionPatch) => write(sid(id), 'PATCH', patch), remove: id => write(sid(id), 'DELETE'),
    messages: (id, after = 0, signal) => json(sid(id) + '/messages' + query({ after, limit: 100 }), { signal }),
    send: (id, value: MessageInput, key) => write(sid(id) + '/messages', 'POST', value, key),
    answer: (id, question_id, answer, key) => write(sid(id) + '/answers', 'POST', { question_id, answer }, key),
    cancel: id => write(sid(id) + '/cancel', 'POST'),
    stream: (id, after, signal, callback, healthy) => transport.stream(sid(id) + '/events' + query({ after }), after, signal, callback, healthy),
    eventHistory: (id, after = 0, signal) => json(sid(id) + '/events/history' + query({ after, limit: 100 }), { signal }), budget: (id, signal) => json(sid(id) + '/budget', { signal }),
    usage: params => json('/v1/usage' + query(params)), usageSummary: params => json('/v1/usage/summary' + query(params)),
    image: (session, message, index) => blob(sid(session) + `/messages/${message}/images/${index}`),
    artifact: id => blob('/v1/artifacts/' + encodeURIComponent(id)),
    async minimize() { if (desktop) await invoke('minimize_window'); },
    async close() { if (desktop) await invoke('close_window'); },
    async saveFile(blob, name) {
      if (native) { await invoke('save_file', { name: name.replace(/[\\/:*?"<>|]/g, '_'), bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) }); }
      else { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    },
  };
}

