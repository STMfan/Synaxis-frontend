import type { ClientBridge, SyllabusResult, SyllabusSection } from './types.ts';
import type { Transport } from './transport.ts';
/** Authenticated, read-only curriculum operations. Search is POST, never a teaching submission. */
export function syllabusApi(transport: Transport): Pick<ClientBridge, 'searchSyllabus' | 'syllabusSection'> {
  return {
    async searchSyllabus(query, signal) {
      const response = await transport.request('/v1/syllabus/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...query, query: query.query.trim() }), signal });
      return response.json() as Promise<SyllabusResult>;
    },
    async syllabusSection(id, signal) {
      const response = await transport.request('/v1/syllabus/sections/' + encodeURIComponent(id), { signal });
      return response.json() as Promise<SyllabusSection>;
    },
  };
}
