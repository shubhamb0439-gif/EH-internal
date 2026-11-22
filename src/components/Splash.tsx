import { useEffect, useState } from 'react';
import { Mark, Wordmark } from './Logo';

/**
 * Boot screen: the horizon line draws out, the crescents swing in, the wordmark resolves.
 * Stays at least `min` ms so it never just flickers, then fades once `ready`.
 */
export function Splash({ ready, min = 1700, label = 'Internal systems' }: { ready: boolean; min?: number; label?: string }) {
  const [elapsed, setElapsed] = useState(false);
  const [gone, setGone] = useState(false);
  useEffect(() => { const t = setTimeout(() => setElapsed(true), min); return () => clearTimeout(t); }, [min]);
  const out = ready && elapsed;
  useEffect(() => { if (!out) return; const t = setTimeout(() => setGone(true), 650); return () => clearTimeout(t); }, [out]);
  if (gone) return null;
  return (
    <div className={`splash${out ? ' out' : ''}`} role="status" aria-label="Loading Event Horizon">
      <div className="splash-inner">
        <Mark className="splash-mark" animated />
        <Wordmark className="splash-word" />
        <div className="splash-bar" />
        <div className="splash-meta">{label}</div>
      </div>
    </div>
  );
}
