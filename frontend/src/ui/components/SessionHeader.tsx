import { createPortal } from 'preact/compat';
import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
/** A safe-area mask and compact header stay above scrolling lesson content. */
export function SessionHeader({ children }: { children: ComponentChildren }) {
  const anchor = useRef<HTMLDivElement>(null); const [layout, setLayout] = useState({ left: 10, base: 0, maskTop: 0, width: innerWidth-20, top: 24, floating: false });
  useLayoutEffect(() => {
    let frame = 0;
    const update = () => { frame = 0; const rect = anchor.current!.getBoundingClientRect(); const page = anchor.current!.closest<HTMLElement>('.page-body'); const shift = page?.style.position === 'fixed' ? page.getBoundingClientRect().left-parseFloat(page.style.left) : 0; const base = document.querySelector('.workspace')!.getBoundingClientRect().left; const bar = document.querySelector('.app-topbar')?.getBoundingClientRect(); const maskTop = bar ? Math.max(0,bar.bottom) : 0; const safe = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-top')) || (document.documentElement.dataset.platform === 'mobile' ? 24 : 0); const floating = rect.top < safe-2; setLayout({ left: rect.left-shift-6-base, base, maskTop, width: rect.width+12, top: (floating ? safe+6 : Math.max(safe,rect.top))-maskTop, floating }); };
    const scroll = () => { if (!frame) frame = requestAnimationFrame(update); }; const observer = new ResizeObserver(scroll); observer.observe(anchor.current!);
    addEventListener('scroll', scroll, { passive: true }); addEventListener('resize', scroll); addEventListener('synaxis:page-settled', update); update();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); removeEventListener('scroll', scroll); removeEventListener('resize', scroll); removeEventListener('synaxis:page-settled', update); };
  }, []);
  return <><div ref={anchor} class="session-header-anchor" />{createPortal(<div class={`session-header-layer ${layout.floating ? 'floating' : 'docked'}`} style={{ left: `${layout.base}px`, top: `${layout.maskTop}px`, height: `${layout.top+64}px` }}><header class="session-top" style={{ left: `${layout.left}px`, width: `${layout.width}px`, top: `${layout.top}px` }}>{children}</header></div>, document.getElementById('overlay-root')!)}</>;
}
