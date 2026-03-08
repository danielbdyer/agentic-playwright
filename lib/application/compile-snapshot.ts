import type { AdoId } from '../domain/identity';
import type { BoundScenario, Scenario } from '../domain/types';

export interface CompileSnapshot {
  adoId: AdoId;
  scenario: Scenario;
  scenarioPath: string;
  boundScenario: BoundScenario;
  boundPath: string;
  hasUnbound: boolean;
}

export function createCompileSnapshot(input: CompileSnapshot): CompileSnapshot {
  return input;
}
