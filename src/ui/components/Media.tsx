import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useClient, errorText } from '../stores/context';
import { Sheet } from './Touch';
import { Icon } from './Icon';
import { staticSvg } from './sanitize';

async function displayImage(value: Blob): Promise<Blob | undefined> {
  const mime = value.type.split(';')[0];
  if (/^image\/(png|jpeg|webp|gif)$/.test(mime)) return value;
  if (mime === 'image/svg+xml') {
    const clean = staticSvg(await value.text());
    if (!clean) throw new Error('图片格式不可读取');
    return new Blob([clean], { type: mime });
  }
}

export function SvgDiagram({ source }: { source: string }) {
  const clean = useMemo(() => staticSvg(source), [source]);
  const [url, setUrl] = useState(''), [open, setOpen] = useState(false);
  useEffect(() => {
    if (!clean) { setUrl(''); return; }
    const object = URL.createObjectURL(new Blob([clean], { type: 'image/svg+xml' }));
    setUrl(object); return () => URL.revokeObjectURL(object);
  }, [clean]);
  return <><button class="artifact-open diagram-open" aria-label="放大预览：教学静态图示" disabled={!url} onClick={() => setOpen(true)}><div class="static-diagram" role="img" aria-label="教学静态图示" dangerouslySetInnerHTML={{ __html: clean }} /><span class="image-expand"><Icon name="expand" /></span></button>{open && url && <ImageViewer url={url} label="教学静态图示" onClose={() => setOpen(false)} />}</>;
}

