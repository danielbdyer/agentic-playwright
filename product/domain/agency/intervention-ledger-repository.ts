import type { AgentEvent, AgentSession, TranscriptRef } from '../handshake/session';
import type { InterventionLedgerAggregate } from '../aggregates/intervention-ledger';

export interface PersistedInterventionLedger {
  readonly session: AgentSession;
  readonly events: readonly AgentEvent[];
  readonly transcripts: readonly TranscriptRef[];
}

export interface InterventionLedgerRepository {
  readonly save: (paths: {
    readonly sessionPath: string;
    readonly eventsPath: string;
    readonly transcriptsPath: string;
  }, ledger: PersistedInterventionLedger) => Promise<InterventionLedgerAggregate>;
}
