import type { InferenceKnowledge } from '../domain/inference';
import { inferScenarioSteps } from '../domain/inference';
import type { AdoSnapshot } from '../domain/types';

export { loadInferenceKnowledge } from './knowledge';

export function inferSnapshotScenario(snapshot: AdoSnapshot, knowledge: InferenceKnowledge) {
  return inferScenarioSteps(snapshot, knowledge);
}
