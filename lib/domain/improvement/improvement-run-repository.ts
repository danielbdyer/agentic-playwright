import type { ImprovementLedger, ImprovementRun } from '../types';

export interface ImprovementRunRepository {
  readonly loadLedger: (absolutePath: string) => Promise<ImprovementLedger>;
  readonly saveLedger: (absolutePath: string, ledger: ImprovementLedger) => Promise<ImprovementLedger>;
  readonly appendRun: (absolutePath: string, run: ImprovementRun) => Promise<ImprovementLedger>;
}
