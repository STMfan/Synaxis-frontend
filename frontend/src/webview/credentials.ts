import type { Tokens } from './types.ts';
export const LOGIN_LIFETIME = 28 * 24 * 60 * 60 * 1000;
export interface CredentialStore {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  remove(): Promise<void>;
}
export interface RememberedLogin { version: 1; server: string; refreshToken: string; createdAt: number; expiresAt: number }
/** Only a refresh token is persisted. The original deadline never slides on rotation. */
export class Credentials {
  record: RememberedLogin | null = null;
  private queue: Promise<void> = Promise.resolve();
  private store: CredentialStore;
  private clock: () => number;
  constructor(store: CredentialStore, clock: () => number = Date.now) { this.store = store; this.clock = clock; }
  private schedule(action: () => Promise<void>) {
    const result = this.queue.catch(() => {}).then(action);
    this.queue = result; return result;
  }
  async load(server: string) {
    await this.queue.catch(() => {});
    const raw = await this.store.read();
    if (!raw) return null;
    let value: RememberedLogin;
    try { value = JSON.parse(raw); } catch { await this.clear(); return null; }
    const now = this.clock();
    if (!value || typeof value !== 'object' || value.version !== 1 || value.server !== server || typeof value.refreshToken !== 'string' || value.refreshToken.length < 32 || !Number.isFinite(value.createdAt) || !Number.isFinite(value.expiresAt) || value.createdAt > now || value.expiresAt <= now || value.expiresAt > value.createdAt + LOGIN_LIFETIME) {
      await this.clear(); return null;
    }
    this.record = value; return { ...value };
  }
  async remember(server: string, tokens: Tokens) {
    const now = this.clock();
    this.record = { version: 1, server, refreshToken: tokens.refresh_token, createdAt: now, expiresAt: now + Math.min(LOGIN_LIFETIME, tokens.refresh_expires_in * 1000) };
    await this.save();
  }
  async rotate(tokens: Tokens) {
    if (!this.record) return;
    this.record = { ...this.record, refreshToken: tokens.refresh_token, expiresAt: Math.min(this.record.expiresAt, this.clock() + tokens.refresh_expires_in * 1000) };
    await this.save();
  }
  private save() { const value = JSON.stringify(this.record); return this.schedule(() => this.store.write(value)); }
  clear() { this.record = null; return this.schedule(() => this.store.remove()); }
}
