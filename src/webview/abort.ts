/** Cancellation primitives supported by older system WebViews; no global shims. */
const reasons = new WeakMap<AbortSignal, unknown>();

export function checkAbort(signal?: AbortSignal | null) {
  if (signal?.aborted) throw reasons.get(signal) ?? signal.reason ?? new DOMException('Request cancelled', 'AbortError');
}

/** Keep cancellation active while a response body is consumed, bounded by the deadline. */
export function deadlineSignal(parent?: AbortSignal | null, milliseconds = 15000): AbortSignal {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const finish = (reason: unknown) => {
    if (timer !== undefined) clearTimeout(timer);
    parent?.removeEventListener('abort', relay);
    reasons.set(controller.signal, reason);
    controller.abort(reason);
  };
  const relay = () => finish(parent?.reason ?? new DOMException('Request cancelled', 'AbortError'));
  if (parent?.aborted) { relay(); return controller.signal; }
  parent?.addEventListener('abort', relay, { once: true });
  timer = setTimeout(() => finish(new DOMException('Request timed out', 'TimeoutError')), milliseconds);
  // Node's unit runner need not stay alive for completed HTTP deadlines.
  (timer as unknown as { unref?: () => void }).unref?.();
  return controller.signal;
}