// Only coalesce simultaneous protected reads. No persistent cross-account cache.
const reads = new Map<string, Promise<Blob>>();
function read(key: string, request: () => Promise<Blob>) {
  if (!reads.has(key)) { const p = request(); reads.set(key, p); void p.finally(() => reads.delete(key)).catch(() => {}); }
  return reads.get(key)!;
}
export function ImageViewer({ url, label, onClose }: { url: string; label: string; onClose(): void }) {
  const stage = useRef<HTMLDivElement>(null), image = useRef<HTMLImageElement>(null);
  const points = useRef(new Map<number, { x: number; y: number }>());
  const transform = useRef({ scale: 1, x: 0, y: 0 }); const gesture = useRef({ distance: 0, x: 0, y: 0 }); const lastTap = useRef(0);
  const tap = useRef({ x: 0, y: 0, moved: false, multi: false });
  const [scale, setScale] = useState(1);
  function apply(next: { scale: number; x: number; y: number }) {
    const box = stage.current!, img = image.current!;
    next.scale = Math.max(1, Math.min(8, next.scale));
    const maxX = Math.max(0, (img.clientWidth * next.scale - box.clientWidth) / 2), maxY = Math.max(0, (img.clientHeight * next.scale - box.clientHeight) / 2);
    next.x = Math.max(-maxX, Math.min(maxX, next.x)); next.y = Math.max(-maxY, Math.min(maxY, next.y));
    transform.current = next; img.style.transform = `translate3d(${next.x}px,${next.y}px,0) scale(${next.scale})`; setScale(next.scale);
  }
  function zoom(value: number) { apply({ ...transform.current, scale: value }); }
  function geometry() { const a = [...points.current.values()]; return a.length > 1 ? { distance: Math.hypot(a[0].x-a[1].x, a[0].y-a[1].y), x: (a[0].x+a[1].x)/2, y: (a[0].y+a[1].y)/2 } : { distance: 0, ...a[0] }; }
  useEffect(() => { const box = stage.current!; const wheel = (e: WheelEvent) => { e.preventDefault(); zoom(transform.current.scale * Math.exp(-e.deltaY * .002)); }; box.addEventListener('wheel', wheel, { passive: false }); const resize = () => apply({ ...transform.current }); addEventListener('resize', resize); return () => { box.removeEventListener('wheel', wheel); removeEventListener('resize', resize); }; }, []);
  return <Sheet title={label} onClose={onClose} variant="viewer"><div class="image-viewer">
    <div ref={stage} class="image-stage" tabIndex={0} aria-label="图片预览，双指或滚轮缩放，拖动查看" onKeyDown={e => { if (e.key === '+' || e.key === '=') zoom(transform.current.scale * 1.5); if (e.key === '-') zoom(transform.current.scale / 1.5); if (e.key === '0') zoom(1); }}
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); points.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (points.current.size === 1) tap.current = { x: e.clientX, y: e.clientY, moved: false, multi: false }; else tap.current.multi = true; gesture.current = geometry(); }}
      onPointerMove={e => { if (!points.current.has(e.pointerId)) return; if (Math.hypot(e.clientX-tap.current.x,e.clientY-tap.current.y) > 6) tap.current.moved = true; points.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); const next = geometry(), old = gesture.current, t = transform.current; const ratio = next.distance && old.distance ? next.distance/old.distance : 1; const rect = stage.current!.getBoundingClientRect(); apply({ scale: t.scale*ratio, x: t.x + next.x-old.x + (old.x-rect.x-rect.width/2-t.x)*(1-ratio), y: t.y + next.y-old.y + (old.y-rect.y-rect.height/2-t.y)*(1-ratio) }); gesture.current = next; }}
      onPointerUp={e => { const single = points.current.size === 1; points.current.delete(e.pointerId); if (single && !tap.current.moved && !tap.current.multi) { const now = Date.now(); if (now-lastTap.current < 280) { zoom(transform.current.scale > 1 ? 1 : 2.5); lastTap.current = 0; } else lastTap.current = now; } else lastTap.current = 0; if (points.current.size) gesture.current = geometry(); }}
      onPointerCancel={e => { points.current.delete(e.pointerId); if (points.current.size) gesture.current = geometry(); }}>
      <img ref={image} src={url} alt={label} draggable={false} onLoad={() => zoom(1)} />
    </div><div class="image-tools"><button class="quiet icon-button" aria-label="缩小图片" disabled={scale <= 1} onClick={() => zoom(scale/1.5)}><Icon name="zoom-out" /></button><button class="quiet" aria-label="重置图片缩放" onClick={() => zoom(1)}>{Math.round(scale*100)}%</button><button class="quiet icon-button" aria-label="放大图片" disabled={scale >= 8} onClick={() => zoom(scale*1.5)}><Icon name="zoom-in" /></button></div>
  </div></Sheet>;
}
export function FileBlock({ id, label, mime }: { id: string; label: string; mime?: string }) {
  const { bridge, profile, notify, errors } = useClient(); const [busy, setBusy] = useState(false), [preview, setPreview] = useState(''), [error, setError] = useState(''), [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null); const blob = useRef<Blob>(); const lifetime = useRef(true); const object = useRef(''); const version = useRef(0);
  const likelyImage = !!mime?.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(label);
  const log = mime === 'text/plain' || /\.log$/i.test(label);
  const get = () => read(`${bridge.settings().server}:${profile?.id}:${id}`, () => bridge.artifact(id));
  useEffect(() => {
    lifetime.current = true; version.current++; let active = true, started = false; setPreview(''); setError('');
    const load = async () => { if (started) return; started = true; setBusy(true); try { const value = await get(), display = await displayImage(value); if (active) { blob.current = value; if (display) { object.current = URL.createObjectURL(display); setPreview(object.current); } } } catch (e) { if (active) setError(errorText(e, errors)); } finally { if (active) setBusy(false); } };
    const observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { observer.disconnect(); void load(); } }, { rootMargin: '600px' });
    if (!log) observer.observe(root.current!);
    return () => { active = false; lifetime.current = false; version.current++; observer.disconnect(); if (object.current) URL.revokeObjectURL(object.current); object.current = ''; blob.current = undefined; };
  }, [id]);
  async function retry() { const gen = version.current; setBusy(true); try { const value = await get(), display = await displayImage(value); if (lifetime.current && version.current === gen) { blob.current = value; if (display) { if (object.current) URL.revokeObjectURL(object.current); object.current = URL.createObjectURL(display); setPreview(object.current); } setError(''); } } catch (e) { if (lifetime.current && version.current === gen) setError(errorText(e)); } finally { if (lifetime.current && version.current === gen) setBusy(false); } }
  async function download() { setBusy(true); try { await bridge.saveFile(blob.current || await get(), label); } catch (e) { notify(errorText(e, errors)); } finally { if (lifetime.current) setBusy(false); } }
  return <div ref={root} class={`file-block ${preview ? 'image-artifact' : ''}`} data-artifact-id={id}>
    {!preview && likelyImage && !error && <div class="image-placeholder" role="status" aria-label="正在读取图片"><span class="loading-dot" /></div>}
    {preview && <button class="artifact-open" aria-label={`放大预览：${label}`} onClick={() => setOpen(true)}><img class="artifact-preview" src={preview} alt={label} /><span class="image-expand"><Icon name="expand" /></span></button>}
    <div class="file-caption"><Icon name={log ? 'file' : 'image'} /><span>{label}</span>{busy && <span class="loading-dot" />}<button class="quiet icon-button" aria-label={`下载：${label}`} disabled={busy} onClick={() => void download()}><Icon name="download" /></button></div>
    {error && <div class="error-notice"><p>{error}</p><button disabled={busy} onClick={() => void retry()}>重新读取图片</button></div>}
    {open && preview && <ImageViewer url={preview} label={label} onClose={() => setOpen(false)} />}
  </div>;
}
