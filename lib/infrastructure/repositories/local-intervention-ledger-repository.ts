import { promises as fs } from 'fs';
import path from 'path';
import type { InterventionLedgerRepository, PersistedInterventionLedger } from '../../domain/intervention/intervention-ledger-repository';
import { createInterventionLedger, interventionLedgerInvariants, type InterventionLedgerAggregate } from '../../domain/aggregates/intervention-ledger';
import { validateAgentSession, validateAgentEvent } from '../../domain/validation';

function toJsonLines(events: readonly unknown[]): string {
  return events.map((event) => JSON.stringify(event)).join('\n').concat('\n');
}

function assertInvariant(ledger: InterventionLedgerAggregate): InterventionLedgerAggregate {
  const report = interventionLedgerInvariants(ledger);
  if (!report.interventionIdsKnown || !report.participantRefsKnown) {
    throw new Error(`InterventionLedger invariant failure (${JSON.stringify(report)})`);
  }
  return ledger;
}

export const LocalInterventionLedgerRepository: InterventionLedgerRepository = {
  async save(paths, ledger): Promise<InterventionLedgerAggregate> {
    const validatedSession = validateAgentSession(ledger.session);
    const validatedEvents = ledger.events.map((event) => validateAgentEvent(event));
    const validated = assertInvariant(createInterventionLedger({ session: validatedSession, events: validatedEvents }));

    await Promise.all([
      fs.mkdir(path.dirname(paths.sessionPath), { recursive: true }),
      fs.mkdir(path.dirname(paths.eventsPath), { recursive: true }),
      fs.mkdir(path.dirname(paths.transcriptsPath), { recursive: true }),
    ]);

    await Promise.all([
      fs.writeFile(paths.sessionPath, `${JSON.stringify(validated.session, null, 2)}\n`, 'utf8'),
      fs.writeFile(paths.eventsPath, toJsonLines(validated.events), 'utf8'),
      fs.writeFile(paths.transcriptsPath, `${JSON.stringify(ledger.transcripts, null, 2)}\n`, 'utf8'),
    ]);

    return validated;
  },
};
