import type { ComponentChildren } from 'preact';
import type { Subject, Status } from '../../webview/types';
import { subjects, statuses } from '../stores/context';
import { Icon } from './Icon';
import { Choice } from './Touch';
export function SubjectSelect({ value, onChange, compact = false }: { value: Subject | null; onChange: (value: Subject | null) => void; compact?: boolean }) { return <Choice label="科目" value={value || ''} onChange={next => onChange(next as Subject || null)} choices={[{ value: '', label: compact ? '自动' : '自动识别科目' }, ...Object.entries(subjects).map(([value, label]) => ({ value, label }))]} />; }
export function StatusTag({ status }: { status: Status }) { return <span class={`status status-${status}`} role="img" aria-label={statuses[status]} title={statuses[status]}><Icon name={({ completed: 'complete', queued: 'clock', running: 'clock', waiting: 'waiting', failed: 'error', cancelled: 'stop' })[status]} /></span>; }
export function Empty({ title, children }: { title: string; children?: ComponentChildren }) { return <div class="empty"><h2>{title}</h2><p>{children}</p></div>; }
export function Loading() { return <div class="loading" role="status"><span class="loading-dot" />正在读取…</div>; }
export function ErrorNotice({ message, retry }: { message: string; retry?: () => void }) { return <div class="error-notice" role="alert"><p>{message}</p>{retry && <button onClick={retry}>重新读取</button>}</div>; }
