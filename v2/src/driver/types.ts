/**
 * The batch driver's shapes. The driver is the only place Tesseract itself
 * runs a decision loop (vision §5.11, Batch): it drives the same sixteen
 * tools an interactive host would, through the same runtime, so every call
 * leaves the same authoring receipt. What a model (or the heuristic) does is
 * one thing only: given a step and what the page offers, pick a target or
 * ask a human. Everything else is deterministic and lives in the driver.
 */
import type {
  AssertionKind,
  Hint,
  HandoffBlockage,
  ScoredFacet,
  Snapshot,
  TestStep,
  Verb,
} from '../contract/schemas.js';
import type { ProposedAssertion, StepIntent } from '../resolve/index.js';

/** What the host model reports about one decision; it lands in the authoring receipt. */
export interface HostUsage {
  readonly model?: string;
  readonly promptFingerprint?: string;
  readonly tokens?: { readonly prompt?: number; readonly completion?: number };
}

/** What a decision is for: the step's action, a check of its expected result, or reaching a screen. */
export type DecisionPurpose = 'action' | 'assertion' | 'navigation';

export interface DeciderInput {
  readonly testCase: { readonly id: string; readonly title: string };
  readonly step: TestStep;
  /** The heuristic reading of what is being decided (for an assertion, the assertion's own intent). */
  readonly intent: StepIntent;
  readonly purpose: DecisionPurpose;
  /** For purpose "assertion": the assertion the step's wording proposes. */
  readonly assertion?: ProposedAssertion;
  readonly snapshot: Snapshot;
  /** The observer's ranked hints (a suggestion). */
  readonly hints: readonly Hint[];
  /** Facets memory returned for the step's wording (below the driver's memory threshold, or it would not ask). */
  readonly facets: readonly ScoredFacet[];
  /** The data row the case is authored with, by parameter name. */
  readonly params: Readonly<Record<string, string>>;
  /** Candidate refs already tried on this step; never choose them again. */
  readonly exclude: readonly string[];
  /** 1-based attempt number within the step's budget. */
  readonly attempt: number;
  /** One line per earlier step of the case: what happened. */
  readonly history: readonly string[];
}

export interface HandoffCandidate {
  readonly ref?: string;
  readonly role?: string;
  readonly name: string;
  readonly why?: string;
}

export type Decision =
  | {
      readonly kind: 'act';
      /** A candidate ref from the snapshot… */
      readonly ref?: string;
      /** …or a facet id from memory (exactly one of the two). */
      readonly facetId?: string;
      readonly verb: Verb;
      readonly value?: string;
      /** For purpose "assertion": the assertion to check on the chosen target. */
      readonly assertion?: { readonly kind: AssertionKind; readonly expected?: string | number };
      readonly reason: string;
      readonly rejected?: readonly string[];
      readonly host?: HostUsage;
    }
  | {
      readonly kind: 'handoff';
      readonly blockage: HandoffBlockage;
      readonly reason: string;
      readonly candidates: readonly HandoffCandidate[];
      readonly host?: HostUsage;
    };

/** The decider port: the heuristic (no model) and the Anthropic adapter implement it. */
export interface Decider {
  /** Short name for logs and summaries, e.g. "heuristic" or "anthropic:claude-opus-5-5". */
  readonly name: string;
  decide(input: DeciderInput): Promise<Decision>;
}

export interface Budgets {
  /** Decide-and-try rounds per step before a handoff. Default 3. */
  readonly attemptsPerStep: number;
  /** Host-reported tokens per test case; exhausting it raises a handoff on the current step. */
  readonly tokensPerCase?: number;
  /** Wall-clock milliseconds per test case; exhausting it raises a handoff on the current step. */
  readonly wallClockMsPerCase: number;
}

export const DEFAULT_BUDGETS: Budgets = { attemptsPerStep: 3, wallClockMsPerCase: 10 * 60_000 };

export interface PublishOptions {
  readonly planId: number;
  readonly suiteId: number;
  readonly runName: string;
}

export interface AuthorSuiteOptions {
  /** Test cases by id… */
  readonly testCaseIds?: readonly string[];
  /** …or by plan and suite. */
  readonly planId?: number;
  readonly suiteId?: number;
  /** Environment profile (.tesseract/profiles/<name>.json); defaults to $TESSERACT_PROFILE. */
  readonly profile?: string;
  /** Where each case starts, relative to the profile baseURL (default: the baseURL itself). */
  readonly startUrl?: string;
  /** Default: the heuristic decider (no model). */
  readonly decider?: Decider;
  readonly budgets?: Partial<Budgets>;
  /** Run the emitted specs (one test.run over the suite) after authoring. */
  readonly run?: boolean;
  /** Publish that run to Azure DevOps test points; implies run. */
  readonly publish?: PublishOptions;
  /** Re-read the cases from Azure DevOps (default true; falls back to the cache when ADO is not reachable). */
  readonly refresh?: boolean;
  /** Comment handoffs on the ADO test case (default: handoff.raise's default). */
  readonly commentOnAdo?: boolean;
  /** Memory facets scoring at least this resolve a step without observing. Default 0.6. */
  readonly memoryThreshold?: number;
  /** Proposed assertions below this confidence are not checked. Default 0.5. */
  readonly minAssertionConfidence?: number;
}

export type StepStatus = 'resolved' | 'handoff';

export interface StepSummary {
  readonly index: number;
  readonly stepIdentifier: string;
  readonly action: string;
  readonly status: StepStatus;
  readonly verb?: Verb;
  /** Facets the emitted step uses (target and assertions). */
  readonly facets: readonly string[];
  readonly assertions: number;
  /** How the target was found: memory, observe, url, none. */
  readonly via?: 'memory' | 'observe' | 'route' | 'url' | 'none';
  readonly attempts: number;
  readonly handoffId?: string;
  readonly blockage?: HandoffBlockage;
  readonly reason: string;
}

export interface HandoffSummary {
  readonly handoffId: string;
  readonly stepIndex: number;
  readonly blockage: HandoffBlockage;
  readonly reason: string;
}

export interface CaseRun {
  readonly runId: string;
  readonly outcome: string;
  readonly durationMs: number;
  readonly error?: string;
}

export interface CaseSummary {
  readonly testCaseId: string;
  readonly title: string;
  readonly revision?: number;
  /** authored: every step resolved; partial: emitted with handoffs; failed: nothing emitted. */
  readonly outcome: 'authored' | 'partial' | 'failed';
  readonly stepsTotal: number;
  readonly stepsResolved: number;
  readonly steps: readonly StepSummary[];
  readonly handoffs: readonly HandoffSummary[];
  readonly specPath?: string;
  readonly facetsMinted: readonly string[];
  readonly facetsUsed: readonly string[];
  readonly run?: CaseRun;
  readonly tokens: { readonly prompt: number; readonly completion: number };
  readonly durationMs: number;
  readonly error?: { readonly family: string; readonly message: string };
}

export interface SuiteSummary {
  readonly decider: string;
  readonly cases: readonly CaseSummary[];
  readonly run?: { readonly runId: string; readonly passed: number; readonly failed: number; readonly skipped: number; readonly flaky: number } | { readonly error: string };
  readonly publish?: { readonly runId: number; readonly url: string; readonly alreadyPublished: boolean } | { readonly error: string };
  readonly warnings: readonly string[];
  readonly durationMs: number;
}
