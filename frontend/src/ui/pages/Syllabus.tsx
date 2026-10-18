import { useEffect, useRef, useState } from 'preact/hooks';
import type { CourseCategory, RetrievalMode, Subject, SyllabusQuery, SyllabusResult, SyllabusSection as Section, SyllabusSource } from '../../webview/types';
import { useClient, subjects } from '../stores/context';
import { pageNumbers, retrievalNames, scopeName, sourcePages, syllabusAccess, syllabusError } from '../stores/syllabus';
import { Choice, Sheet } from '../components/Touch';
import { Empty, ErrorNotice, Loading } from '../components/Common';
import { Icon } from '../components/Icon';

function Warnings({ values }: { values: string[] }) {
  return values.length ? <div class="syllabus-warnings" role="note" aria-label="原文质量提示">{values.map(value => <p key={value}><Icon name="info" />{value}</p>)}</div> : null;
}
function Source({ value }: { value: SyllabusSource }) {
  return <dl class="syllabus-source"><div><dt>来源 PDF</dt><dd>{value.file}</dd></div><div><dt>PDF 页序</dt><dd>{pageNumbers(value.pdf_pages) || '未提供'}</dd></div><div><dt>印刷页码</dt><dd>{pageNumbers(value.printed_pages) || '未提供'}</dd></div><div><dt>SHA-256</dt><dd class="source-hash">{value.sha256}</dd></div></dl>;
}
function Heading({ title }: { title: string }) {
  const { back } = useClient();
  return <header class="syllabus-heading"><button class="quiet icon-button" aria-label="返回上一屏" onClick={back}><Icon name="back" /></button><h1>{title}</h1></header>;
}
export function Syllabus({ active }: { active: boolean }) {
  const { bridge, capabilities, navigate, refresh, notify } = useClient(); const info = capabilities?.syllabus;
  const access = syllabusAccess(info);
  const [query, setQuery] = useState(''); const [subject, setSubject] = useState<Subject | ''>('');
  const [category, setCategory] = useState<CourseCategory | ''>(''); const [mode, setMode] = useState<RetrievalMode>(access.mode); const [topK, setTopK] = useState(5);
  const [filters, setFilters] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [result, setResult] = useState<SyllabusResult | null>(null); const [searched, setSearched] = useState<SyllabusQuery | null>(null);
  const controller = useRef<AbortController>();
  const modeTouched = useRef(false);
  useEffect(() => { if (!modeTouched.current || !access.modes.includes(mode)) setMode(access.mode); }, [info, mode]);
  useEffect(() => { if (!active) { controller.current?.abort(); setBusy(false); } return () => controller.current?.abort(); }, [active]);
  async function search(e?: Event) {
    e?.preventDefault(); if (!access.enabled) return;
    if (!query.trim() || query.trim().length > 2000) { setError('请输入不超过 2000 个字符的知识点或问题。'); return; }
    controller.current?.abort(); const ctrl = new AbortController(); controller.current = ctrl;
    const input: SyllabusQuery = { query: query.trim(), subject: subject || null, course_category: category || null, mode, top_k: topK };
    setBusy(true); setError('');
    try {
      const value = await bridge.searchSyllabus(input, ctrl.signal); if (ctrl.signal.aborted) return;
      if (value.status !== 'ok') throw new Error(value.code || value.message || '课标检索尚未就绪');
      setResult(value); setSearched(input);
    } catch (e) { if (!ctrl.signal.aborted) setError(syllabusError(e)); }
    finally { if (!ctrl.signal.aborted) setBusy(false); }
  }
  return <div class="page-content syllabus-page">
    {active && <Heading title="课程标准" />}
    <p class="syllabus-edition">{info?.edition || '2017 年版课程标准'}{info && info.sections > 0 && <span> · {info.subjects.length} 科 · {info.sections} 章</span>}</p>
    <p class="syllabus-scope">课程内容参考，不等同于高考考纲或省级细则。</p>
    {!access.enabled ? <div class="syllabus-unavailable"><Empty title="课标检索尚未就绪">{!info ? '当前服务尚未提供课程标准接口，请连接已接入课标库的 0.5.0 服务。' : syllabusError({ code: info.availability === 'disabled' ? 'SYLLABUS_DISABLED' : info.reason || 'SYLLABUS_NOT_INDEXED' })}</Empty><button onClick={() => void refresh().catch(e => notify(syllabusError(e)))}>刷新服务状态</button></div> : <>
      {access.fallback && <p class="syllabus-fallback" role="status">向量检索暂不可用，当前可使用词项检索。</p>}
      <form class="syllabus-search" onSubmit={search} noValidate>
        <label class="syllabus-query"><span class="sr-only">查找知识点</span><textarea value={query} rows={2} maxLength={2000} enterkeyhint="search" placeholder="例如：函数的概念、遗传信息…" onInput={e => setQuery(e.currentTarget.value)} /></label>
        <div class="syllabus-search-actions"><span>{retrievalNames[mode]}</span><button class="primary" disabled={busy || !query.trim()}>{busy ? '检索中…' : '检索'}<Icon name="arrow" /></button></div>
        <div class="syllabus-filters"><Choice label="课标科目" value={subject} choices={[{ value: '', label: '全部科目' }, ...(info?.subjects || []).map(value => ({ value, label: subjects[value] }))]} onChange={value => setSubject(value as Subject | '')} /><Choice label="课程类别" value={category} choices={[{ value: '', label: '全部课程' }, ...(info?.course_categories || []).map(value => ({ value, label: value.replace('课程', '') }))]} onChange={value => setCategory(value as CourseCategory | '')} /><button class="quiet icon-button" type="button" aria-label="检索选项" onClick={() => setFilters(true)}><Icon name="filter" /></button></div>
      </form>
      {error && <ErrorNotice message={error} retry={() => void search()} />}
      {busy && <div class="syllabus-loading" role="status"><span class="loading-dot" />正在查找对应课标…</div>}
      {result && searched && <section class="syllabus-results" aria-label="课标检索结果" aria-busy={busy}>
        <div class="syllabus-result-heading"><h2>“{searched.query}”</h2><span>{result.count} 条 · {retrievalNames[result.mode]}</span></div>
        {result.results.map((hit, index) => <article key={hit.id} class="syllabus-hit"><button class="syllabus-hit-open" onClick={() => navigate('syllabus-section', hit.section_id)}><span class="syllabus-hit-meta">{hit.subject} · {hit.course_categories.join(' / ')}<span aria-label={`检索顺序 ${index + 1}`}>{index + 1}</span></span><strong>{hit.heading_path.slice(-2).join(' / ') || hit.section_id}</strong>{hit.scope !== 'course_specific' && <span class="syllabus-shared">{scopeName(hit.scope)}</span>}<span class="syllabus-excerpt">{hit.text}</span><span class="syllabus-pages">{sourcePages(hit.source)}<Icon name="arrow" /></span></button><Warnings values={hit.quality_warnings} /></article>)}
        {!result.results.length && <Empty title="未找到匹配片段">试试其他关键词或科目。未命中不代表不在课程范围。</Empty>}
      </section>}
      {!result && !busy && !error && <p class="syllabus-start">输入知识点，查看对应课标原文。</p>}
      {filters && <Sheet title="检索选项" onClose={() => setFilters(false)}><div class="sheet-form"><label>检索方式<Choice label="检索方式" value={mode} choices={access.modes.map(value => ({ value, label: retrievalNames[value] }))} onChange={value => { modeTouched.current = true; setMode(value as RetrievalMode); }} /></label><p class="muted">混合检索结合词项与语义；排序分数不代表置信度。</p><label>最多显示<Choice label="结果数量" value={String(topK)} choices={Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: `${i + 1} 条` }))} onChange={value => setTopK(Number(value))} /></label>{info?.local_only && <p class="muted">检索在后端本机运行，不产生云端向量调用费用。离线客户端仍需连接后端。</p>}</div></Sheet>}
    </>}
  </div>;
}

