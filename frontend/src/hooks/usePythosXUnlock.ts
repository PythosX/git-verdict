import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PYTHOSX_URL,
  createReturnDetector,
  readPending,
  readUnlocked,
  writePending,
  writeUnlocked,
} from '../utils/pythosxUnlock';

export interface PythosXUnlock {
  unlocked: boolean;
  pending: boolean;
  /** True for a few seconds right after an unlock so the welcome banner can show. */
  welcome: boolean;
  /** Opens github.com/PythosX in a new tab and arms the return detector. */
  startUnlock: () => void;
  /** Manual fallback for browsers that do not fire the return events. */
  manualReveal: () => void;
  dismissWelcome: () => void;
}

export function usePythosXUnlock(): PythosXUnlock {
  const [unlocked, setUnlocked] = useState<boolean>(() => readUnlocked());
  const [pending, setPending] = useState<boolean>(() => readPending());
  const [welcome, setWelcome] = useState(false);
  const detector = useRef(createReturnDetector());

  const unlock = useCallback(() => {
    writeUnlocked();
    setUnlocked(true);
    setPending(false);
    setWelcome(true);
  }, []);

  useEffect(() => {
    if (unlocked) return undefined;
    const d = detector.current;
    const onLeave = () => d.leave(Date.now());
    const onReturn = () => { if (d.ret(Date.now())) unlock(); };
    const onVisibility = () => (document.visibilityState === 'hidden' ? onLeave() : onReturn());

    window.addEventListener('blur', onLeave);
    window.addEventListener('focus', onReturn);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', onLeave);
      window.removeEventListener('focus', onReturn);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [unlocked, unlock]);

  useEffect(() => {
    if (!welcome) return undefined;
    const t = window.setTimeout(() => setWelcome(false), 8000);
    return () => window.clearTimeout(t);
  }, [welcome]);

  const startUnlock = useCallback(() => {
    detector.current.click();
    writePending();
    setPending(true);
    window.open(PYTHOSX_URL, '_blank', 'noopener,noreferrer');
  }, []);

  return { unlocked, pending, welcome, startUnlock, manualReveal: unlock, dismissWelcome: () => setWelcome(false) };
}
