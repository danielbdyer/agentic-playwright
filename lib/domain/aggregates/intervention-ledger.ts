import type { AgentEvent, AgentEventType, AgentSession } from '../types';

export interface InterventionLedgerAggregate {
  readonly session: AgentSession;
  readonly events: readonly AgentEvent[];
}

export interface InterventionLedgerInvariantReport {
  readonly interventionIdsKnown: boolean;
  readonly participantRefsKnown: boolean;
}

export interface InterventionLedgerInvariantError {
  readonly kind: 'intervention-ledger-invariant-error';
  readonly report: InterventionLedgerInvariantReport;
}

export type InterventionLedgerResult =
  | { readonly ok: true; readonly value: InterventionLedgerAggregate }
  | { readonly ok: false; readonly error: InterventionLedgerInvariantError };

const AGENT_EVENT_TYPES: readonly AgentEventType[] = [
  'orientation',
  'artifact-inspection',
  'discovery-request',
  'observation-recorded',
  'spec-fragment-proposed',
  'proposal-approved',
  'proposal-rejected',
  'rerun-requested',
  'execution-reviewed',
  'benchmark-action',
  'replay-action',
];

function emptyEventTypes(): Readonly<Record<AgentEventType, number>> {
  return AGENT_EVENT_TYPES.reduce((accumulator, eventType) => ({
    ...accumulator,
    [eventType]: 0,
  }), {} as Record<AgentEventType, number>);
}

function eventTypeCounts(events: readonly AgentEvent[]): Readonly<Record<AgentEventType, number>> {
  return events.reduce((counts, event) => ({
    ...counts,
    [event.type]: (counts[event.type] ?? 0) + 1,
  }), emptyEventTypes());
}

function withSessionDerivedFields(session: AgentSession, events: readonly AgentEvent[]): AgentSession {
  return {
    ...session,
    eventCount: events.length,
    eventTypes: eventTypeCounts(events),
  };
}

export function createInterventionLedger(input: {
  readonly session: AgentSession;
  readonly events?: readonly AgentEvent[];
}): InterventionLedgerResult {
  const events = input.events ?? [];
  const ledger = {
    session: withSessionDerivedFields(input.session, events),
    events,
  };
  const report = interventionLedgerInvariants(ledger);
  return report.interventionIdsKnown && report.participantRefsKnown
    ? { ok: true, value: ledger }
    : {
        ok: false,
        error: {
          kind: 'intervention-ledger-invariant-error',
          report,
        },
      };
}

export function appendEvent(
  ledger: InterventionLedgerAggregate,
  event: AgentEvent,
): InterventionLedgerResult {
  const events = [...ledger.events, event];
  return createInterventionLedger({
    session: withSessionDerivedFields(ledger.session, events),
    events,
  });
}

export function interventionLedgerInvariants(ledger: InterventionLedgerAggregate): InterventionLedgerInvariantReport {
  const interventionIds = new Set(ledger.session.interventions.map((intervention) => intervention.interventionId));
  const participantIds = new Set(ledger.session.participants.map((participant) => participant.participantId));
  return {
    interventionIdsKnown: ledger.events.every((event) => interventionIds.has(event.interventionId)),
    participantRefsKnown: ledger.events.every((event) => event.participantRefs.every((participant) => participantIds.has(participant.participantId))),
  };
}
