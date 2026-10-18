import { createPortal } from 'preact/compat';
import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { navigation } from '../stores/navigation';
import { Icon } from './Icon';

export function Sheet({ title, onClose, children, variant = '' }: { title: string; onClose(): void; children: ComponentChildren; variant?: string }) {
  const root = useRef<HTMLDivElement>(null); const close = useRef(onClose); close.current = onClose;
  useLayoutEffect(() => {
    const original = document.activeElement as HTMLElement | null;
    const remove = navigation.sheet(() => close.current());
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const backgrounds = [document.getElementById('app')!, document.getElementById('dock-root')!, ...document.querySelectorAll<HTMLElement>('.touch-sheet,.session-header-layer')].filter(x => x !== root.current);
    const inert = backgrounds.map(x => x.inert); backgrounds.forEach(x => { x.inert = true; });
    root.current?.querySelector<HTMLElement>('button,input')?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); navigation.back(); }
      if (e.key === 'Tab') {
        const all = [...root.current!.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href]')].filter(x => x.getClientRects().length);
        const first = all[0], last = all.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    addEventListener('keydown', key);
    return () => {
      if (root.current && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const exit = document.createElement('div'); exit.className = 'sheet-exit'; exit.inert = true; exit.setAttribute('aria-hidden', 'true');
        const copy = root.current.cloneNode(true) as HTMLElement; copy.style.animation = 'none'; exit.append(copy); document.getElementById('overlay-root')!.append(exit);
        const animation = copy.animate([{ transform: 'translate3d(0,0,0)' }, { transform: 'translate3d(0,100%,0)' }], { duration: 240, easing: 'cubic-bezier(.4,0,.6,1)' });
        void animation.finished.then(() => exit.remove()).catch(() => exit.remove());
      }
      remove(); removeEventListener('keydown', key); document.body.style.overflow = previous; backgrounds.forEach((x, i) => { x.inert = inert[i]; }); original?.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(<div class={`sheet-backdrop ${variant}`} onClick={e => { if (e.target === e.currentTarget) navigation.back(); }}><div ref={root} class="touch-sheet" role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button class="quiet icon-button" aria-label="关闭面板" onClick={() => navigation.back()}><Icon name="close" /></button></header><div class="sheet-content">{children}</div></div></div>, document.getElementById('overlay-root')!);
}
export function Choice({ label, value, choices, onChange }: { label: string; value: string; choices: { value: string; label: string }[]; onChange(value: string): void }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" class="choice-button" aria-label={label} onClick={() => setOpen(true)}><span>{choices.find(x => x.value === value)?.label || label}</span><Icon name="down" /></button>{open && <Sheet title={label} onClose={() => setOpen(false)}><div class="choice-list" role="radiogroup" aria-label={label}>{choices.map(x => <button type="button" role="radio" aria-checked={x.value === value} onClick={() => { onChange(x.value); navigation.back(); }}><span>{x.label}</span>{x.value === value && <Icon name="check" />}</button>)}</div></Sheet>}</>;
}
export function Switch({ label, checked, onChange, disabled = false, detail }: { label: string; checked: boolean; onChange(value: boolean): void; disabled?: boolean; detail?: string }) {
  return <button type="button" class="switch-row" role="switch" aria-label={label} aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}><span>{label}{detail && <small>{detail}</small>}</span><i class="switch-track"><i /></i></button>;
}
export function Dock({ children, tabs = false }: { children: ComponentChildren; tabs?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observe = new ResizeObserver(entries => document.documentElement.style.setProperty('--dock-height', `${entries[0].borderBoxSize[0].blockSize}px`));
    observe.observe(root.current!);
    return () => { observe.disconnect(); document.documentElement.style.setProperty('--dock-height', '0px'); };
  }, []);
  return createPortal(<div ref={root} class={`composer-dock ${tabs ? 'above-tabs' : ''}`}><div class="dock-inner" data-hero-key="composer">{children}</div></div>, document.getElementById('dock-root')!);
}
