import DOMPurify from 'dompurify';
import { marked } from 'marked';
export function markdown(text: string) {
  // Escape raw HTML before Markdown parsing; sanitize the resulting markup too.
  const result = DOMPurify.sanitize(marked.parse(text.replace(/</g, '&lt;').replace(/>/g, '&gt;'), { async: false }) as string, { USE_PROFILES: { html: true }, FORBID_TAGS: ['img', 'style', 'iframe', 'form', 'input'] });
  const fragment = document.createElement('div'); fragment.innerHTML = result;
  for (const a of fragment.querySelectorAll('a')) { const href = a.getAttribute('href') || ''; if (!/^https?:\/\//i.test(href)) a.removeAttribute('href'); a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer'); }
  return fragment.innerHTML;
}
export function staticSvg(source: string) {
  const clean = DOMPurify.sanitize(source, { USE_PROFILES: { svg: true }, FORBID_TAGS: ['foreignObject', 'script', 'style', 'image', 'use', 'a', 'animate', 'animateMotion', 'animateTransform', 'set'], FORBID_ATTR: ['href', 'xlink:href', 'style'] });
  const root = new DOMParser().parseFromString(clean, 'image/svg+xml');
  for (const el of root.querySelectorAll('*')) for (const attr of Array.from(el.attributes)) if (/url\s*\(/i.test(attr.value) && !/^url\(#[\w-]+\)$/.test(attr.value)) el.removeAttribute(attr.name);
  const svg = root.querySelector('svg'); if (svg && !svg.hasAttribute('xmlns')) svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); return svg ? new XMLSerializer().serializeToString(svg) : '';
}
export function staticHtml(source: string, dark = false) {
  const clean = DOMPurify.sanitize(source, { ADD_TAGS: ['style'], FORBID_TAGS: ['a', 'form', 'img', 'iframe', 'video', 'audio', 'object', 'embed', 'script', 'link', 'meta', 'base', 'button', 'textarea', 'select'], FORBID_ATTR: ['href', 'src', 'srcset', 'action', 'formaction'] });
  const div = document.createElement('div'); div.innerHTML = clean;
  for (const input of div.querySelectorAll('input')) if (!['checkbox', 'radio'].includes(input.type)) input.remove();
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'"><style>html{background:${dark ? '#18252f' : '#fffefa'};color-scheme:${dark ? 'dark' : 'light'}}body{font:16px/1.6 system-ui;margin:16px;color:${dark ? '#e6edf0' : '#253a33'};overflow-wrap:anywhere}*{max-width:100%;box-sizing:border-box}</style></head><body>${div.innerHTML}</body></html>`;
}
