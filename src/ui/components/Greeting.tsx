import { useEffect, useMemo, useState } from 'preact/hooks';
export function greetings(hour: number) {
  const welcome = hour < 6 ? '夜深了，慢慢想。' : hour < 11 ? '早上好，开始探索。' : hour < 14 ? '午好，让思路舒展。' : hour < 18 ? '下午好，继续向前。' : '晚上好，点亮新想法。';
  return [welcome, '今天，想弄明白什么？', '从一个问题开始。', '让好奇心，再走一步。'];
}
export function Greeting({ active }: { active: boolean }) {
  const words = useMemo(() => greetings(Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: 'numeric', hourCycle: 'h23' }).format(new Date()))), []);
  const [text, setText] = useState(words[0]);
  useEffect(() => {
    if (!active || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let timer: ReturnType<typeof setTimeout>, index = 0, length = words[0].length, deleting = true, stopped = false;
    const tick = () => {
      if (stopped) return;
      if (document.hidden) { timer = setTimeout(tick, 500); return; }
      length += deleting ? -1 : 1; setText(words[index].slice(0, Math.max(0, length)));
      let delay = deleting ? 34 : 82;
      if (length <= 0) { deleting = false; index = (index+1)%words.length; delay = 250; }
      else if (length >= words[index].length) { deleting = true; delay = 4200; }
      timer = setTimeout(tick, delay);
    };
    setText(words[0]); timer = setTimeout(tick, 4200);
    return () => { stopped = true; clearTimeout(timer); };
  }, [active, words]);
  return <h1 class="greeting" aria-label={words[0]}><span aria-hidden="true">{text}<i class="typing-cursor" /></span></h1>;
}
