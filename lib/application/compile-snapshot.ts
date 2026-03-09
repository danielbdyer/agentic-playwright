import type { AdoId } from '../domain/identity';
import type { BoundScenario, Scenario, ScenarioTaskPacket } from '../domain/types';

export interface CompileSnapshot {
  adoId: AdoId;
  scenario: Scenario;
  scenarioPath: string;
  boundScenario: BoundScenario;
  boundPath: string;
  taskPacket: ScenarioTaskPacket;
  taskPath: string;
  hasUnbound: boolean;
}

export function createCompileSnapshot(input: CompileSnapshot): CompileSnapshot {
  return input;
}
