import { useEffect, useRef, useState } from 'preact/hooks';
import type { ReasoningSnapshot } from '../stores/reasoning';
import { Icon } from './Icon';
export function Reasoning({ value }: { value: ReasoningSnapshot }) {
  const [open, setOpen] = useState(value.status === 'streaming'); const box = useRef<HTMLPreElement>(null); const follow = useRef(true);
  useEffect(() => { if (open && follow.current && box.current) box.current.scrollTop = box.current.scrollHeight; }, [open, value.text]);
  return <section class={`reasoning-panel ${open ? 'expanded' : ''} ${value.status}`} data-reasoning-stream={value.stream}>
    <button class="reasoning-toggle quiet" aria-label={`第 ${value.round} 轮思考`} aria-expanded={open} onClick={() => setOpen(!open)}><Icon name="brain" /><span>{value.status === 'streaming' ? '正在思考' : '思考过程'}<small>第 {value.round} 轮{value.status === 'aborted' ? ' · 已中断' : ''}</small></span>{value.status === 'streaming' && <span class="loading-dot" />}<Icon name="down" /></button>
    {open && <div class="reasoning-content"><pre ref={box} onScroll={e => { const n = e.currentTarget; follow.current = n.scrollHeight-n.scrollTop-n.clientHeight < 50; }}>{value.text || '等待思考内容…'}</pre>{value.truncated && <p>显示最近的思考片段；可下载本轮日志查看已保存内容。</p>}</div>}
  </section>;
}
