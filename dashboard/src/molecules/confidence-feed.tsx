/**
 * ConfidenceFeed — minimal visualization for confidence-crossed events.
 *
 * Shows artifacts that have crossed a confidence threshold, transitioning
 * between learning/needs-review/approved-equivalent states.
 * Molecule: composed of basic HTML elements. Memo-wrapped.
 */

import { memo } from 'react';
import type { ConfidenceCrossedEvent } from '../spatial/types';

interface ConfidenceFeedProps {
  readonly items: readonly ConfidenceCrossedEvent[];
}

const STATUS_LABELS: Readonly<Record<string, string>> = {
  'approved-equivalent': 'Approved',
  'needs-review': 'Review',
  'learning': 'Learning',
};

export const ConfidenceFeed = memo(function ConfidenceFeed({ items }: ConfidenceFeedProps) {
  if (items.length === 0) return null;

  return (
    <div className="card card-full">
      <h2>Confidence Crossings ({items.length})</h2>
      <div className="confidence-feed">
        {items.map((item, idx) => (
          <div
            key={`${item.artifactId}-${idx}`}
            className={`confidence-item confidence-item--${item.newStatus}`}
          >
            <span className="confidence-status-badge">
              {STATUS_LABELS[item.newStatus] ?? item.newStatus}
            </span>
            <span className="confidence-artifact">
              {item.screen ? `${item.screen}/` : ''}{item.element ?? item.artifactId}
            </span>
            <span className="confidence-score">
              {(item.score * 100).toFixed(0)}% / {(item.threshold * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
});
