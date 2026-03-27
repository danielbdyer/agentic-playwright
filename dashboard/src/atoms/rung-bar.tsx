/**
 * RungBar — single iteration's resolution rung distribution as a stacked bar.
 *
 * Semantic: green rungs (left) = deterministic knowledge. Red rungs (right) = unresolved.
 * Width of each segment encodes proportion. Zero-win rungs are elided via flatMap.
 *
 * Pure atom: distribution in, styled segments out. Memo-wrapped.
 */

import { memo } from 'react';
import { RUNG_COLORS } from '../spatial/types';

interface RungBarProps {
  readonly distribution: readonly { readonly rung: string; readonly wins: number; readonly rate: number }[];
  readonly compact?: boolean;
}

export const RungBar = memo(function RungBar({ distribution, compact = false }: RungBarProps) {
  const segments = distribution.flatMap((entry) =>
    entry.wins > 0
      ? [{
          rung: entry.rung,
          wins: entry.wins,
          color: RUNG_COLORS[entry.rung] ?? '#484f58',
        }]
      : [],
  );

  return (
    <div className="rung-bar" style={compact ? { height: 16, minWidth: 16 } : undefined}>
      {segments.map((seg) => (
        <div
          key={seg.rung}
          className="rung-segment"
          style={{ flex: seg.wins, backgroundColor: seg.color }}
          title={`${seg.rung}: ${seg.wins}`}
        >
          {!compact && seg.wins > 2 ? seg.wins : ''}
        </div>
      ))}
    </div>
  );
});
