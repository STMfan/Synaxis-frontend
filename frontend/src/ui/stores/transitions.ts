import { flushSync } from 'preact/compat';
import type { Route } from './navigation';
import { prepareHero } from './hero';
const ease = 'cubic-bezier(.18,.88,.22,1)';
let settle: (() => void) | undefined;
let themeFinish: (() => void) | undefined;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const selectors = '.home-intro,.page-heading,.section-heading,.recent-card,.history-row,.profile-card,.setting-row,.theme-settings,.settings-page>h1,.subpage-back,.usage-page>h1,.usage-group,.usage-record,.about-page>h1,.about-page>p,.app-logo,.login-form,.message-meta,.student-text,.markdown>*,.file-block,.reasoning-panel,.preview-label,.static-diagram,.branch-tabs,.question-reference';
/** Copy only visible small elements, never a long document or iframe snapshot. */
function viewportCopy() {
  const root = document.createElement('div'); root.className = 'motion-surface'; root.setAttribute('aria-hidden', 'true'); root.inert = true;
  const vars = getComputedStyle(document.documentElement);
  for (const key of ['--bg','--surface','--text','--muted','--action','--action-text','--attention','--line','--outline','--soft','--shadow']) root.style.setProperty(key, vars.getPropertyValue(key));
  root.style.color = vars.color; root.style.background = vars.getPropertyValue('--bg');
  const selected: Element[] = [];
  for (const el of document.querySelectorAll<HTMLElement>(`.page-view:not([hidden]) :is(${selectors}),.session-header-layer .session-top`)) {
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top >= innerHeight || selected.some(parent => parent.contains(el))) continue;
    // Large containers are represented by their visible children instead.
    if (rect.height > innerHeight * 2 || selected.length >= 48) continue;
    selected.push(el); const copy = el.cloneNode(true) as HTMLElement;
    copy.removeAttribute('id'); copy.removeAttribute('data-hero-key'); for (const item of copy.querySelectorAll('[id],[data-hero-key]')) { item.removeAttribute('id'); item.removeAttribute('data-hero-key'); }
    for (const item of copy.querySelectorAll('iframe,video,audio')) item.remove();
    Object.assign(copy.style, { position: 'absolute', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, margin: '0', animation: 'none', transition: 'none' });
    root.append(copy);
  }
  return root;
}
/** Measure resting endpoints first; page and shared elements then travel on one clock. */
export function transition(change: () => void, from: Route, to: Route, backward: boolean, position: number) {
  settle?.(); themeFinish?.();
  const id = to.page === 'session' ? to.id : from.page === 'session' ? from.id : '';
  const animated = !reduced();
  const flight = animated && id ? prepareHero([`title:${id}`, `expert-logo:${id}`, `expert-code:${id}`, 'composer']) : undefined;
  const old = animated ? viewportCopy() : null;
  document.documentElement.dataset.transitioning = 'true';
  flushSync(change);
  const body = document.querySelector<HTMLElement>('.page-body'), page = body?.querySelector<HTMLElement>('.page-view:not([hidden])');
  const workspace = document.querySelector<HTMLElement>('.workspace');
  if (!body || !page || !workspace || !old) {
    flight?.finish(); scrollTo({ top: position, behavior: 'instant' }); document.documentElement.dataset.transitioning = 'false'; dispatchEvent(new Event('synaxis:page-settled')); return;
  }
  const rootStyle = body.getAttribute('style'), pageStyle = page.getAttribute('style'), workspaceStyle = workspace.getAttribute('style');
  workspace.style.minHeight = `${Math.max(position+innerHeight, workspace.offsetHeight)}px`;
  flushSync(() => { scrollTo({ top: position, behavior: 'instant' }); dispatchEvent(new Event('synaxis:page-settled')); });
  const rect = body.getBoundingClientRect();
  flight?.start(420, ease, backward);
  const tabs = ['home','history','settings'], a = tabs.indexOf(from.page), b = tabs.indexOf(to.page), direction = a >= 0 && b >= 0 ? Math.sign(b-a) || 1 : backward ? -1 : 1;
  Object.assign(body.style, { position: 'fixed', top: '0', left: `${rect.left}px`, width: `${rect.width}px`, height: `${innerHeight}px`, overflow: 'clip', contain: 'layout paint', zIndex: '22', background: 'var(--bg)' });
  page.style.marginTop = `${rect.top}px`;
  document.getElementById('overlay-root')!.append(old);
  const distance = Math.min(rect.width, 800), entering = body.animate([{ transform: `translate3d(${direction*distance}px,0,0)` }, { transform: 'translate3d(0,0,0)' }], { duration: 420, easing: ease, fill: 'both' });
  const leaving = old.animate([{ transform: 'translate3d(0,0,0)' }, { transform: `translate3d(${-direction*distance*.28}px,0,0)` }], { duration: 420, easing: ease, fill: 'both' });
  const header = document.querySelector<HTMLElement>('.session-header-layer');
  const headerMotion = header?.animate([{ transform: `translate3d(${direction*24}px,0,0)` }, { transform: 'translate3d(0,0,0)' }], { duration: 420, easing: ease, fill: 'both' });
  let done = false;
  const finish = () => {
    if (done) return; done = true; entering.cancel(); leaving.cancel(); headerMotion?.cancel(); old.remove(); flight?.finish();
    for (const [element, style] of [[body,rootStyle],[page,pageStyle],[workspace,workspaceStyle]] as const) { if (style === null) element.removeAttribute('style'); else element.setAttribute('style', style); }
    scrollTo({ top: position, behavior: 'instant' }); document.documentElement.dataset.transitioning = 'false'; flushSync(() => dispatchEvent(new Event('synaxis:page-settled'))); settle = undefined;
  };
  settle = finish; void entering.finished.then(finish).catch(() => {});
}
/** An old-theme viewport contracts toward the control; no large bitmap layers. */
export function themeTransition(change: () => void) {
  themeFinish?.();
  if (reduced()) { change(); return; }
  const old = viewportCopy(), focus = document.activeElement?.getBoundingClientRect();
  const x = focus ? focus.left+focus.width/2 : innerWidth*.8, y = focus ? focus.top+focus.height/2 : innerHeight*.4;
  old.classList.add('theme-surface'); change(); document.getElementById('overlay-root')!.append(old);
  const animation = old.animate([{ clipPath: `circle(${Math.hypot(innerWidth,innerHeight)}px at ${x}px ${y}px)` }, { clipPath: `circle(0px at ${x}px ${y}px)` }], { duration: 520, easing: ease });
  const finish = () => { old.remove(); animation.cancel(); if (themeFinish === finish) themeFinish = undefined; };
  themeFinish = finish; void animation.finished.then(finish).catch(() => {});
}
