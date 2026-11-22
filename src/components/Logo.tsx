import { useMemo } from 'react';
import { MARK_PATHS, wordmarkMarkup } from '../lib/brand';

/** Mark only. Inherits currentColor, so it's black/white automatically with the theme. */
export function Mark({ className, animated }: { className?: string; animated?: boolean }) {
  return (
    <svg viewBox="0 0 184 120" className={className} fill="currentColor" aria-label="Event Horizon" role="img">
      <path className={animated ? 's-top' : undefined} d={MARK_PATHS.top} />
      <g transform={MARK_PATHS.bottomTransform}>
        <path className={animated ? 's-bot' : undefined} d={MARK_PATHS.bottom} />
      </g>
      <path className={animated ? 's-line' : undefined} d={MARK_PATHS.horizon} />
    </svg>
  );
}

/** Full lockup (mark + wordmark) */
export function Lockup({ className }: { className?: string }) {
  const word = useMemo(() => wordmarkMarkup('currentColor', { x: 196, y: 60 - 13.6, scale: 0.68 }), []);
  const w = Math.ceil(196 + word.width + 4);
  return (
    <svg viewBox={`0 0 ${w} 120`} className={className} fill="currentColor" role="img" aria-label="Event Horizon">
      <path d={MARK_PATHS.top} />
      <path d={MARK_PATHS.bottom} transform={MARK_PATHS.bottomTransform} />
      <path d={MARK_PATHS.horizon} />
      <g dangerouslySetInnerHTML={{ __html: word.markup }} />
    </svg>
  );
}

/** Wordmark only (used on the splash). */
export function Wordmark({ className }: { className?: string }) {
  const word = useMemo(() => wordmarkMarkup('currentColor', { x: 2, y: 2 }), []);
  return (
    <svg viewBox={`0 0 ${Math.ceil(word.width + 4)} 44`} className={className} role="img" aria-label="Event Horizon">
      <g dangerouslySetInnerHTML={{ __html: word.markup }} />
    </svg>
  );
}