export function SyllabusSection({ id }: { id: string }) {
  const { bridge } = useClient(); const [section, setSection] = useState<Section | null>(null); const [busy, setBusy] = useState(true); const [error, setError] = useState(''); const [attempt, setAttempt] = useState(0); const [fragments, setFragments] = useState(false);
  useEffect(() => {
    const ctrl = new AbortController(); setBusy(true); setError('');
    void bridge.syllabusSection(id, ctrl.signal).then(value => { if (!ctrl.signal.aborted) setSection(value); }).catch(e => { if (!ctrl.signal.aborted) setError(syllabusError(e)); }).finally(() => { if (!ctrl.signal.aborted) setBusy(false); });
    return () => ctrl.abort();
  }, [id, attempt]);
  const groups = new Map<number, string[]>();
  for (const item of section?.fragments || []) if (typeof item.pdf_page === 'number' && typeof item.text === 'string') groups.set(item.pdf_page, [...(groups.get(item.pdf_page) || []), item.text]);
  return <div class="page-content syllabus-page syllabus-reader">
    <Heading title="课标原文" />
    {busy && <Loading />}{error && <ErrorNotice message={error} retry={() => setAttempt(attempt + 1)} />}
    {section && <article aria-label="完整课标章节"><p class="syllabus-edition">{section.subject} · {section.course_categories.join(' / ')}</p><h2 class="syllabus-section-title">{section.title}</h2>{section.heading_path.length > 1 && <p class="syllabus-breadcrumb">{section.heading_path.slice(0, -1).join(' / ')}</p>}<p class="syllabus-pages">{sourcePages(section.source)}</p>{section.scope !== 'course_specific' && <p class="syllabus-shared">{scopeName(section.scope)}，不代表该内容仅属于当前筛选课程。</p>}<Warnings values={section.quality_warnings} /><div class="syllabus-original">{section.text}</div>
      {!!groups.size && <details class="syllabus-provenance" onToggle={e => setFragments(e.currentTarget.open)}><summary><Icon name="down" />逐页摘录 · {groups.size} 页</summary>{fragments && [...groups].map(([page, texts]) => <section key={page} class="syllabus-fragment"><h3>PDF 第 {page} 页</h3>{texts.map((text, i) => <p key={i}>{text}</p>)}</section>)}</details>}
      <details class="syllabus-provenance"><summary><Icon name="down" />来源与课程分类</summary><Source value={section.source} /><dl><div><dt>适用范围</dt><dd>{scopeName(section.scope)}</dd></div><div><dt>原始课程分类</dt><dd>{section.original_course_categories.join(' / ') || '未提供'}</dd></div>{section.table_caption && <div><dt>原表标题</dt><dd>{section.table_caption}</dd></div>}{section.table_row !== null && <div><dt>原表行</dt><dd>{section.table_row}</dd></div>}</dl>{section.classification_evidence && <details><summary><Icon name="down" />原始分类依据</summary><pre class="syllabus-evidence">{JSON.stringify(section.classification_evidence, null, 2)}</pre></details>}</details>
    </article>}
  </div>;
}
