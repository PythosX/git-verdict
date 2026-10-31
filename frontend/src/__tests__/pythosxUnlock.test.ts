import { describe, it, expect, beforeEach } from 'vitest';
import {
  MIN_AWAY_MS, PENDING_KEY, UNLOCKED_KEY,
  createReturnDetector, readPending, readUnlocked, writePending, writeUnlocked,
} from '../utils/pythosxUnlock';

function memoryStore() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
  };
}

describe('createReturnDetector', () => {
  it('does not unlock before the follow button was clicked', () => {
    const d = createReturnDetector();
    d.leave(0);
    expect(d.ret(MIN_AWAY_MS + 1)).toBe(false);
  });

  it('unlocks when the visitor leaves after clicking and returns later', () => {
    const d = createReturnDetector();
    d.click();
    d.leave(1000);
    expect(d.ret(1000 + MIN_AWAY_MS)).toBe(true);
    expect(d.isArmed()).toBe(false);
  });

  it('ignores focus events that fire without leaving first', () => {
    const d = createReturnDetector();
    d.click();
    expect(d.ret(5000)).toBe(false);
    expect(d.isArmed()).toBe(true);
  });

  it('ignores a too-quick flicker away and back, but still unlocks on a real return', () => {
    const d = createReturnDetector();
    d.click();
    d.leave(0);
    expect(d.ret(100)).toBe(false);
    d.leave(200);
    expect(d.ret(200 + MIN_AWAY_MS + 50)).toBe(true);
  });

  it('only records the first leave event (blur + visibilitychange both fire)', () => {
    const d = createReturnDetector();
    d.click();
    d.leave(0);
    d.leave(900);
    expect(d.ret(MIN_AWAY_MS)).toBe(true);
  });
});

describe('unlock storage', () => {
  let s: ReturnType<typeof memoryStore>;
  beforeEach(() => { s = memoryStore(); });

  it('starts locked with nothing pending', () => {
    expect(readUnlocked(s)).toBe(false);
    expect(readPending(s)).toBe(false);
  });

  it('stores a pending state, then clears it when unlocked', () => {
    writePending(123, s);
    expect(readPending(s)).toBe(true);
    expect(s.getItem(PENDING_KEY)).toBe('123');
    writeUnlocked(s);
    expect(readUnlocked(s)).toBe(true);
    expect(s.getItem(UNLOCKED_KEY)).toBe('1');
    expect(readPending(s)).toBe(false);
  });

  it('survives unavailable storage without throwing', () => {
    expect(readUnlocked(null)).toBe(false);
    expect(() => writePending(1, null)).not.toThrow();
    expect(() => writeUnlocked(null)).not.toThrow();
  });
});
