/**
 * WeightIndicator — single calibration weight value with correlation tint.
 *
 * Semantic: bar length = weight magnitude. Color = whether this signal helps
 * (green = positively correlated with improvement, red = anti-correlated).
 *
 * W5.22: React 19 ref-as-prop — ref is a regular prop, no forwardRef wrapper.
 * Pure atom. Memo-wrapped.
 */

import { memo, type Ref } from 'react';

interface WeightIndicatorProps {
  readonly label: string;
  readonly value: number;
  readonly correlation: number;
  readonly ref?: Ref<HTMLDivElement>;
}

const correlationColor = (c: number): string =>
  c > 0.1 ? '#3fb950' : c < -0.1 ? '#f85149' : '#8b949e';

export const WeightIndicator = memo(function WeightIndicator({ label, value, correlation, ref }: WeightIndicatorProps) {
  return (
    <div ref={ref} className="weight-row">
      <span className="metric-label">{label}</span>
      <div style={{ flex: 1, marginLeft: 8, height: 6, borderRadius: 3, background: '#21262d', overflow: 'hidden' }}>
        <div style={{
          width: `${Math.min(100, value * 100)}%`,
          height: '100%',
          borderRadius: 3,
          background: correlationColor(correlation),
          transition: 'width 300ms ease-out, background-color 300ms',
        }} />
      </div>
      <span style={{ marginLeft: 6, fontSize: 11, color: '#8b949e', minWidth: 32, textAlign: 'right' }}>
        {value.toFixed(2)}
      </span>
    </div>
  );
});
