import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ImageInput, Subject } from '../../webview/types';
import { useClient, cost, errorText } from '../stores/context';
import { Icon } from './Icon';
import { Sheet, Switch } from './Touch';
import { drafts } from '../stores/drafts';
export interface Draft { message: string; images: ImageInput[]; allow_paid_images: boolean; allow_max_thinking?: boolean }
async function prepareImage(file: File, crop: boolean): Promise<ImageInput> {
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) throw new Error('仅支持 PNG / JPEG / WebP / GIF 图片');
  if (file.size > 30 * 1024 * 1024) throw new Error('源图片超过30 MiB，请先缩小');
  const bitmap = await createImageBitmap(file);
  try {
    let sw = bitmap.width, sh = bitmap.height, sx = 0, sy = 0;
    if (crop) { const side = Math.min(sw, sh); sx = (sw - side) / 2; sy = (sh - side) / 2; sw = sh = side; }
    const scale = Math.min(1, Math.sqrt(4_000_000 / (sw * sh)), 2000 / Math.max(sw, sh));
    const canvas = document.createElement('canvas'); canvas.width = Math.floor(sw * scale); canvas.height = Math.floor(sh * scale);
    canvas.getContext('2d')!.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/jpeg', 0.86).split(',')[1];
    if (data.length * 0.75 > 4 * 1024 * 1024) throw new Error('压缩后仍超过4 MiB，请选择更小的图片');
    return { media_type: 'image/jpeg', data };
  } finally { bitmap.close(); }
}
export function Composer({ subject, onSend, compact = false, disabled = false, label = '发送', draftKey = 'home', context }: { subject: Subject | null; onSend: (draft: Draft) => Promise<void>; compact?: boolean; disabled?: boolean; label?: string; draftKey?: string; context?: ComponentChildren }) {
  const { capabilities, notify, errors } = useClient();
  const [message, setMessage] = useState(drafts.get(draftKey)?.message || ''); const [images, setImages] = useState<ImageInput[]>(drafts.get(draftKey)?.images || []); const [options, setOptions] = useState(false); const [paid, setPaid] = useState(false); const [busy, setBusy] = useState(false); const [preparing, setPreparing] = useState(false); const [crop, setCrop] = useState(false); const [maxThinking, setMaxThinking] = useState(true);
  const file = useRef<HTMLInputElement>(null); const text = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { drafts.set(draftKey, { message, images }); if (text.current) { text.current.style.height = 'auto'; text.current.style.height = `${Math.min(128, Math.max(44, text.current.scrollHeight))}px`; } }, [message, images, draftKey]);
  const imageEnabled = subject !== 'chinese';
  async function attach(files: FileList | null) {
    if (!files?.length) return; setPreparing(true);
    try { if (images.length + files.length > 4) throw new Error('每次最多4张图片'); const results: ImageInput[] = []; for (const f of Array.from(files)) results.push(await prepareImage(f, crop)); setImages([...images, ...results]); }
    catch (e) { notify(errorText(e)); } finally { setPreparing(false); if (file.current) file.current.value = ''; }
  }
  async function submit(e: Event) {
    e.preventDefault(); if (busy || !message.trim()) return;
    setBusy(true);
    try { await onSend({ message: message.trim(), images: imageEnabled ? images : [], allow_paid_images: paid, ...(capabilities?.streaming ? { allow_max_thinking: maxThinking } : {}) }); drafts.delete(draftKey); setMessage(''); setImages([]); setPaid(false); }
    catch (e) { notify(errorText(e, errors)); } finally { setBusy(false); }
  }
  return <><form class={`composer ${compact ? 'compact' : ''}`} onSubmit={submit}>
    <label class="sr-only" for={`message-${draftKey}`}>题目或知识问题</label>
    <textarea ref={text} id={`message-${draftKey}`} maxLength={20000} value={message} disabled={disabled || busy} onInput={e => setMessage(e.currentTarget.value)} placeholder={compact ? '继续提问…' : '写下题目，或说说你卡在哪里…'} rows={1} required />
    {!!images.length && imageEnabled && <div class="attachments">{images.map((im, i) => <div key={i}><img src={`data:${im.media_type};base64,${im.data}`} alt={`待提交题图${i + 1}`} /><button type="button" aria-label={`移除题图${i + 1}`} onClick={() => setImages(images.filter((_, index) => i !== index))}><Icon name="close" /></button></div>)}</div>}
    <div class="composer-actions"><div class="attach-controls">{context}{imageEnabled && <button type="button" class="quiet icon-button" aria-label="添加题图" disabled={busy || preparing || disabled} onClick={() => file.current?.click()}><Icon name="image" /></button>}<input ref={file} hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onChange={e => void attach(e.currentTarget.files)} /><button type="button" class="quiet composer-options" aria-label="提问选项" onClick={() => setOptions(true)}><Icon name="filter" />{paid && <span class="consent-dot" />}</button></div><button class="primary send-button" aria-label={busy ? '提交中…' : preparing ? '处理图片…' : label} disabled={disabled || busy || preparing || !message.trim()}>{busy || preparing ? <span class="loading-dot" /> : <Icon name="send" />}</button></div>
    {paid && <p class="consent-note" role="status">本次绘图已授权 · {capabilities && cost(capabilities.image_price.cost)} / 次</p>}
  </form>{options && <Sheet title="提问选项" onClose={() => setOptions(false)}>{imageEnabled && <Switch label="题图居中裁方" checked={crop} onChange={setCrop} detail="上传前裁剪，默认保留完整题图" />}{capabilities?.streaming && <Switch label="难题允许深入思考" checked={maxThinking} onChange={setMaxThinking} disabled={disabled || busy} />}<Switch label="允许本次付费绘图" checked={paid} onChange={setPaid} disabled={disabled || busy || !capabilities?.skills.some(s => s.name === 'GPTImage' && ['ready', 'configured'].includes(s.availability))} detail={capabilities ? `${cost(capabilities.image_price.cost)} / 次，仅此次提交有效` : '价格尚未读取'} /></Sheet>}</>;
}
