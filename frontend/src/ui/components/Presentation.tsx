import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Block, LeafBlock, Presentation as Model } from '../../webview/types';
import { markdown, staticHtml } from './sanitize';
import { FileBlock, SvgDiagram } from './Media';
import { streamingMarkdown } from '../stores/stream-markdown';
import { renderStream } from '../stores/stream-render';
const mathCache = new Map<string, Promise<string>>();
function typeset(source: string, display: boolean) {
  const key = `${display}:${source}`;
  if (!mathCache.has(key)) {
    if (mathCache.size >= 128) mathCache.delete(mathCache.keys().next().value!);
    const result = import('./math').then(m => m.formula(source, display));
    mathCache.set(key, result); void result.catch(() => mathCache.delete(key));
  }
  return mathCache.get(key)!;
}
export function Formula({ source, display = true }: { source: string; display?: boolean }) {
  const [html, setHtml] = useState(''); const [error, setError] = useState(false);
  useEffect(() => { let active = true; setHtml(''); setError(false); void typeset(source, display).then(value => { if (active) setHtml(value); }).catch(() => { if (active) setError(true); }); return () => { active = false; }; }, [source, display]);
  return <span class={`formula ${display ? 'formula-display' : ''}`}>{html ? <span dangerouslySetInnerHTML={{ __html: html }} /> : <code>{source}</code>}{error && <small class="muted">公式排版暂不可用，已保留原式</small>}</span>;
}
export function MarkdownChunk({ text }: { text: string }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true; const prefix = `SXM${crypto.randomUUID().replaceAll('-', '')}X`;
    const math: { original: string; source: string; display: boolean }[] = [];
    const tokenized = text.replace(/\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$\$[\s\S]*?\$\$|(?<!\\)\$(?!\$)(?=\S)(?:\\.|[^\n$\\]){1,4000}?(?<=\S)\$(?!\$)/g, original => { const index = math.length; const inlineDollar = original.startsWith('$') && !original.startsWith('$$'); math.push({ original, source: original.slice(inlineDollar ? 1 : 2, inlineDollar ? -1 : -2), display: !original.startsWith('\\(') && !inlineDollar }); return `${prefix}${index}Z`; });
    const element = root.current!; element.innerHTML = markdown(tokenized);
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT); const nodes: Text[] = []; let node: Node | null;
    while ((node = walker.nextNode())) nodes.push(node as Text);
    for (const node of nodes) {
      const matcher = new RegExp(`${prefix}(\\d+)Z`, 'g'); const matches = [...node.data.matchAll(matcher)]; if (!matches.length) continue;
      const fragment = document.createDocumentFragment(); let start = 0;
      for (const match of matches) {
        fragment.append(node.data.slice(start, match.index)); const entry = math[Number(match[1])];
        if (node.parentElement?.closest('code,pre')) fragment.append(entry.original);
        else { const span = document.createElement('span'); span.className = `formula ${entry.display ? 'formula-display' : ''}`; span.textContent = entry.source; fragment.append(span); void typeset(entry.source, entry.display).then(html => { if (active) span.innerHTML = html; }).catch(() => { if (active) span.title = '公式排版暂不可用，已保留原式'; }); }
        start = match.index! + match[0].length;
      }
      fragment.append(node.data.slice(start)); node.replaceWith(fragment);
    }
    return () => { active = false; };
  }, [text]);
  return <div ref={root} class="markdown" />;
}
export function StreamingMarkdown({ text }: { text: string }) {
  const root = useRef<HTMLDivElement>(null); const prefix = useRef(`SXM${crypto.randomUUID().replaceAll('-', '')}X`);
  const latest = useRef(text); latest.current = text;
  const [visible, setVisible] = useState(text); const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!timer.current) timer.current = setTimeout(() => { timer.current = undefined; setVisible(latest.current); }, 64);
  }, [text]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { if (root.current) renderStream(root.current, streamingMarkdown(visible), prefix.current, typeset); }, [visible]);
  return <div class="stream-markdown presentation"><div ref={root} class="markdown" /></div>;
}
function Markdown({ text }: { text: string }) {
  const [length, setLength] = useState(24000);
  useEffect(() => setLength(24000), [text]);
  // Huge 0.3.0 replies stay in the model; only the visible portion is typeset.
  // Prefer paragraph boundaries; every displayed prefix is still sanitized.
  let end = Math.min(length, text.length);
  if (end < text.length) { const boundary = text.lastIndexOf('\n\n', end); if (boundary > end - 4000) end = boundary; }
  return <><MarkdownChunk text={text.slice(0, end)} />{end < text.length && <button class="read-more" onClick={() => setLength(length + 24000)}>继续阅读</button>}</>;
}
function HtmlBlock({ source }: { source: string }) {
  const [dark, setDark] = useState(document.documentElement.dataset.theme === 'dark');
  // Changing srcdoc in a live iframe adds joint browser-history entries.
  // A fresh sandbox context keeps lesson/theme updates out of app navigation.
  const frame = useMemo(() => crypto.randomUUID(), [source, dark]);
  useEffect(() => { const observer = new MutationObserver(() => setDark(document.documentElement.dataset.theme === 'dark')); observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); return () => observer.disconnect(); }, []);
  return <iframe key={frame} class="teaching-frame" title="教学互动材料" sandbox="" referrerPolicy="no-referrer" srcDoc={staticHtml(source, dark)} />;
}
function Leaf({ block }: { block: LeafBlock }) {
  switch (block.type) {
    case 'markdown': return <Markdown text={block.text} />;
    case 'latex': return <Formula source={block.source} display={block.display} />;
    case 'svg': return <SvgDiagram source={block.source} />;
    case 'html': return <HtmlBlock source={block.source} />;
    case 'question': return <blockquote class="question-reference">{block.prompt}</blockquote>;
    case 'localfile': return <FileBlock id={block.artifact_id} label={block.label} />;
  }
}
function RenderBlock({ block }: { block: Block }) {
  const [selected, setSelected] = useState(block.type === 'branch' ? block.selected : '');
  if (block.type !== 'branch') return <Leaf block={block} />;
  const current = block.tabs.find(t => t.id === selected) || block.tabs[0];
  return <div class="branch"><div class="branch-tabs" role="tablist" aria-label="讲解分支">{block.tabs.map((t, i) => <button key={t.id} role="tab" tabIndex={t.id === current.id ? 0 : -1} aria-selected={t.id === current.id} onClick={() => setSelected(t.id)} onKeyDown={e => { let index = i; if (e.key === 'ArrowRight') index = (i + 1) % block.tabs.length; else if (e.key === 'ArrowLeft') index = (i + block.tabs.length - 1) % block.tabs.length; else if (e.key === 'Home') index = 0; else if (e.key === 'End') index = block.tabs.length - 1; else return; e.preventDefault(); setSelected(block.tabs[index].id); (e.currentTarget.parentElement?.children[index] as HTMLButtonElement)?.focus(); }}>{t.label}</button>)}</div><div role="tabpanel" aria-label={current.label}>{current.blocks.map((b, i) => <Leaf key={i} block={b} />)}</div></div>;
}
export function Presentation({ value }: { value: Model }) { return <div class="presentation">{value.blocks.map((block, i) => <RenderBlock key={i} block={block} />)}</div>; }
