import type { ImageInput } from '../../webview/types';
/** In-memory drafts survive tab changes and never persist private prompts to disk. */
export const drafts = new Map<string, { message: string; images: ImageInput[] }>();
