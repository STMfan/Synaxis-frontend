import { useEffect, useRef, useState } from 'preact/hooks';
import type { Query, SessionSummary, Subject, Status } from '../../webview/types';
import { useClient, date, errorText, statuses, subjects } from '../stores/context';
import { Empty, ErrorNotice, Loading, StatusTag, SubjectSelect } from '../components/Common';
import { Sheet, Choice, Switch } from '../components/Touch';
import { navigation } from '../stores/navigation';
import { ExpertIdentity } from '../components/Identity';
import { Icon } from '../components/Icon';
export function SessionActions({ session, changed, disabled = false }: { session: SessionSummary; changed: (kind: string) => void; disabled?: boolean }) {
  const { bridge, notify, errors } = useClient(); const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false); const [mode, setMode] = useState(''); const [title, setTitle] = useState(session.title); const finished = useRef('');
  async function action(kind: string) { setBusy(true); try {
    if (kind === 'delete') await bridge.remove(session.id);
    if (kind === 'rename') { if (!title.trim()) return; await bridge.patch(session.id, { title: title.trim() }); }
    if (kind === 'pin') await bridge.patch(session.id, { pinned: !session.pinned });
    if (kind === 'archive') await bridge.patch(session.id, { archived: !session.archived });
    finished.current = kind; navigation.back();
  } catch (e) { notify(errorText(e, errors)); } finally { setBusy(false); } }
  return <><button class="quiet icon-button session-menu" disabled={disabled} aria-label={`管理会话：${session.title}`} onClick={() => { setMode(''); setTitle(session.title); setOpen(true); }}><Icon name="more" /></button>{open && <Sheet title={mode === 'rename' ? '重命名' : mode === 'delete' ? '删除会话' : '会话操作'} onClose={() => { setOpen(false); if (finished.current) { const kind = finished.current; finished.current = ''; changed(kind); } }}>
    {mode === 'rename' ? <form class="sheet-form" onSubmit={e => { e.preventDefault(); void action('rename'); }}><label>会话标题<input maxLength={100} required value={title} onInput={e => setTitle(e.currentTarget.value)} /></label><button class="primary" disabled={busy}>保存标题</button></form> : mode === 'delete' ? <div class="sheet-form"><p>删除“{session.title}”？正在运行的讲解将停止，客户端无法恢复。</p><button class="attention" disabled={busy} onClick={() => void action('delete')}>确认删除会话</button></div> : <div class="choice-list">{[['rename', '重命名'], ['pin', session.pinned ? '取消置顶' : '置顶'], ['archive', session.archived ? '取消归档' : '归档'], ['delete', '删除会话']].map(([kind, text]) => <button key={kind} disabled={busy} class={kind === 'delete' ? 'attention' : ''} onClick={() => { if (kind === 'rename' || kind === 'delete') setMode(kind); else void action(kind); }}>{text}</button>)}</div>}
  </Sheet>}</>;
}
export function History({ active = true }: { active?: boolean }) {
  const { bridge, openSession, errors } = useClient(); const [items, setItems] = useState<SessionSummary[]>([]); const [cursor, setCursor] = useState<string | null>(null); const [busy, setBusy] = useState(true); const [error, setError] = useState('');
  const [q, setQ] = useState(''); const [subject, setSubject] = useState<Subject | null>(null); const [status, setStatus] = useState<Status | ''>(''); const [archived, setArchived] = useState('exclude'); const [pinned, setPinned] = useState(false); const [filter, setFilter] = useState(false); const generation = useRef(0);
  async function load(more = false) { const gen = ++generation.current; setBusy(true); setError(''); try { const params: Query = { q: q.trim(), subject, status, archived, pinned: pinned ? true : undefined, limit: 20, cursor: more ? cursor : null }; const page = await bridge.sessions(params); if (gen === generation.current) { setItems(old => more ? [...old, ...page.items.filter(x => !old.some(y => y.id === x.id))] : page.items); setCursor(page.next_cursor); } } catch (e) { if (gen === generation.current) setError(errorText(e, errors)); } finally { if (gen === generation.current) setBusy(false); } }
  useEffect(() => { if (!active) return; const timer = setTimeout(() => void load(), 180); return () => { clearTimeout(timer); generation.current++; }; }, [q, subject, status, archived, pinned, active]);
  const applied = !!(subject || status || archived !== 'exclude' || pinned);
  return <div class="page-content history-page"><div class="page-heading"><h1>会话</h1><button class={`quiet filter-button ${applied ? 'applied' : ''}`} aria-label="筛选" onClick={() => setFilter(true)}><Icon name="filter" />{applied && <i />}</button></div><input class="history-search" type="search" aria-label="搜索会话" placeholder="搜索题目与摘要" maxLength={100} value={q} onInput={e => setQ(e.currentTarget.value)} />
    {error && <ErrorNotice message={error} retry={() => void load()} />}
    <div class="history-list">{items.map(s => <div class="history-row" key={s.id}><button class="session-row" onClick={() => openSession(s.id, s)}><span class="session-copy"><strong data-hero-key={`title:${s.id}`}>{s.pinned && <span aria-label="已置顶"><Icon name="pin" /></span>}{s.title}</strong><small>{s.subject ? subjects[s.subject] : '待识别'}{s.expert && <> · <ExpertIdentity name={s.expert} heroId={s.id} /></>} · {date(s.updated_at)}{s.archived ? ' · 已归档' : ''}</small></span><StatusTag status={s.status} /></button><SessionActions session={s} changed={() => void load()} /></div>)}</div>{busy && <Loading />}{!items.length && !busy && !error && <Empty title="还没有会话">调整筛选，或开始新的提问。</Empty>}{cursor && <button disabled={busy} onClick={() => void load(true)}>读取更多会话</button>}
    {filter && <Sheet title="筛选会话" onClose={() => setFilter(false)}><div class="sheet-form"><label>科目<SubjectSelect value={subject} onChange={setSubject} /></label><label>状态<Choice label="会话状态" value={status} choices={[{ value: '', label: '全部状态' }, ...Object.entries(statuses).map(([value, label]) => ({ value, label }))]} onChange={value => setStatus(value as Status | '')} /></label><label>归档<Choice label="归档筛选" value={archived} choices={[{ value: 'exclude', label: '未归档' }, { value: 'only', label: '已归档' }, { value: 'all', label: '全部会话' }]} onChange={setArchived} /></label><Switch label="仅置顶" checked={pinned} onChange={setPinned} /><div class="button-row"><button onClick={() => { setSubject(null); setStatus(''); setArchived('exclude'); setPinned(false); }}>重置筛选</button><button class="primary" onClick={() => navigation.back()}>完成</button></div></div></Sheet>}
  </div>;
}
