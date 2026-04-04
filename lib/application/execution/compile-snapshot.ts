import type { AdoId } from '../../domain/kernel/identity';
import type { BoundScenario, Scenario } from '../../domain/intent/types';
import type { ScenarioInterpretationSurface } from '../../domain/resolution/types';

export interface CompileSnapshot {
  adoId: AdoId;
  scenario: Scenario;
  scenarioPath: string;
  boundScenario: BoundScenario;
  boundPath: string;
  surface: ScenarioInterpretationSurface;
  surfacePath: string;
  hasUnbound: boolean;
}

export function createCompileSnapshot(input: CompileSnapshot): CompileSnapshot {
  return input;
}
