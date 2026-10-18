import { Fragment } from 'preact';
import { SessionHeader } from '../components/SessionHeader';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Budget, PublicMessage, Session as Model, SessionSummary, TeachingEvent, RoundArtifact, Status } from '../../webview/types';
import { useClient, cost, date, errorText, subjects } from '../stores/context';
import { Submission } from '../stores/submission';
import { ReasoningStreams } from '../stores/reasoning';
import type { ReasoningSnapshot } from '../stores/reasoning';
import { Reasoning } from '../components/Reasoning';
import { FileBlock } from '../components/Media';
import { ExpertIdentity } from '../components/Identity';
import { OutputPreview } from '../stores/output';
import type { OutputSnapshot } from '../stores/output';
import { Composer } from '../components/Composer';
import type { Draft } from '../components/Composer';
import { Presentation, StreamingMarkdown } from '../components/Presentation';
import { Empty, ErrorNotice, Loading, StatusTag } from '../components/Common';
import { SessionActions } from './History';
import { Icon } from '../components/Icon';
import { Dock, Sheet } from '../components/Touch';
import { navigation } from '../stores/navigation';
import { SessionRecovery } from '../stores/recovery';

function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw signal.reason ?? new DOMException('Request cancelled', 'AbortError');
}

function MessageImage({ session, message, index }: { session: string; message: number; index: number }) {
  const { bridge } = useClient(); const [url, setUrl] = useState(''); const [error, setError] = useState('');
  useEffect(() => { let active = true, object = ''; void bridge.image(session, message, index).then(blob => { if (active) { object = URL.createObjectURL(blob); setUrl(object); } }).catch(e => { if (active) setError(errorText(e)); }); return () => { active = false; if (object) URL.revokeObjectURL(object); }; }, [session, message, index]);
  return url ? <img class="message-image" src={url} alt="学生提交的题图" /> : <span class="muted">{error || '读取题图…'}</span>;
}
export function BudgetPanel({ budget }: { budget: Budget }) {
  return <div class="budget-panel"><h3>本题预算</h3><div class="budget-bar" aria-label={`已用${budget.spent}元，不确定${budget.uncertain}元，预留${budget.reserved}元，可用${budget.available}元`}>{(['spent', 'uncertain', 'reserved'] as const).map(key => <span key={key} class={`budget-${key}`} style={{ width: `${Math.max(0, Math.min(100, Number(budget[key]) / Number(budget.limit) * 100))}%` }} />)}</div><dl>{[['总额', budget.limit], ['已用', budget.spent], ['不确定占用', budget.uncertain], ['调用预留', budget.reserved], ['可用', budget.available]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{cost(value)}</dd></div>)}</dl><p class="muted">费用为估算；超时、取消或用量缺失可能继续占用预算。</p></div>;
}
export function Session({ id, summary }: { id: string; summary?: SessionSummary }) {
  const { bridge, capabilities, notify, errors, navigate, back } = useClient();
  const [session, setSession] = useState<Model | null>(null); const [messages, setMessages] = useState<PublicMessage[]>([]); const [budget, setBudget] = useState<Budget | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [streamNote, setStreamNote] = useState(''); const [warning, setWarning] = useState('');
  const [answer, setAnswer] = useState(''); const [answerBusy, setAnswerBusy] = useState(false); const [cancelling, setCancelling] = useState(false); const [progress, setProgress] = useState('正在讲解…');
  const [preview, setPreview] = useState<OutputSnapshot | null>(null); const [showJump, setShowJump] = useState(false); const [showBudget, setShowBudget] = useState(false);
  const [thoughts, setThoughts] = useState<ReasoningSnapshot[]>([]); const [logs, setLogs] = useState<RoundArtifact[]>([]);
  const reasoning = useRef(new ReasoningStreams());
  const [showAnswer, setShowAnswer] = useState(false);
  const [eventLog, setEventLog] = useState<TeachingEvent[]>([]); const [eventAfter, setEventAfter] = useState<number | null>(0);
  const submission = useRef(new Submission()); const output = useRef(new OutputPreview()); const cursor = useRef(0); const latestStudent = useRef(0); const replaying = useRef(true);
  const recovery = useRef<SessionRecovery | null>(null); const status = useRef<Status>('queued');
  const alive = useRef(true); const frame = useRef(0); const follow = useRef(true);
  const bottom = useRef<HTMLDivElement>(null); const answerPanel = useRef<HTMLFormElement>(null);
  const merge = (incoming: PublicMessage[]) => setMessages(old => [...new Map([...old, ...incoming].map(m => [m.id, m])).values()].sort((a, b) => a.id - b.id));
  function publish() {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => { frame.current = 0; if (alive.current) { setPreview(output.current.snapshot()); setThoughts(reasoning.current.snapshots()); setLogs(reasoning.current.logs()); if (!follow.current) setShowJump(true); } });
  }
  async function sync(begin = false, signal?: AbortSignal) {
    const current = await bridge.session(id, signal); checkAbort(signal); if (!alive.current) return current;
    status.current = current.status;
    setSession(current); let after = 0; const all: PublicMessage[] = [];
    do { const page = await bridge.messages(id, after, signal); checkAbort(signal); if (!alive.current) return current; all.push(...page.items); if (page.next_after === null) break; after = page.next_after; } while (alive.current);
    merge(all);
    latestStudent.current = all.filter(m => m.role === 'student').at(-1)?.id || 0;
    if (begin) {
      output.current.begin(latestStudent.current, all.some(m => m.role === 'assistant' && m.presentation && m.id > latestStudent.current));
      replaying.current = latestStudent.current > 0 && cursor.current === 0; setPreview(null);
    }
    // A formal reply found by polling replaces its preview before event replay finishes.
    for (const message of all) if (message.role === 'assistant' && message.presentation && message.id > latestStudent.current) {
      if (output.current.accept({ id: 0, event: 'message', data: { message } })) publish();
    }
    const b = await bridge.budget(id, signal); checkAbort(signal); if (alive.current) setBudget(b); return current;
  }
  function handle(event: TeachingEvent) {
    if (event.id && event.id <= cursor.current) return;
    if (reasoning.current.accept(event)) publish();
    if (event.event === 'message') {
      merge([event.data.message]);
      if (event.data.message.role === 'student' && event.data.message.id >= latestStudent.current) replaying.current = false;
    }
    if (!replaying.current) {
      // A sequence gap throws before the durable cursor advances; reconnect replays it.
      if (output.current.accept(event)) publish();
      if (event.event === 'plan') { setSession(s => s && ({ ...s, subject: event.data.subject, expert: event.data.expert })); if (event.data.thinking === 'max') setProgress('正在深入思考…'); }
      if (event.event === 'reasoning_start') setProgress('正在思考…');
      if (event.event === 'thinking') setProgress('正在深入思考…');
      if (event.event === 'warning') setWarning('部分内容未能排版，已保留原文');
      if (event.event === 'tool') setProgress(event.data.name === 'Syllabus' ? '正在查阅课程标准…' : '正在查证与计算…');
      if (event.event === 'output_start') setProgress(event.data.effort === 'max' ? '正在深入思考…' : '正在讲解…');
      if (event.event === 'output_end' && event.data.status === 'received') setProgress('正在确认回复…');
      if (event.event === 'waiting') { status.current = 'waiting'; setSession(s => s && ({ ...s, status: 'waiting', question: event.data.question })); }
      if (['queued', 'running', 'completed', 'failed', 'cancelled'].includes(event.event)) { status.current = event.event as Status; setSession(s => s && ({ ...s, status: status.current, error: 'code' in event.data ? event.data.code : s.error })); }
    }
    if (event.id) cursor.current = event.id;
  }
  async function load() { setError(''); return recovery.current?.recover(); }
  useEffect(() => {
    alive.current = true;
    const connection = new SessionRecovery({
      foreground: bridge.foreground, authenticated: bridge.authenticated,
      async synchronize(signal) {
        try {
          await sync(cursor.current === 0, signal);
          // Cursor, body/reasoning sequences and messages stay together in this component.
          let after = cursor.current;
          do {
            const events = await bridge.eventHistory(id, after, signal); checkAbort(signal); if (!alive.current) return status.current;
            for (const event of events.items) handle(event);
            if (events.next_after === null) break; after = events.next_after;
          } while (alive.current);
          return status.current;
        } finally { if (!signal.aborted && alive.current) setLoading(false); }
      },
      stream: (signal, healthy) => bridge.stream(id, cursor.current, signal, event => { if (!signal.aborted && alive.current) handle(event); }, healthy),
      healthy: () => { setStreamNote(''); setError(''); },
      issue: e => setStreamNote(`连接中断，正在续接。${errorText(e, errors)}`),
    });
    recovery.current = connection;
    const lifecycle = bridge.on('lifecycle', visible => { if (visible) void connection.recover(); else connection.suspend(); });
    void connection.recover();
    const onScroll = () => { if (document.documentElement.dataset.transitioning === 'true') return; follow.current = document.documentElement.scrollHeight - innerHeight - scrollY < 180; if (follow.current) setShowJump(false); };
    addEventListener('scroll', onScroll, { passive: true });
    return () => { alive.current = false; lifecycle(); connection.dispose(); recovery.current = null; cancelAnimationFrame(frame.current); removeEventListener('scroll', onScroll); };
  }, [id]);
  useEffect(() => { if (document.documentElement.dataset.transitioning !== 'true' && follow.current && (preview || thoughts.some(t => t.status === 'streaming'))) bottom.current?.scrollIntoView({ block: 'end', behavior: 'instant' }); }, [preview, thoughts]);
  async function send(draft: Draft) { const current = await submission.current.run('message:' + id, draft, key => bridge.send(id, draft, key)); if (!alive.current) return; setSession(current); setWarning(''); setProgress('正在讲解…'); follow.current = true; recovery.current?.suspend(); void load(); }
  async function submitAnswer(e: Event) { e.preventDefault(); if (!session?.question || !answer.trim() || answerBusy) return; setAnswerBusy(true); const payload = { question_id: session.question.id, answer }; try { const current = await submission.current.run('answer:' + id, payload, key => bridge.answer(id, payload.question_id, payload.answer, key)); if (!alive.current) return; setSession(current); setAnswer(''); setWarning(''); setProgress('正在讲解…'); follow.current = true; recovery.current?.suspend(); void load(); navigation.back(); } catch (e) { notify(errorText(e, errors)); } finally { if (alive.current) setAnswerBusy(false); } }
  async function stop() { setCancelling(true); try { const current = await bridge.cancel(id); if (!alive.current) return; recovery.current?.suspend(); setSession(current); const event: TeachingEvent = { id: 0, event: 'cancelled', data: { code: 'CANCELLED' } }; output.current.accept(event); reasoning.current.accept(event); publish(); await load(); } catch (e) { notify(errorText(e, errors)); } finally { if (alive.current) setCancelling(false); } }
  async function history() { if (eventAfter === null) return; try { const page = await bridge.eventHistory(id, eventAfter); setEventLog(old => [...new Map([...old, ...page.items].map(e => [e.id, e])).values()]); setEventAfter(page.next_after); } catch (e) { notify(errorText(e, errors)); } }
  // List metadata supplies a stable Hero destination while the full lesson loads.
  const heading = session || summary;
  const header = heading && <SessionHeader><button class="quiet icon-button" aria-label="返回上一屏" onClick={back}><Icon name="back" /></button><div class="session-title"><h1 data-hero-key={`title:${id}`}>{heading.title}</h1><div class="teacher-line"><ExpertIdentity name={heading.expert} heroId={id} />{heading.expert && <span class="teacher-separator" aria-hidden="true">·</span>}<span class="session-subject">{heading.subject ? subjects[heading.subject] : '自动识别'}</span><StatusTag status={heading.status} /></div></div><button class="quiet icon-button budget-toggle" disabled={!session} aria-label="本题预算" onClick={() => setShowBudget(true)}><Icon name="wallet" /></button><SessionActions session={heading} disabled={!session} changed={kind => { if (kind === 'delete') back(); else void load(); }} /></SessionHeader>;
  if (!session) return <div class="session-layout"><main class="session-main">{header}{loading ? <Loading /> : <ErrorNotice message={streamNote || error || '会话不可读取'} retry={() => void load()} />}{heading && !heading.archived && <Dock><Composer compact disabled subject={heading.subject} draftKey={`session:${id}`} onSend={send} /></Dock>}</main></div>;
  const referenced = new Set(messages.flatMap(m => m.presentation?.blocks.flatMap(b => b.type === 'localfile' ? [b.artifact_id] : b.type === 'branch' ? b.tabs.flatMap(t => t.blocks.filter(x => x.type === 'localfile').map(x => x.type === 'localfile' ? x.artifact_id : '')) : []) || []));
  const separateLogs = logs.filter(log => !referenced.has(log.artifact_id));
  const active = ['queued', 'running'].includes(session.status); const expert = capabilities?.experts.find(e => e.name === session.expert); const imageSubject = session.subject === 'chinese' || expert?.images === false ? 'chinese' : session.subject;
  return <div class="session-layout"><main class="session-main">
    {header}
    {error && <ErrorNotice message={error} retry={() => void load()} />}{streamNote && <ErrorNotice message={streamNote} retry={() => void load()} />}{warning && <p class="warning" role="status">{warning}</p>}
    <div class="conversation">{messages.length ? messages.map(message => <Fragment key={message.id}><article class={`message message-${message.role}`}><div class="message-meta"><span>{message.role === 'student' ? '我' : '讲解'}</span><time>{date(message.created_at)}</time></div>{message.text && <p class="student-text">{message.text}</p>}{message.images.map(im => <MessageImage key={im.index} session={id} message={message.id} index={im.index} />)}{message.presentation && <Presentation value={message.presentation} />}</article>{message.role === 'student' && thoughts.filter(t => t.submission === message.id).map(t => <Reasoning key={t.stream} value={t} />)}</Fragment>) : <Empty title="问题已收到">老师的讲解会出现在这里。</Empty>}
      {thoughts.filter(t => t.submission === 0).map(thought => <Reasoning key={thought.stream} value={thought} />)}
      {preview && <article class={`output-preview ${preview.status}`} aria-label="实时回复预览"><div class="preview-label">{preview.status === 'aborted' ? '未完成的回复' : preview.status === 'received' ? '正在确认回复…' : progress}</div>{!preview.structured && preview.text && <StreamingMarkdown text={preview.text} />}{preview.truncated && !preview.structured && <p class="muted">较长内容将在完成后完整显示。</p>}{preview.status === 'aborted' && <p class="muted">本轮已中断，以上内容尚未完成。</p>}</article>}
      {!!separateLogs.length && <details class="round-logs"><summary><Icon name="file" />轮次日志 <span>{separateLogs.length}</span></summary>{separateLogs.map(log => <div key={log.artifact_id}>{log.status === 'aborted' && <span class="muted">本轮已中断</span>}<FileBlock id={log.artifact_id} label={log.name} mime={log.mime} /></div>)}</details>}
    </div>
    {session.error && <div class="warning">{errorText({ code: session.error, message: '本轮已中断' }, errors)}</div>}
    {session.archived && <div class="warning">会话已归档。<button onClick={async () => { try { setSession(await bridge.patch(id, { archived: false })); } catch (e) { notify(errorText(e, errors)); } }}>取消归档</button></div>}
    {!session.archived && <Dock>{active ? <div class="running-strip" role="status"><span class="loading-dot" /><span>{progress}</span><button class="stop-button" disabled={cancelling} onClick={() => void stop()}>{cancelling ? '停止中…' : '停止本轮'}</button></div> : session.status === 'waiting' && session.question ? <button class="primary answer-trigger" onClick={() => setShowAnswer(true)}>回答老师的问题<Icon name="arrow" /></button> : <Composer compact subject={imageSubject} draftKey={`session:${id}`} onSend={send} label="发送" />}</Dock>}
    <div ref={bottom} class="conversation-end" />{showJump && active && <button class="jump-latest" onClick={() => { follow.current = true; setShowJump(false); bottom.current?.scrollIntoView({ behavior: 'instant', block: 'end' }); }}>新内容<Icon name="down" /></button>}
    {showBudget && <Sheet title="本题预算" onClose={() => setShowBudget(false)}>{budget ? <BudgetPanel budget={budget} /> : <p>预算暂不可用</p>}<p class="muted">{session.grade} · {session.province || '未设省份'} · {session.textbook}</p><details class="event-history"><summary onClick={() => { if (!eventLog.length) void history(); }}>服务诊断</summary>{eventLog.map(e => <div class="event-row" key={e.id}><code>#{e.id}</code><span>{e.event}</span>{'code' in e.data && <small>{e.data.code}</small>}</div>)}{eventAfter !== null && <button onClick={() => void history()}>更多事件</button>}</details></Sheet>}
    {showAnswer && <Sheet title="回答问题" onClose={() => setShowAnswer(false)}><form ref={answerPanel} class="answer-panel sheet-form" onSubmit={submitAnswer}><h2>{session.question?.prompt}</h2>{!!session.question?.options.length && <div class="answer-options" role="radiogroup" aria-label="回答选项">{session.question.options.map(option => <button type="button" role="radio" aria-checked={answer === option} onClick={() => setAnswer(option)}><span>{option}</span>{answer === option && <Icon name="check" />}</button>)}</div>}<label>你的回答<textarea maxLength={10000} value={answer} onInput={e => setAnswer(e.currentTarget.value)} rows={2} required /></label><button class="primary" disabled={answerBusy || !answer.trim()}>{answerBusy ? '提交中…' : '提交回答'}<Icon name="arrow" /></button></form></Sheet>}
  </main><aside class="session-aside"><h2>本题资料</h2><p>{session.grade} · {session.province || '未设省份'}<br />{session.textbook}</p>{budget && <BudgetPanel budget={budget} />}</aside></div>;
}
