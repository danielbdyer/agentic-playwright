import type { DogfoodOptions } from '../dogfood';

export interface IterationCleanupContext {
  readonly options: DogfoodOptions;
  readonly iterationStartTime: string;
}
