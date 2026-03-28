/**
 * Cold-Start Accelerator types (N2.3)
 *
 * Seed packs and sparse-discovery strategy to reduce time-to-useful-baseline
 * for new suites.
 */

export type SeedPackKind = 'common-web' | 'form-heavy' | 'dashboard' | 'e-commerce' | 'custom';

export interface SeedPattern {
  readonly name: string;
  readonly selector: string;
  readonly role: string | null;
  readonly action: string;
  readonly confidence: number;
}

export interface SeedWidget {
  readonly componentType: string;
  readonly selectors: readonly string[];
  readonly actions: readonly string[];
}

export interface SeedRoute {
  readonly pattern: string;
  readonly description: string;
}

export interface SeedPack {
  readonly kind: SeedPackKind;
  readonly version: 1;
  readonly name: string;
  readonly description: string;
  readonly patterns: readonly SeedPattern[];
  readonly widgets: readonly SeedWidget[];
  readonly routes: readonly SeedRoute[];
}

export interface ColdStartConfig {
  readonly seedPacks: readonly SeedPackKind[];
  readonly discoveryBudget: number;
  readonly breadthFirst: boolean;
  readonly maxScreensPerIteration: number;
  readonly minCoverageForGraduation: number;
}

export interface ColdStartProgress {
  readonly kind: 'cold-start-progress';
  readonly iteration: number;
  readonly discoveredScreens: number;
  readonly coveredScreens: number;
  readonly coverageRate: number;
  readonly graduated: boolean;
  readonly remainingBudget: number;
}
