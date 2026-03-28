/**
 * InboxFeed — minimal visualization for inbox-item-arrived events.
 *
 * Shows a compact feed of human-required decision points as they arrive.
 * Blocking items are highlighted; queued items are dimmer.
 * Molecule: composed of basic HTML elements. Memo-wrapped.
 */

import { memo } from 'react';
import type { InboxItemEvent } from '../spatial/types';

interface InboxFeedProps {
  readonly items: readonly InboxItemEvent[];
}

export const InboxFeed = memo(function InboxFeed({ items }: InboxFeedProps) {
  if (items.length === 0) return null;

  return (
    <div className="card card-full">
      <h2>Inbox ({items.length})</h2>
      <div className="inbox-feed">
        {items.map((item) => (
          <div
            key={item.id}
            className={`inbox-item inbox-item--${item.urgency}`}
            data-governance={item.governance}
          >
            <span className="inbox-urgency-badge">{item.urgency}</span>
            <span className="inbox-element">{item.screen}/{item.element}</span>
            <span className="inbox-reason">{item.reason}</span>
          </div>
        ))}
      </div>
    </div>
  );
});
