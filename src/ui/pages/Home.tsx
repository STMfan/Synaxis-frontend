import { useRef, useState } from 'preact/hooks';
import type { SessionSummary, Subject } from '../../webview/types';
import { useClient, subjects } from '../stores/context';
import { Submission } from '../stores/submission';
import { Composer } from '../components/Composer';
import type { Draft } from '../components/Composer';
import { SubjectSelect, StatusTag } from '../components/Common';
import { Dock } from '../components/Touch';
import { Greeting } from '../components/Greeting';
import { ExpertIdentity } from '../components/Identity';
import { Icon } from '../components/Icon';
export function Home({ recent, active }: { recent: SessionSummary[]; active: boolean }) {
  const { bridge, profile, openSession, navigate } = useClient();
  const [subject, setSubject] = useState<Subject | null>(profile?.preferences.subject || null);
  const submission = useRef(new Submission());
  async function send(draft: Draft) { const payload = { ...draft, subject }; const session = await submission.current.run('create', payload, key => bridge.create(payload, key)); openSession(session.id, session); }
  return <div class="home page-content"><section class="home-intro"><Greeting active={active} /><img class="home-logo" src="/logos/00-synaxis.png" alt="Synaxis" width="36" height="36" /></section>
    <section class="recent-section"><div class="section-heading"><h2>最近会话</h2><button class="text-button" onClick={() => navigate('history')}>全部<Icon name="arrow" /></button></div>
      {recent.length ? <div class="recent-waterfall">{recent.map(s => <button class="recent-card" key={s.id} onClick={() => openSession(s.id, s)}><span class="recent-subject">{s.subject ? subjects[s.subject] : '待识别'}{s.pinned && ' · 置顶'}</span><strong data-hero-key={`title:${s.id}`}>{s.title}</strong>{s.summary && <p>{s.summary}</p>}<span class="recent-footer"><ExpertIdentity name={s.expert} heroId={s.id} /><StatusTag status={s.status} /></span></button>)}</div> : <div class="home-empty"><p>写下一个问题<br />让理解从这里开始。</p></div>}
    </section>
    {active && <Dock tabs><Composer context={<SubjectSelect compact value={subject} onChange={setSubject} />} subject={subject} onSend={send} draftKey="home" label="发送" /></Dock>}
  </div>;
}
