import { useEffect, useRef, useState } from 'preact/hooks';
import type { Capabilities, ClientBridge, ErrorInfo, Profile, SessionSummary } from '../webview/types';
import { Context, errorText, subjects } from './stores/context';
import { Icon } from './components/Icon';
import { Home } from './pages/Home';
import { History } from './pages/History';
import { Session } from './pages/Session';
import { Settings } from './pages/Settings';
import { Login } from './pages/Login';
import { Usage } from './pages/Usage';
import { About } from './pages/About';
import { Syllabus, SyllabusSection } from './pages/Syllabus';
import { transition, themeTransition } from './stores/transitions';
import { drafts } from './stores/drafts';
import { Navigation, installNavigation } from './stores/navigation';

export function App({ bridge }: { bridge: ClientBridge }) {
  const [restoring, setRestoring] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [errors, setErrors] = useState<ErrorInfo[]>([]);
  const [recent, setRecent] = useState<SessionSummary[]>([]);
  const [route, setRoute] = useState({ page: 'home', id: '' });
  const [online, setOnline] = useState(true); const [toast, setToast] = useState('');
  const [local, setLocal] = useState(bridge.settings());
  const lastRoute = useRef({ page: 'home', id: '' });
  const navController = useRef<Navigation>(); const exitPress = useRef(0);
  const headings = useRef(new Map<string, SessionSummary>());
  if (!navController.current) {
    navController.current = new Navigation((next, backward, position) => {
      document.documentElement.dataset.direction = backward ? 'back' : 'forward';
      transition(() => setRoute(next), lastRoute.current, next, backward, position); lastRoute.current = next;
    });
    installNavigation(navController.current);
  }
  const nav = navController.current;
  const { page, id } = route;
  const notify = (message: string) => setToast(message);
  const navigate = (page: string, id = '') => nav.go({ page, id });
  const openSession = (id: string, summary = recent.find(s => s.id === id)) => {
    if (summary) { headings.current.delete(id); headings.current.set(id, summary); if (headings.current.size > 40) headings.current.delete(headings.current.keys().next().value!); }
    nav.go({ page: 'session', id });
  };
  const back = () => { if (!nav.back()) navigate('home'); };
  useEffect(() => {
    performance.mark('synaxis:ui-ready');
    document.documentElement.dataset.platform = bridge.native ? bridge.desktop ? 'desktop' : 'mobile' : 'web';
    document.documentElement.dataset.pageMotion = 'viewport';
    const pointer = () => { document.documentElement.dataset.inputMethod = 'pointer'; };
    const keyboard = (e: KeyboardEvent) => { if (e.key === 'Tab') document.documentElement.dataset.inputMethod = 'keyboard'; };
    addEventListener('pointerdown', pointer, { passive: true }); addEventListener('keydown', keyboard);
    setRoute(nav.current()); lastRoute.current = nav.current();
    const stop = nav.start(); return () => { stop(); removeEventListener('pointerdown', pointer); removeEventListener('keydown', keyboard); };
  }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 5000); return () => clearTimeout(timer); }, [toast]);
  async function refresh() {
    const me = await bridge.profile(); setProfile(me);
    const results = await Promise.allSettled([bridge.capabilities(), bridge.errors(), bridge.sessions({ limit: 12 })]);
    if (results[0].status === 'fulfilled') setCapabilities(results[0].value); else notify(errorText(results[0].reason));
    if (results[1].status === 'fulfilled') setErrors(results[1].value.items);
    if (results[2].status === 'fulfilled') setRecent(results[2].value.items);
  }
  useEffect(() => {
    const unsub = [bridge.on('auth:expired', () => { setProfile(null); setCapabilities(null); setErrors([]); setRecent([]); headings.current.clear(); drafts.clear(); nav.reset(); }), bridge.on('connection', setOnline), bridge.on('settings', setLocal), bridge.on('navigate', navigate), bridge.on('back', request => {
      if (nav.back()) { request.handled = true; exitPress.current = 0; return; }
      if (nav.current().page !== 'home') { navigate('home'); request.handled = true; return; }
      if (Date.now() - exitPress.current > 2000) { exitPress.current = Date.now(); notify('再返回一次退出应用'); request.handled = true; }
    })];
    void bridge.health().catch(e => { setOnline(false); notify(errorText(e)); });
    let active = true;
    void bridge.restore().then(async restored => { if (active && restored) await refresh(); }).catch(e => { if (active) notify(errorText(e)); }).finally(() => { if (active) setRestoring(false); });
    return () => { active = false; unsub.forEach(fn => fn()); };
  }, []);
  useEffect(() => { if (profile && page === 'home') void bridge.sessions({ limit: 12 }).then(p => setRecent(p.items)).catch(() => {}); }, [page, profile?.id]);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const theme = local.theme === 'system' ? media.matches ? 'dark' : 'light' : local.theme;
      const previous = document.documentElement.dataset.theme;
      const change = () => { document.documentElement.dataset.theme = theme; document.documentElement.style.colorScheme = theme; };
      if (previous && previous !== theme) themeTransition(change); else change();
      void bridge.appearance(theme).catch(() => {});
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#101820' : '#f7f4ec');
    };
    apply(); media.addEventListener('change', apply); return () => media.removeEventListener('change', apply);
  }, [local.theme]);
  useEffect(() => {
    const viewport = visualViewport;
    let fullHeight = innerHeight;
    const resize = () => {
      const inset = viewport ? Math.max(0, innerHeight - viewport.height - viewport.offsetTop) : 0;
      const editing = document.activeElement?.matches('textarea,input:not([type=checkbox]):not([type=radio])');
      if (!editing) fullHeight = Math.max(fullHeight, innerHeight);
      const keyboard = !!editing && fullHeight - (viewport?.height || innerHeight) > 120;
      document.documentElement.style.setProperty('--keyboard-inset', `${inset}px`);
      document.documentElement.dataset.keyboard = keyboard ? 'open' : 'closed';
      const nav = document.querySelector<HTMLElement>('.mobile-nav'); if (nav) nav.inert = keyboard || nav.classList.contains('nav-hidden');
    };
    viewport?.addEventListener('resize', resize); viewport?.addEventListener('scroll', resize); resize();
    addEventListener('resize', resize); addEventListener('focusin', resize); addEventListener('focusout', resize);
    return () => { viewport?.removeEventListener('resize', resize); viewport?.removeEventListener('scroll', resize); removeEventListener('resize', resize); removeEventListener('focusin', resize); removeEventListener('focusout', resize); };
  }, []);
  const mainNav = [['home', 'home', '提问'], ['history', 'chat', '会话'], ['settings', 'person', '我的']];
  return <Context.Provider value={{ bridge, profile, capabilities, errors, notify, refresh, openSession, navigate, back }}>
    <div class={`app-shell ${!profile ? 'guest' : ''} ${page === 'session' ? 'in-session' : ''}`}>
      <aside class="sidebar"><button class="brand" onClick={() => navigate('home')}><img src="/logos/00-synaxis.png" alt="" /><span><strong>Synaxis</strong><small>高中教学助手</small></span></button>{profile && <button class="primary new-question" onClick={() => navigate('home')}><Icon name="plus" />新提问</button>}<nav aria-label="主导航">{mainNav.map(([key, icon, label]) => <button class={page === key ? 'selected' : ''} onClick={() => navigate(key)}><Icon name={icon} /><span>{label}</span></button>)}</nav>{profile && <div class="sidebar-recent">{recent.slice(0, 6).map(s => <button class={s.id === id ? 'selected' : ''} onClick={() => openSession(s.id)}><strong>{s.title}</strong><small>{s.subject ? subjects[s.subject] : '待识别'}</small></button>)}</div>}<div class="sidebar-bottom"><button class="account-button" onClick={() => navigate('settings')}><span class="account-avatar">{profile?.username.slice(0, 1).toUpperCase() || 'S'}</span><span>{profile?.username || '尚未登录'}<small>{online ? '已连接' : '服务离线'}</small></span></button></div></aside>
      <div class="workspace">
        {bridge.desktop && <header class="app-topbar"><span>Synaxis</span><div class="topbar-right"><button class="quiet icon-button" aria-label="最小化窗口" onClick={() => void bridge.minimize().catch(e => notify(errorText(e)))}><Icon name="minimize" /></button><button class="quiet icon-button" aria-label="关闭窗口" onClick={() => void bridge.close().catch(e => notify(errorText(e)))}><Icon name="close" /></button></div></header>}
        {!online && <div class="offline-banner" role="status">服务暂不可达，已保留内容与草稿。</div>}
        <div class="page-body">
          {profile && !restoring ? <>
            <div class="page-view" hidden={page !== 'home'}><Home active={page === 'home'} recent={recent} /></div>
            <div class="page-view" hidden={page !== 'history'}><History active={page === 'history'} /></div>
            <div class="page-view" hidden={page !== 'settings'}><Settings /></div>
            <div class="page-view" hidden={page !== 'syllabus'}><Syllabus active={page === 'syllabus'} /></div>
            {page === 'syllabus-section' && id && <div class="page-view" key={id}><SyllabusSection id={id} /></div>}
            {page === 'session' && id && <div class="page-view" key={id}><Session id={id} summary={headings.current.get(id)} /></div>}
            {page === 'usage' && <div class="page-view"><button class="subpage-back quiet" onClick={back}><Icon name="back" />返回我的</button><Usage /></div>}
            {page === 'about' && <div class="page-view"><button class="subpage-back quiet" onClick={back}><Icon name="back" />返回我的</button><About /></div>}
          </> : <div class="page-view" key={page}>{page === 'settings' ? <Settings /> : page === 'about' ? <About /> : restoring ? <div class="page-content" role="status">正在恢复登录…</div> : <Login />}</div>}
        </div>
      </div>
      <nav class={`mobile-nav ${['home','history','settings'].includes(page) ? '' : 'nav-hidden'}`} style={{ '--active-tab': String(Math.max(0, mainNav.findIndex(x => x[0] === page))) }} aria-label="窄屏导航" inert={!['home','history','settings'].includes(page)}><i class="nav-indicator" aria-hidden="true" />{mainNav.map(([key, icon, label]) => <button class={page === key ? 'selected' : ''} aria-current={page === key ? 'page' : undefined} onClick={() => navigate(key)}><Icon name={icon} /><span>{label}</span></button>)}</nav>
      {toast && <div class="toast" role="alert"><span>{toast}</span><button class="quiet icon-button" aria-label="关闭提示" onClick={() => setToast('')}><Icon name="close" /></button></div>}
    </div>
  </Context.Provider>;
}
