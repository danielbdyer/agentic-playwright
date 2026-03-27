/**
 * ConvergenceRibbon — scrolling time series of rung distribution bars.
 *
 * Semantic: left-to-right = iteration time. Rung distribution shifting
 * from red (needs-human) toward green (approved-knowledge) = the system learning.
 * The rightmost bar is the current iteration.
 *
 * Uses useLayoutEffect for auto-scroll measurement after DOM update.
 * Molecule: composes RungBar atoms. Memo-wrapped.
 */

import { memo, useRef, useLayoutEffect } from 'react';
import type { RungShiftEvent } from '../spatial/types';
import { RungBar } from '../atoms/rung-bar';

interface ConvergenceRibbonProps {
  readonly history: readonly RungShiftEvent[];
}

export const ConvergenceRibbon = memo(function ConvergenceRibbon({ history }: ConvergenceRibbonProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest iteration after DOM update
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [history.length]);

  if (history.length === 0) {
    return <div className="empty" style={{ padding: 8, fontSize: 12 }}>Awaiting first iteration…</div>;
  }

  return (
    <div ref={scrollRef} className="convergence-ribbon">
      {history.map((event) => (
        <RungBar
          key={event.iteration}
          distribution={event.distribution}
          compact
        />
      ))}
    </div>
  );
});
