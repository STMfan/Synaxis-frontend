type Glyph = { offset: number; text: string; rect: DOMRect; font: string; size: number; color: string; spacing: string };
type Endpoint = { element: HTMLElement; rect: DOMRect; glyphs: Glyph[]; copy: HTMLElement; visibility: string };
const visible = (el: HTMLElement) => { const r = el.getBoundingClientRect(); return !!(r.width && r.height && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth); };
const shared = (key: string) => [...document.querySelectorAll<HTMLElement>('[data-hero-key]')].find(el => el.dataset.heroKey === key && visible(el));

/** Freeze a small control's paint, including live form values, without copying handlers. */
function paint(element: HTMLElement) {
  const copy = element.cloneNode(true) as HTMLElement;
  const originals = [element, ...element.querySelectorAll<HTMLElement>('*')], copies = [copy, ...copy.querySelectorAll<HTMLElement>('*')];
  originals.forEach((original, i) => {
    const node = copies[i], style = getComputedStyle(original);
    for (const property of style) node.style.setProperty(property, style.getPropertyValue(property));
    node.style.animation = 'none'; node.style.transition = 'none'; node.removeAttribute('id'); node.removeAttribute('data-hero-key');
    if (original instanceof HTMLTextAreaElement && node instanceof HTMLTextAreaElement) node.value = original.value;
    if (original instanceof HTMLInputElement && node instanceof HTMLInputElement && original.type !== 'file') node.value = original.value;
  });
  for (const node of copy.querySelectorAll('iframe,video,audio,script')) node.remove();
  return copy;
}

/** Measure actual glyphs before moving either parent; retain multiline text until it converges. */
function glyphs(element: HTMLElement, bounds: DOMRect): Glyph[] {
  const result: Glyph[] = [], walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' }); let node: Node | null, offset = 0;
  while ((node = walker.nextNode()) && offset < 256) {
    if (node.parentElement?.closest('svg,[aria-hidden="true"]')) continue;
    const text = node.textContent || '', style = getComputedStyle(node.parentElement!);
    for (const segment of segmenter.segment(text)) {
      const range = document.createRange(); range.setStart(node, segment.index); range.setEnd(node, segment.index+segment.segment.length);
      const rect = range.getBoundingClientRect();
      if (rect.width && rect.height && rect.top >= bounds.top-1 && rect.bottom <= bounds.bottom+1 && rect.left >= bounds.left-1 && rect.right <= bounds.right+1) result.push({ offset: offset+segment.index, text: segment.segment, rect, font: style.font, size: parseFloat(style.fontSize), color: style.color, spacing: style.letterSpacing });
    }
    offset += text.length;
  }
  const style = getComputedStyle(element);
  const clipped = element.scrollWidth > element.clientWidth+1 || element.scrollHeight > element.clientHeight+1;
  if (clipped && result.length && (style.textOverflow === 'ellipsis' || parseInt(style.webkitLineClamp) > 0)) {
    const last = result.at(-1)!, probe = document.createElement('span'); probe.style.font = last.font; probe.textContent = '…'; probe.style.position = 'fixed'; probe.style.visibility = 'hidden'; document.body.append(probe);
    const width = probe.getBoundingClientRect().width; probe.remove(); const left = bounds.right-width;
    while (result.length && result.at(-1)!.rect.top >= last.rect.top-1 && result.at(-1)!.rect.right > left) result.pop();
    result.push({ ...last, offset: -1, text: '…', rect: new DOMRect(left, last.rect.top, width, last.rect.height) });
  }
  return result;
}
function capture(element: HTMLElement): Endpoint {
  const rect = element.getBoundingClientRect();
  return { element, rect, glyphs: element.dataset.heroKey === 'composer' || element instanceof HTMLImageElement ? [] : glyphs(element, rect), copy: paint(element), visibility: element.style.visibility };
}
function hide(endpoint: Endpoint) { endpoint.element.style.visibility = 'hidden'; }
function restore(endpoint: Endpoint) { endpoint.element.style.visibility = endpoint.visibility; }

