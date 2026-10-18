/** The only contract imported across the UI / communication boundary. */
export type Subject = 'chinese' | 'english' | 'math' | 'physics' | 'chemistry' | 'biology' | 'politics' | 'history' | 'geography';
export type Status = 'queued' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled';
export type ExpertName = 'Poiesis' | 'Nexus' | 'Euclid' | 'Turing' | 'Nomos' | 'Panopt' | 'Chronos' | 'Meridian';
export interface Preferences { grade: '高一' | '高二' | '高三'; province: string | null; textbook: string; subject: Subject | null }
export interface Profile { id: number; username: string; created_at: string; preferences: Preferences }
export interface ImageInput { media_type: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'; data: string }
export interface TutorInput extends Partial<Preferences> { message: string; images?: ImageInput[]; allow_paid_images: boolean; allow_max_thinking?: boolean }
export interface MessageInput { message: string; images: ImageInput[]; allow_paid_images: boolean; allow_max_thinking?: boolean }
export interface Question { type: 'question'; id: string; prompt: string; options: string[] }
export type LeafBlock = { type: 'markdown'; text: string } | { type: 'latex'; source: string; display: boolean } | { type: 'svg' | 'html'; source: string } | Question | { type: 'localfile'; artifact_id: string; label: string };
export type Block = LeafBlock | { type: 'branch'; selected: string; tabs: { id: string; label: string; blocks: LeafBlock[] }[] };
export interface Presentation { version: '1.0'; blocks: Block[] }
export interface SessionSummary { id: string; title: string; summary: string; subject: Subject | null; grade: string; province: string | null; textbook: string; image_count: number; status: Status; expert: ExpertName | null; created_at: string; updated_at: string; pinned: boolean; archived: boolean }
export interface Session extends SessionSummary { original_message: string; question: Question | null; presentations: Presentation[]; error: string | null; submission_message_id: number | null }
export interface SessionPatch { title?: string; pinned?: boolean; archived?: boolean }
export interface PublicMessage { id: number; session_id: string; role: 'student' | 'assistant'; kind: 'question' | 'follow_up' | 'answer' | 'presentation'; text: string | null; question_id: string | null; images: { index: number; media_type: string; bytes: number; url: string }[]; presentation: Presentation | null; created_at: string; time_accuracy: 'exact' | 'inferred' }
export interface CursorPage<T> { items: T[]; next_cursor: string | null }
export interface MessagePage { items: PublicMessage[]; next_after: number | null }
export type Effort = 'off' | 'low' | 'high' | 'max';
export interface Plan { subject: Subject; expert: ExpertName; problem_type: string; task: string; skills: string[]; rationale: string; thinking?: 'default' | 'max'; complexity?: 'simple' | 'normal' | 'hard' | 'extreme'; max_reason?: string }
export type TeachingEvent = { id: number; event: 'queued' | 'running' | 'completed'; data: Record<string, never> } | { id: number; event: 'message'; data: { message: PublicMessage } } | { id: number; event: 'waiting'; data: { question: Question } } | { id: number; event: 'presentation'; data: Presentation } | { id: number; event: 'plan'; data: Plan } | { id: number; event: 'tool'; data: { name: string; result: Record<string, unknown> } } | { id: number; event: 'failed' | 'cancelled'; data: { code: string } } | { id: number; event: 'warning'; data: { code: string; fallback: 'markdown' } }
  | { id: number; event: 'output_start'; data: { stream_id: string; round: number; effort: Effort } }
  | { id: number; event: 'output_delta'; data: { stream_id: string; sequence: number; text: string } }
  | { id: number; event: 'output_end'; data: { stream_id: string; status: 'received' | 'aborted' } }
  | { id: number; event: 'reasoning_start'; data: { stream_id: string; round: number; effort: Effort } }
  | { id: number; event: 'reasoning_delta'; data: { stream_id: string; sequence: number; text: string } }
  | { id: number; event: 'reasoning_end'; data: { stream_id: string; status: 'received' | 'aborted' } }
  | { id: number; event: 'artifact'; data: RoundArtifact }
  | { id: number; event: 'thinking'; data: { effort: 'max'; source: 'planner' | 'expert'; reason: string } };
export interface RoundArtifact { round: number; status: 'received' | 'aborted'; artifact_id: string; name: string; mime: string; bytes: number }
export interface PricingInfo { mode: 'auto' | 'peak' | 'off_peak'; current_band: 'peak' | 'off_peak'; timezone: 'UTC+08:00'; peak_weekdays: number[]; peak_windows: [string, string][]; off_peak_multiplier: string; holiday_calendar_years: number[]; holiday_calendar_complete: boolean; version: string; settlement_clock: 'request_start'; reservation_band: 'peak' }
export interface EventPage { items: (TeachingEvent & { created_at: string })[]; next_after: number | null }
export interface Budget { session_id: string; currency: 'CNY'; limit: string; spent: string; uncertain: string; reserved: string; available: string; exhausted: boolean }
export interface UsageRecord { id: number; session_id: string | null; stage: string; model: string; status: string; created_at: string; input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_write_tokens: number; cost: string | null; currency: string; pricing_basis: string; error: string | null }
export interface UsageGroup { key: string; currency: string; calls: number; input_tokens: number; output_tokens: number; cache_read_tokens: number; estimated_cost: string; unknown_cost_calls: number }
export interface UsageSummary extends CursorPage<UsageGroup> { group_by: 'day' | 'session' | 'total'; date_from: string; date_to: string }
export interface Expert { name: ExpertName; translation: string; subjects: Subject[]; skills: string[]; effort: Effort; allow_max_thinking?: boolean; images: boolean }
export interface StageModel { provider: string; model: string; context_limit: number | null; max_output_tokens: number; effort: Effort; consumption_excluded: boolean; availability: 'configured' | 'unavailable' }
export type RetrievalMode = 'lexical' | 'semantic' | 'hybrid';
export type CourseCategory = '必修课程' | '选择性必修课程';
export interface SyllabusQuery { query: string; subject?: Subject | null; course_category?: CourseCategory | null; mode?: RetrievalMode; top_k?: number }
export interface SyllabusSource { file: string; sha256: string; pdf_pages: number[]; pdf_page_start: number; pdf_page_end: number; printed_pages: number[] }
export interface SyllabusInfo { availability: 'ready' | 'unavailable' | 'disabled'; reason: string | null; edition: string | null; subjects: Subject[]; course_categories: CourseCategory[]; modes: RetrievalMode[]; default_mode: RetrievalMode; model: string | null; chunks: number; sections: number; local_only: boolean; query_token_limit: number; scope: string }
export interface SyllabusContent { schema_version: '1.0'; document_id: string; subject: string; course_categories: CourseCategory[]; original_course_categories: string[]; scope: string; heading_path: string[]; text: string; source: SyllabusSource; quality_warnings: string[] }
export interface SyllabusHit extends SyllabusContent { id: string; section_id: string; context_before: string; context_pdf_pages: number[]; embedding_text: string; score: number; retrieval_method: RetrievalMode }
export interface SyllabusResult { status: 'ok' | 'unavailable' | 'disabled'; code: string | null; subject: Subject | null; edition: string | null; mode: RetrievalMode; count: number; results: SyllabusHit[]; message: string | null }
export interface SyllabusFragment { pdf_page?: number; text?: string; bbox?: number[]; [key: string]: unknown }
export interface SyllabusSection extends SyllabusContent { id: string; title: string; fragments: SyllabusFragment[]; classification_evidence: Record<string, unknown> | null; extraction_method: string | null; table_row: number | null; table_caption: string | null }
export interface Capabilities { syllabus?: SyllabusInfo; version: string; experts: Expert[]; skills: { name: string; availability: 'ready' | 'configured' | 'unavailable' | 'disabled'; reason?: string }[]; image_max_count: number; image_max_bytes: number; image_max_pixels: number; image_media_types: string[]; formats: string[]; image_price: { model: string; credits: number; cost: string; currency: 'CNY'; requires_explicit_consent: boolean }; max_steps: number; max_tool_calls: number; max_output_tokens: number; expert_max_output_tokens?: number; stage_efforts?: Record<string, Effort>; stage_max_output_tokens?: Record<string, number>; stage_models?: Record<string, StageModel>; streaming?: boolean; reasoning_streaming?: boolean; reasoning_source?: 'provider_returned_thinking'; reasoning_format?: 'text'; artifact_placement?: 'ordered_blocks'; pricing?: PricingInfo; stream_preview_format?: 'text'; planner_max_experts?: ExpertName[]; continuation_states: Status[]; budget_enforced: boolean; session_budget_cny: string }
export interface ErrorInfo { code: string; status: number; recovery: string; zh: string; en: string }
export interface ClientFault extends Error { code: string; status: number; offline: boolean }
export interface Tokens { access_token: string; refresh_token: string; expires_in: number; refresh_expires_in: number; token_type: 'bearer' }
export type Query = Record<string, string | number | boolean | null | undefined>;
export interface LocalSettings { server: string; theme: 'system' | 'light' | 'dark'; closeToTray: boolean }
export type BridgeEvents = { 'auth:expired': undefined; 'connection': boolean; 'lifecycle': boolean; 'settings': LocalSettings; 'navigate': string; 'back': { handled: boolean } };
export interface ClientBridge {
  readonly native: boolean;
  readonly desktop: boolean;
  settings(): LocalSettings;
  appearance(theme: 'light' | 'dark'): Promise<void>;
  configure(settings: LocalSettings): Promise<void>;
  on<K extends keyof BridgeEvents>(event: K, callback: (payload: BridgeEvents[K]) => void): () => void;
  health(): Promise<{ status: string; version: string; syllabus: string; sandbox: string }>;
  restore(): Promise<boolean>;
  login(username: string, password: string, remember?: boolean): Promise<void>;
  logout(): Promise<void>;
  forget(): Promise<void>;
  authenticated(): boolean;
  foreground(): boolean;
  profile(): Promise<Profile>;
  preferences(): Promise<Preferences>;
  setPreferences(value: Preferences): Promise<Preferences>;
  changePassword(current_password: string, new_password: string): Promise<void>;
  experts(): Promise<{ experts: Expert[]; skills: Record<string, string> }>;
  capabilities(): Promise<Capabilities>;
  errors(): Promise<{ items: ErrorInfo[] }>;
  searchSyllabus(query: SyllabusQuery, signal?: AbortSignal): Promise<SyllabusResult>;
  syllabusSection(id: string, signal?: AbortSignal): Promise<SyllabusSection>;
  sessions(query?: Query): Promise<CursorPage<SessionSummary>>;
  session(id: string, signal?: AbortSignal): Promise<Session>;
  create(value: TutorInput, key: string): Promise<Session>;
  patch(id: string, patch: SessionPatch): Promise<Session>;
  remove(id: string): Promise<void>;
  messages(id: string, after?: number, signal?: AbortSignal): Promise<MessagePage>;
  send(id: string, value: MessageInput, key: string): Promise<Session>;
  answer(id: string, question_id: string, answer: string, key: string): Promise<Session>;
  cancel(id: string): Promise<Session>;
  stream(id: string, after: number, signal: AbortSignal, callback: (event: TeachingEvent) => void, healthy?: () => void): Promise<void>;
  eventHistory(id: string, after?: number, signal?: AbortSignal): Promise<EventPage>;
  budget(id: string, signal?: AbortSignal): Promise<Budget>;
  usage(query?: Query): Promise<{ items: UsageRecord[]; next_before: number | null }>;
  usageSummary(query?: Query): Promise<UsageSummary>;
  image(session: string, message: number, index: number): Promise<Blob>;
  artifact(id: string): Promise<Blob>;
  minimize(): Promise<void>;
  close(): Promise<void>;
  saveFile(blob: Blob, name: string): Promise<void>;
}
declare global { interface Window { SynaxisSystemUi?: { setDark(dark: boolean): void } } }
