import type { SyllabusInfo, SyllabusSource, RetrievalMode } from '../../webview/types';

export const retrievalNames: Record<RetrievalMode, string> = { hybrid: '混合检索', lexical: '词项检索', semantic: '语义检索' };
export function syllabusAccess(info?: SyllabusInfo) {
  const modes = info?.availability === 'disabled' ? [] : info?.modes || [];
  const mode = modes.includes(info?.default_mode || 'hybrid') ? info!.default_mode : modes[0] || 'hybrid';
  return { enabled: modes.length > 0, modes, mode, fallback: !!info && info.availability !== 'ready' && modes.length > 0 };
}
export function scopeName(scope: string) {
  return ({ course_specific: '课程专属内容', shared_across_courses: '跨课程共用', shared_task: '共用学习任务', shared_with_elective: '与选修共用' } as Record<string, string>)[scope] || `适用范围：${scope}`;
}
export function pageNumbers(values: number[]) {
  const pages = [...new Set(values)].sort((a, b) => a - b); const ranges: string[] = [];
  for (let i = 0; i < pages.length; i++) { const begin = pages[i]; let end = begin; while (pages[i + 1] === end + 1) end = pages[++i]; ranges.push(begin === end ? String(begin) : `${begin}–${end}`); }
  return ranges.join('、');
}
export function sourcePages(source: SyllabusSource) {
  const pdf = pageNumbers(source.pdf_pages), printed = pageNumbers(source.printed_pages);
  return `${pdf ? `PDF 第 ${pdf} 页` : 'PDF 页序未提供'}${printed ? ` · 印刷第 ${printed} 页` : ''}`;
}
export function syllabusError(error: unknown) {
  const e = error as { code?: string; message?: string; status?: number; offline?: boolean };
  const code = e?.code || e?.message;
  const messages: Record<string, string> = {
    SYLLABUS_QUERY_TOO_LONG: '查询超出本地向量模型的 512 token 限制，请缩短关键词，或改用词项检索。',
    SYLLABUS_DISABLED: '当前服务已关闭课程标准检索。',
    SYLLABUS_NOT_INDEXED: '当前服务尚未导入课程标准库。',
    SYLLABUS_INDEX_INVALID: '课程标准库校验未通过，暂时无法检索。',
    SYLLABUS_MODEL_UNAVAILABLE: '本地向量模型尚未就绪，可尝试词项检索。',
    SYLLABUS_RETRIEVAL_FAILED: '课标检索暂未完成，请稍后再试。',
  };
  if (code && messages[code]) return messages[code];
  if (e?.status === 404) return '该章节不存在或课标库已更新，请返回重新检索。';
  if (e?.status === 503) return '当前服务的课程标准检索尚未就绪，请稍后重试。';
  if (e?.offline) return '无法连接课标服务，已保留当前检索结果。';
  return e?.message || '暂时无法读取课程标准，请稍后再试。';
}
