import { promises as fs } from 'fs';
import path from 'path';
import type { ImprovementRunRepository } from '../../domain/improvement/improvement-run-repository';
import type { ImprovementLedger, ImprovementRun } from '../../domain/types';
import { appendImprovementRun, emptyImprovementLedger, improvementRunInvariants } from '../../domain/aggregates/improvement-run';

function normalizeImprovementLedger(value: unknown): ImprovementLedger {
  const record = value as Partial<ImprovementLedger> | null | undefined;
  return record?.kind === 'improvement-ledger'
    && record.version === 1
    && Array.isArray(record.runs)
    ? {
        kind: 'improvement-ledger',
        version: 1,
        runs: record.runs.filter(
          (run): run is ImprovementRun =>
            typeof run === 'object'
            && run !== null
            && (run as Partial<ImprovementRun>).kind === 'improvement-run'
            && (run as Partial<ImprovementRun>).version === 1
            && typeof (run as Partial<ImprovementRun>).improvementRunId === 'string',
        ),
      }
    : emptyImprovementLedger();
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function assertRun(run: ImprovementRun): ImprovementRun {
  const report = improvementRunInvariants(run);
  if (!report.uniqueIdentity || !report.lineageContinuity || !report.governanceConsistency) {
    throw new Error(`ImprovementRun invariant failure (${JSON.stringify(report)})`);
  }
  return run;
}

export const LocalImprovementRunRepository: ImprovementRunRepository = {
  async loadLedger(absolutePath: string): Promise<ImprovementLedger> {
    if (!(await exists(absolutePath))) {
      return emptyImprovementLedger();
    }
    const raw = JSON.parse(await fs.readFile(absolutePath, 'utf8'));
    const normalized = normalizeImprovementLedger(raw);
    normalized.runs.forEach((run) => {
      assertRun(run);
    });
    return normalized;
  },

  async saveLedger(absolutePath: string, ledger: ImprovementLedger): Promise<ImprovementLedger> {
    ledger.runs.forEach((run) => {
      assertRun(run);
    });
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
    return ledger;
  },

  async appendRun(absolutePath: string, run: ImprovementRun): Promise<ImprovementLedger> {
    const ledger = await LocalImprovementRunRepository.loadLedger(absolutePath);
    const updated = appendImprovementRun(ledger, assertRun(run));
    await LocalImprovementRunRepository.saveLedger(absolutePath, updated);
    return updated;
  },
};
