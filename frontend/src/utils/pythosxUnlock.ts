/**
 * Follow-PythosX click-through unlock.
 *
 * IMPORTANT (transparency): the app cannot verify a GitHub follow without an
 * OAuth flow. Returning from the PythosX profile tab is treated as a
 * click-through unlock only — nothing here claims a follow was verified.
 */

export const PYTHOSX_URL = 'https://github.com/PythosX';
export const PENDING_KEY = 'pythosx_unlock_pending';
export const UNLOCKED_KEY = 'pythosx_unlock_done';
/** Minimum time the visitor must have been away before a return auto-unlocks. */
export const MIN_AWAY_MS = 1200;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function store(): StorageLike | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
}

export function readUnlocked(s: StorageLike | null = store()): boolean {
  try { return s?.getItem(UNLOCKED_KEY) === '1'; } catch { return false; }
}

export function readPending(s: StorageLike | null = store()): boolean {
  try { return Boolean(s?.getItem(PENDING_KEY)); } catch { return false; }
}

export function writePending(now: number = Date.now(), s: StorageLike | null = store()): void {
  try { s?.setItem(PENDING_KEY, String(now)); } catch { /* storage unavailable */ }
}

export function writeUnlocked(s: StorageLike | null = store()): void {
  try {
    s?.setItem(UNLOCKED_KEY, '1');
    s?.removeItem(PENDING_KEY);
  } catch { /* storage unavailable */ }
}

/**
 * Pure state machine for detecting "left for GitHub, then came back".
 * - `click`  : visitor pressed the follow button (a tab was opened)
 * - `leave`  : this tab lost focus / became hidden
 * - `ret`    : this tab regained focus / became visible → returns true when it should unlock
 * A return only counts if the visitor actually left after clicking and stayed away
 * at least MIN_AWAY_MS, so focus events fired by the click itself cannot unlock.
 */
export function createReturnDetector(minAwayMs: number = MIN_AWAY_MS) {
  let armed = false;
  let leftAt: number | null = null;
  return {
    click() { armed = true; leftAt = null; },
    leave(now: number) { if (armed && leftAt === null) leftAt = now; },
    ret(now: number): boolean {
      if (!armed || leftAt === null) return false;
      const away = now - leftAt;
      leftAt = null;
      if (away < minAwayMs) return false;
      armed = false;
      return true;
    },
    isArmed: () => armed,
  };
}
