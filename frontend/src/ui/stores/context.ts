import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { Capabilities, ClientBridge, ErrorInfo, Profile, SessionSummary } from '../../webview/types';
export interface UiContext { bridge: ClientBridge; profile: Profile | null; capabilities: Capabilities | null; errors: ErrorInfo[]; notify(message: string): void; refresh(): Promise<void>; openSession(id: string, summary?: SessionSummary): void; navigate(page: string, id?: string): void; back(): void }
export const Context = createContext<UiContext>(null!);
export function useClient() { return useContext(Context); }
export const subjects = { chinese: '语文', english: '英语', math: '数学', physics: '物理', chemistry: '化学', biology: '生物', politics: '政治', history: '历史', geography: '地理' };
export const statuses = { queued: '排队中', running: '正在讲解', waiting: '待你回答', completed: '本轮完成', failed: '本轮中断', cancelled: '已停止' };
export const expertAssets = { Poiesis: '01-poiesis', Nexus: '02-nexus', Euclid: '03-euclid', Turing: '04-turing', Nomos: '05-nomos', Panopt: '06-panopt', Chronos: '07-chronos', Meridian: '08-meridian' };
export function date(value: string) { return new Date(value).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
export function cost(value: string | null, currency = 'CNY') { return value === null ? '未知' : `${currency === 'CNY' ? '¥' : currency === 'USD' ? '$' : currency + ' '}${Number(value).toFixed(4).replace(/0+$/, '').replace(/\.$/, '.00')}`; }
export function errorText(error: unknown, catalog: ErrorInfo[] = []) {
  const e = error as { code?: string; message?: string };
  const known = catalog.find(x => x.code === e?.code);
  return known ? `${known.zh} · ${known.recovery}` : e?.message || '操作未完成';
}
