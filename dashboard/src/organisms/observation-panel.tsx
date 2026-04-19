import { memo } from 'react';
import type { ScreenGroupContext } from '../../../product/domain/handshake/workbench';
import type {
  ConfidenceCrossedEvent,
  ElementEscalatedEvent,
  InboxItemEvent,
} from '../spatial/types';
import type {
  DashboardConnectionState,
  DashboardErrorState,
} from '../types';

interface ObservationPanelProps {
  readonly connection: DashboardConnectionState;
  readonly error: DashboardErrorState | null;
  readonly currentScreenGroup: ScreenGroupContext | null;
  readonly inboxItems: readonly InboxItemEvent[];
  readonly confidenceCrossings: readonly ConfidenceCrossedEvent[];
  readonly escalations: readonly ElementEscalatedEvent[];
}

const takeRecent = <T,>(items: readonly T[], count: number): readonly T[] =>
  items.slice(-count).reverse();

const describeScreenGroup = (
  group: ScreenGroupContext | null,
): {
  readonly title: string;
  readonly detail: string;
} =>
  group === null
    ? {
        title: 'Awaiting act-loop screen context',
        detail: 'No screen group has started yet.',
      }
    : {
        title: `${group.screen.screen} (${group.workItems.length} items)`,
        detail: `${group.screen.elements.length} elements, ${group.screen.screenAliases.length} aliases, ${group.totalOccurrences} occurrences`,
      };

const confidenceTone = (
  event: ConfidenceCrossedEvent,
): 'good' | 'warn' =>
  event.newStatus === 'approved-equivalent' ? 'good' : 'warn';

export const ObservationPanel = memo(function ObservationPanel({
  connection,
  error,
  currentScreenGroup,
  inboxItems,
  confidenceCrossings,
  escalations,
}: ObservationPanelProps) {
  // connection state is shown in the Presence Bar / StorylineRail; here we only need error
  void connection;
  const screenGroupSummary = describeScreenGroup(currentScreenGroup);
  const recentInbox = takeRecent(inboxItems, 4);
  const recentCrossings = takeRecent(confidenceCrossings, 4);
  const recentEscalations = takeRecent(escalations, 4);

  const hasAnyObservation =
    currentScreenGroup !== null ||
    recentInbox.length > 0 ||
    recentCrossings.length > 0 ||
    recentEscalations.length > 0;

  // Compact: when idle, show a single line. Sections expand as data arrives.
  return (
    <div className="card card-full">
      <h2>
        Observations
        <span style={{ float: 'right', fontSize: 12, color: '#8b949e' }}>
          {inboxItems.length} inbox
          {` · ${confidenceCrossings.length} crossings`}
          {` · ${escalations.length} escalations`}
        </span>
      </h2>

      {error && (
        <div className="observation-alert">
          {error.message}
        </div>
      )}

      {!hasAnyObservation && (
        <div className="empty" style={{ padding: 8, fontSize: 12 }}>
          Awaiting pipeline observations…
        </div>
      )}

      {currentScreenGroup !== null && (
        <section className="observation-section">
          <div className="observation-heading">Screen Group</div>
          <div className="observation-title">{screenGroupSummary.title}</div>
          <div className="observation-copy">{screenGroupSummary.detail}</div>
        </section>
      )}

      {recentInbox.length > 0 && (
        <section className="observation-section">
          <div className="observation-heading">Inbox</div>
          <div className="observation-list">
            {recentInbox.map((item) => (
              <div key={item.id} className="observation-item">
                <div className="observation-title">{item.screen} / {item.element}</div>
                <div className="observation-copy">{item.urgency} · {item.reason}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {recentCrossings.length > 0 && (
        <section className="observation-section">
          <div className="observation-heading">Confidence Crossings</div>
          <div className="observation-list">
            {recentCrossings.map((event) => (
              <div key={event.artifactId} className="observation-item">
                <div className="observation-kv">
                  <span className="observation-title">
                    {event.screen ?? 'unknown'}
                    {event.element ? ` / ${event.element}` : ''}
                  </span>
                  <span className={`observation-pill ${confidenceTone(event)}`}>
                    {event.newStatus}
                  </span>
                </div>
                <div className="observation-copy">
                  {event.previousStatus}{' → '}{(event.score * 100).toFixed(1)}%
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {recentEscalations.length > 0 && (
        <section className="observation-section">
          <div className="observation-heading">Escalations</div>
          <div className="observation-list">
            {recentEscalations.map((event) => (
              <div key={event.id} className="observation-item">
                <div className="observation-title">
                  {event.screen} / {event.element}
                </div>
                <div className="observation-copy">
                  {event.fromActor}{' → '}{event.toActor} · {event.reason}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
});
