/**
 * Rate limiting for Snaglist's own scan endpoint.
 *
 * In memory, which means it resets on restart and does not hold across more
 * than one instance. That is the right size for an MVP running on one box and
 * the wrong size the moment there are two, so it is written down here and in
 * docs/foundation.md rather than dressed up as something it is not.
 */

export const WINDOW_MS = 15 * 60 * 1000;
export const MAX_PER_WINDOW = 5;
export const MAX_CONCURRENT = 3;

const hits = new Map<string, number[]>();
let running = 0;

export interface RateDecision {
  allowed: boolean;
  /** Seconds until the caller may try again. Only set when refused. */
  retryAfterSeconds?: number;
  remaining: number;
}

function prune(now: number): void {
  for (const [key, times] of hits) {
    const fresh = times.filter((t) => now - t < WINDOW_MS);
    if (fresh.length === 0) hits.delete(key);
    else hits.set(key, fresh);
  }
}

export function takeScanSlot(key: string, now = Date.now()): RateDecision {
  prune(now);
  const times = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);

  if (times.length >= MAX_PER_WINDOW) {
    const oldest = times[0] ?? now;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000)),
      remaining: 0,
    };
  }

  times.push(now);
  hits.set(key, times);
  return { allowed: true, remaining: MAX_PER_WINDOW - times.length };
}

/** Give back a slot when the scan never ran, so a refused request is not charged. */
export function releaseScanSlot(key: string): void {
  const times = hits.get(key);
  if (!times || times.length === 0) return;
  times.pop();
  if (times.length === 0) hits.delete(key);
}

export function beginScan(): boolean {
  if (running >= MAX_CONCURRENT) return false;
  running += 1;
  return true;
}

export function endScan(): void {
  running = Math.max(0, running - 1);
}

/** Test seam. Nothing in the app calls this. */
export function resetLimiter(): void {
  hits.clear();
  running = 0;
}
