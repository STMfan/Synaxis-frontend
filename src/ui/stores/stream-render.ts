import { markdown } from '../components/sanitize';
const previous = new WeakMap<HTMLElement, string>();
/** Morph sanitized Markdown in place: retained paragraphs/formulas never re-fade. */
export function renderStream(root: HTMLElement, text: string, prefix: string, typeset: (source: string, display: boolean) => Promise<string>) {
  const formulas: { original: string; source: string; display: boolean }[] = [];
  const tokens = text.replace(/\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$\$[\s\S]*?\$\$|(?<!\\)\$(?!\$)(?=\S)(?:\\.|[^\n$\\]){1,4000}?(?<=\S)\$(?!\$)/g, original => {
    const i = formulas.length, dollar = original.startsWith('$') && !original.startsWith('$$');
    formulas.push({ original, source: original.slice(dollar ? 1 : 2, dollar ? -1 : -2), display: !original.startsWith('\\(') && !dollar }); return `${prefix}${i}Z`;
  });
  const target = document.createElement('div'); target.innerHTML = markdown(tokens);
  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT), nodes: Text[] = []; let node: Node | null;
  while ((node = walker.nextNode())) nodes.push(node as Text);
  for (const textNode of nodes) {
    const fragment = document.createDocumentFragment(); let start = 0;
    for (const match of textNode.data.matchAll(new RegExp(`${prefix}(\\d+)Z`, 'g'))) {
      fragment.append(textNode.data.slice(start, match.index)); const f = formulas[Number(match[1])];
      if (textNode.parentElement?.closest('code,pre')) fragment.append(f.original);
      else { const el = document.createElement('span'); el.className = `formula ${f.display ? 'formula-display' : ''}`; el.dataset.formula = `${f.display ? '1' : '0'}:${f.source}`; el.textContent = f.source; fragment.append(el); }
      start = match.index! + match[0].length;
    }
    fragment.append(textNode.data.slice(start)); textNode.replaceWith(fragment);
  }
  const value = target.textContent || '', old = previous.get(root) || ''; let common = 0;
  while (common < old.length && common < value.length && old[common] === value[common]) common++;
  previous.set(root, value);
  const texts = document.createTreeWalker(target, NodeFilter.SHOW_TEXT), list: Text[] = [];
  while ((node = texts.nextNode())) list.push(node as Text);
  let offset = 0;
  for (const t of list) {
    const end = offset + t.data.length;
    if (!t.parentElement?.closest('[data-formula]')) {
      const span = document.createElement('span'); span.className = 'stream-text';
      const keep = Math.max(0, Math.min(t.data.length, common-offset)); span.append(t.data.slice(0, keep));
      if (keep < t.data.length) { const added = document.createElement('span'); added.className = 'stream-added'; added.textContent = t.data.slice(keep); span.append(added); }
      t.replaceWith(span);
    }
    offset = end;
  }
  function morph(parent: Element, desired: Element) {
    const next = [...desired.childNodes];
    for (let i = 0; i < next.length; i++) {
      const a = parent.childNodes[i], b = next[i];
      if (!a) { parent.append(b); continue; }
      if (a.nodeType === Node.TEXT_NODE && b.nodeType === Node.TEXT_NODE) { if (a.textContent !== b.textContent) a.textContent = b.textContent; continue; }
      if (!(a instanceof Element) || !(b instanceof Element) || a.tagName !== b.tagName || a.getAttribute('data-formula') !== b.getAttribute('data-formula')) { a.replaceWith(b); continue; }
      if (b.hasAttribute('data-formula')) continue;
      if (b.classList.contains('stream-text')) {
        const before = a.textContent || '', after = b.textContent || '';
        if (before === after) continue;
        if (after.startsWith(before)) { const added = document.createElement('span'); added.className = 'stream-added'; added.textContent = after.slice(before.length); a.append(added); }
        else a.replaceChildren(...b.childNodes);
        continue;
      }
      for (const attr of [...a.attributes]) if (!b.hasAttribute(attr.name)) a.removeAttribute(attr.name);
      for (const attr of [...b.attributes]) if (a.getAttribute(attr.name) !== attr.value) a.setAttribute(attr.name, attr.value);
      morph(a, b);
    }
    while (parent.childNodes.length > next.length) parent.lastChild!.remove();
  }
  morph(root, target);
  for (const el of root.querySelectorAll<HTMLElement>('[data-formula]:not([data-typeset])')) {
    el.dataset.typeset = 'pending'; const key = el.dataset.formula!;
    void typeset(key.slice(2), key[0] === '1').then(html => { if (el.isConnected && el.dataset.formula === key) { el.innerHTML = html; el.dataset.typeset = 'ready'; } }).catch(() => { el.title = '公式排版暂不可用，已保留原式'; });
  }
  for (const added of root.querySelectorAll<HTMLElement>('.stream-added:not([data-fade])')) {
    added.dataset.fade = '1'; const clean = () => { if (added.isConnected) { const parent = added.parentNode; added.replaceWith(document.createTextNode(added.textContent || '')); parent?.normalize(); } };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) clean(); else added.addEventListener('animationend', clean, { once: true });
  }
}
