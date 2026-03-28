/**
 * StageDot — single pipeline stage status indicator.
 *
 * Semantic: gray = idle, pulsing cyan = active, solid green = complete.
 * Duration label appears below when stage completes.
 *
 * W5.22: React 19 ref-as-prop — ref is a regular prop, no forwardRef wrapper.
 * Pure atom. Memo-wrapped.
 */

import { memo, type Ref } from 'react';

interface StageDotProps {
  readonly name: string;
  readonly phase: 'idle' | 'active' | 'complete';
  readonly durationMs: number | null;
  readonly ref?: Ref<HTMLDivElement>;
}

/** Truncate stage name to a short label. Pure. */
const shortLabel = (name: string): string =>
  name.replace(/^(run-|build-|emit-|compile-|load-)/, '').slice(0, 8);

export const StageDot = memo(function StageDot({ name, phase, durationMs, ref }: StageDotProps) {
  return (
    <div ref={ref} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <div className={`stage-dot ${phase}`} title={name} />
      <span style={{ fontSize: 9, color: '#8b949e', maxWidth: 48, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {shortLabel(name)}
      </span>
      {phase === 'complete' && durationMs != null && (
        <span style={{ fontSize: 8, color: '#58a6ff' }}>
          {durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`}
        </span>
      )}
    </div>
  );
});