/** Shared title, identity and dock use one clock and one cleanup, including interrupted navigation. */
export function prepareHero(keys: string[]) {
  const sources = new Map<string, Endpoint>();
  for (const key of keys) { const element = shared(key); if (element) sources.set(key, capture(element)); }
  for (const source of sources.values()) hide(source);
  const targets: Endpoint[] = [], roots: HTMLElement[] = [], animations: Animation[] = [];
  const finish = () => { animations.forEach(a => a.cancel()); roots.forEach(r => r.remove()); sources.forEach(restore); targets.forEach(restore); };
  const start = (duration: number, easing: string, backward: boolean) => {
    for (const [key, source] of sources) {
      const element = shared(key);
      if (!element || element === source.element) { restore(source); continue; }
      const target = capture(element); targets.push(target); hide(target);
      const root = document.createElement('div'); root.className = `hero-flight ${source.glyphs.length ? 'hero-title' : ''}`; root.dataset.flightKey = key; root.setAttribute('aria-hidden', 'true'); root.inert = true;
      document.getElementById('overlay-root')!.append(root); roots.push(root);
      const move = (node: HTMLElement, a: DOMRect, b: DOMRect, opacity: number[], scale = false) => {
        Object.assign(node.style, { position: 'absolute', left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px`, margin: '0', transformOrigin: '0 0', visibility: 'visible' });
        const x = b.left-a.left, y = b.top-a.top, mx = backward ? .22 : .78, my = backward ? .68 : .32;
        const sx = b.width/a.width, sy = b.height/a.height;
        const frames = [0,.45,1].map((at,i) => ({ offset: at, transform: `translate3d(${x*(i === 1 ? mx : at)}px,${y*(i === 1 ? my : at)}px,0)${scale ? ` scale(${1+(sx-1)*at},${1+(sy-1)*at})` : ''}`, opacity: opacity[i] }));
        root.append(node); animations.push(node.animate(frames, { duration, easing, fill: 'both' }));
      };
      if (source.glyphs.length && target.glyphs.length) {
        const from = new Map(source.glyphs.map(g => [g.offset,g])), to = new Map(target.glyphs.map(g => [g.offset,g]));
        for (const offset of new Set([...from.keys(),...to.keys()])) {
          const a = from.get(offset), b = to.get(offset), glyph = a || b!;
          const aRect = a?.rect || from.get(-1)?.rect || source.glyphs.at(-1)!.rect, bRect = b?.rect || to.get(-1)?.rect || target.glyphs.at(-1)!.rect;
          const span = document.createElement('span'); span.textContent = glyph.text; Object.assign(span.style, { font: glyph.font, color: glyph.color, letterSpacing: glyph.spacing, lineHeight: `${glyph.rect.height}px`, whiteSpace: 'pre' });
          const ratio = (b?.size || target.glyphs[0].size)/(a?.size || source.glyphs[0].size);
          move(span, new DOMRect(aRect.left,aRect.top,glyph.rect.width,glyph.rect.height), new DOMRect(bRect.left,bRect.top,glyph.rect.width*ratio,glyph.rect.height*ratio), [a ? 1 : 0, a && b ? 1 : .55, b ? 1 : 0], true);
          // Hidden suffixes fade before reaching the ellipsis, avoiding stacked glyphs.
          if (a && !b) animations.push(span.animate([{ opacity: 1 }, { opacity: 0 }], { duration: duration*.25, easing: 'ease-out', fill: 'forwards' }));
          if (!a && b) animations.push(span.animate([{ opacity: 0 }, { opacity: 1 }], { delay: duration*.25, duration: duration*.75, easing: 'ease-in-out', fill: 'both' }));
          if (offset === -1) animations.push(span.animate([{ opacity: a ? 1 : 0 }, { offset: .22, opacity: 0 }, { offset: .65, opacity: 0 }, { opacity: b ? 1 : 0 }], { duration, easing: 'linear', fill: 'both' }));
        }
      } else if (key === 'composer') {
        root.classList.add('hero-composer');
        move(source.copy, source.rect, target.rect, [1,.6,0], true);
        move(target.copy, source.rect, target.rect, [0,.4,1], true);
        // Target paint starts at the source bounds, but its children retain target geometry.
        Object.assign(target.copy.style, { width: `${target.rect.width}px`, height: `${target.rect.height}px` });
        animations.pop()!.cancel();
        const sx = source.rect.width/target.rect.width, sy = source.rect.height/target.rect.height, x = target.rect.left-source.rect.left, y = target.rect.top-source.rect.top;
        animations.push(target.copy.animate([{ transform: `scale(${sx},${sy})`, opacity: 0 }, { offset: .45, transform: `translate3d(${x*(backward ? .22 : .78)}px,${y*(backward ? .68 : .32)}px,0) scale(${(sx+1)/2},${(sy+1)/2})`, opacity: .4 }, { transform: `translate3d(${x}px,${y}px,0) scale(1)`, opacity: 1 }], { duration, easing, fill: 'both' }));
      } else move(source.copy, source.rect, target.rect, [1,1,1], true);
    }
  };
  return { start, finish };
}
