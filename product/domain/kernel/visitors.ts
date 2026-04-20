/**
 * Typed visitor (fold) functions for exhaustive case analysis on discriminated unions.
 *
 * Each fold function takes a discriminated union value and a cases record
 * containing one handler per variant. The TypeScript compiler ensures exhaustiveness
 * at the type level — if a new variant is added, all call sites fail to compile
 * until the new case is handled.
 *
 * Convention: fold functions live in the domain layer because they are pure
 * and side-effect free. They operate on the union types defined in ./types/.
 */

// ─── Utility types for auto-deriving fold case records ───

/**
 * Convert a kebab-case kind literal to a camelCase handler name.
 * E.g., `'resolved-with-proposals'` becomes `'resolvedWithProposals'`.
 *
 * Works for up to four segments (e.g., `'a-b-c-d'`).
 */
type Capitalize<S extends string> = S extends `${infer F}${infer R}` ? `${Uppercase<F>}${R}` : S;

type KebabToCamel<S extends string> =
  S extends `${infer A}-${infer B}-${infer C}-${infer D}`
    ? `${A}${Capitalize<B>}${Capitalize<C>}${Capitalize<D>}`
    : S extends `${infer A}-${infer B}-${infer C}`
      ? `${A}${Capitalize<B>}${Capitalize<C>}`
      : S extends `${infer A}-${infer B}`
        ? `${A}${Capitalize<B>}`
        : S;

/**
 * Auto-derive a fold Cases record from a discriminated union keyed on `kind`.
 *
 * Given a union `U` where each variant has `{ kind: K; ... }`, this produces:
 * ```
 * { readonly [camelCase(K)]: (variant: Extract<U, { kind: K }>) => R }
 * ```
 *
 * Usage:
 * ```ts
 * type MyCases<R> = DerivedFoldCases<MyUnion, R>;
 * ```
 */
export type DerivedFoldCases<U extends { readonly kind: string }, R> = {
  readonly [K in U['kind'] as KebabToCamel<K>]: (variant: Extract<U, { readonly kind: K }>) => R;
};

import type { PipelineFailureClass, PipelineImprovementTarget } from '../../../workshop/metrics/types';
import type { LocatorStrategy } from '../governance/workflow-types';
import type {
  StepInstruction,
  ValueRef,
  ValueRefFixturePath,
  ValueRefGeneratedToken,
  ValueRefLiteral,
  ValueRefParameterRow,
  ValueRefPostureSample,
} from '../intent/types';
import type {
  AgentInterpretedReceipt,
  NeedsHumanReceipt,
  ResolutionEvent,
  ResolutionReceipt,
  ResolvedReceipt,
  ResolvedWithProposalsReceipt,
} from '../resolution/types';
import type { StepWinningSource } from '../governance/workflow-types';
import type { BottleneckSignal } from '../learning/types';

// ─── ValueRef ───

export interface ValueRefCases<R> {
  readonly literal: (ref: ValueRefLiteral) => R;
  readonly fixturePath: (ref: ValueRefFixturePath) => R;
  readonly postureSample: (ref: ValueRefPostureSample) => R;
  readonly parameterRow: (ref: ValueRefParameterRow) => R;
  readonly generatedToken: (ref: ValueRefGeneratedToken) => R;
}

export function foldValueRef<R>(ref: ValueRef, cases: ValueRefCases<R>): R {
  switch (ref.kind) {
    case 'literal': return cases.literal(ref);
    case 'fixture-path': return cases.fixturePath(ref);
    case 'posture-sample': return cases.postureSample(ref);
    case 'parameter-row': return cases.parameterRow(ref);
    case 'generated-token': return cases.generatedToken(ref);
  }
}

// ─── StepInstruction ───

export type StepInstructionNavigate = Extract<StepInstruction, { kind: 'navigate' }>;
export type StepInstructionEnter = Extract<StepInstruction, { kind: 'enter' }>;
export type StepInstructionInvoke = Extract<StepInstruction, { kind: 'invoke' }>;
export type StepInstructionObserveStructure = Extract<StepInstruction, { kind: 'observe-structure' }>;
export type StepInstructionCustomEscapeHatch = Extract<StepInstruction, { kind: 'custom-escape-hatch' }>;

export interface StepInstructionCases<R> {
  readonly navigate: (instruction: StepInstructionNavigate) => R;
  readonly enter: (instruction: StepInstructionEnter) => R;
  readonly invoke: (instruction: StepInstructionInvoke) => R;
  readonly observeStructure: (instruction: StepInstructionObserveStructure) => R;
  readonly customEscapeHatch: (instruction: StepInstructionCustomEscapeHatch) => R;
}

export function foldStepInstruction<R>(instruction: StepInstruction, cases: StepInstructionCases<R>): R {
  switch (instruction.kind) {
    case 'navigate': return cases.navigate(instruction);
    case 'enter': return cases.enter(instruction);
    case 'invoke': return cases.invoke(instruction);
    case 'observe-structure': return cases.observeStructure(instruction);
    case 'custom-escape-hatch': return cases.customEscapeHatch(instruction);
  }
}

// ─── LocatorStrategy ───

export type LocatorStrategyRole = Extract<LocatorStrategy, { kind: 'role' }>;
export type LocatorStrategyLabel = Extract<LocatorStrategy, { kind: 'label' }>;
export type LocatorStrategyPlaceholder = Extract<LocatorStrategy, { kind: 'placeholder' }>;
export type LocatorStrategyText = Extract<LocatorStrategy, { kind: 'text' }>;
export type LocatorStrategyTestId = Extract<LocatorStrategy, { kind: 'test-id' }>;
export type LocatorStrategyCss = Extract<LocatorStrategy, { kind: 'css' }>;

export interface LocatorStrategyCases<R> {
  readonly role: (strategy: LocatorStrategyRole) => R;
  readonly label: (strategy: LocatorStrategyLabel) => R;
  readonly placeholder: (strategy: LocatorStrategyPlaceholder) => R;
  readonly text: (strategy: LocatorStrategyText) => R;
  readonly testId: (strategy: LocatorStrategyTestId) => R;
  readonly css: (strategy: LocatorStrategyCss) => R;
}

export function foldLocatorStrategy<R>(strategy: LocatorStrategy, cases: LocatorStrategyCases<R>): R {
  switch (strategy.kind) {
    case 'role': return cases.role(strategy);
    case 'label': return cases.label(strategy);
    case 'placeholder': return cases.placeholder(strategy);
    case 'text': return cases.text(strategy);
    case 'test-id': return cases.testId(strategy);
    case 'css': return cases.css(strategy);
  }
}

// ─── ResolutionReceipt ───

export interface ResolutionReceiptCases<R> {
  readonly resolved: (receipt: ResolvedReceipt) => R;
  readonly resolvedWithProposals: (receipt: ResolvedWithProposalsReceipt) => R;
  readonly agentInterpreted: (receipt: AgentInterpretedReceipt) => R;
  readonly needsHuman: (receipt: NeedsHumanReceipt) => R;
}

export function foldResolutionReceipt<R>(receipt: ResolutionReceipt, cases: ResolutionReceiptCases<R>): R {
  switch (receipt.kind) {
    case 'resolved': return cases.resolved(receipt);
    case 'resolved-with-proposals': return cases.resolvedWithProposals(receipt);
    case 'agent-interpreted': return cases.agentInterpreted(receipt);
    case 'needs-human': return cases.needsHuman(receipt);
  }
}

/**
 * Ternary fold: resolved (deterministic or with proposals) vs agent-interpreted vs needs-human.
 * Agent-interpreted receipts have a target and proposals but came from agentic interpretation
 * rather than deterministic knowledge — they're "resolved with lower confidence".
 */
export function foldResolutionOutcome<R>(
  receipt: ResolutionReceipt,
  cases: {
    readonly resolved: (receipt: ResolvedReceipt | ResolvedWithProposalsReceipt | AgentInterpretedReceipt) => R;
    readonly needsHuman: (receipt: NeedsHumanReceipt) => R;
  },
): R {
  switch (receipt.kind) {
    case 'resolved': return cases.resolved(receipt);
    case 'resolved-with-proposals': return cases.resolved(receipt);
    case 'agent-interpreted': return cases.resolved(receipt);
    case 'needs-human': return cases.needsHuman(receipt);
  }
}

// ─── PipelineImprovementTarget ───

export type ImprovementTargetTranslation = Extract<PipelineImprovementTarget, { kind: 'translation' }>;
export type ImprovementTargetScoring = Extract<PipelineImprovementTarget, { kind: 'scoring' }>;
export type ImprovementTargetResolution = Extract<PipelineImprovementTarget, { kind: 'resolution' }>;
export type ImprovementTargetRecovery = Extract<PipelineImprovementTarget, { kind: 'recovery' }>;
export type ImprovementTargetTrustPolicy = Extract<PipelineImprovementTarget, { kind: 'trust-policy' }>;

export interface PipelineImprovementTargetCases<R> {
  readonly translation: (target: ImprovementTargetTranslation) => R;
  readonly scoring: (target: ImprovementTargetScoring) => R;
  readonly resolution: (target: ImprovementTargetResolution) => R;
  readonly recovery: (target: ImprovementTargetRecovery) => R;
  readonly trustPolicy: (target: ImprovementTargetTrustPolicy) => R;
}

export function foldImprovementTarget<R>(target: PipelineImprovementTarget, cases: PipelineImprovementTargetCases<R>): R {
  switch (target.kind) {
    case 'translation': return cases.translation(target);
    case 'scoring': return cases.scoring(target);
    case 'resolution': return cases.resolution(target);
    case 'recovery': return cases.recovery(target);
    case 'trust-policy': return cases.trustPolicy(target);
  }
}

// ─── ResolutionEvent ───

export type ResolutionEventExhaustion = Extract<ResolutionEvent, { kind: 'exhaustion-recorded' }>;
export type ResolutionEventObservation = Extract<ResolutionEvent, { kind: 'observation-recorded' }>;
export type ResolutionEventRefsCollected = Extract<ResolutionEvent, { kind: 'refs-collected' }>;
export type ResolutionEventMemoryUpdated = Extract<ResolutionEvent, { kind: 'memory-updated' }>;
export type ResolutionEventReceiptProduced = Extract<ResolutionEvent, { kind: 'receipt-produced' }>;

export interface ResolutionEventCases<R> {
  readonly exhaustionRecorded: (event: ResolutionEventExhaustion) => R;
  readonly observationRecorded: (event: ResolutionEventObservation) => R;
  readonly refsCollected: (event: ResolutionEventRefsCollected) => R;
  readonly memoryUpdated: (event: ResolutionEventMemoryUpdated) => R;
  readonly receiptProduced: (event: ResolutionEventReceiptProduced) => R;
}

export function foldResolutionEvent<R>(event: ResolutionEvent, cases: ResolutionEventCases<R>): R {
  switch (event.kind) {
    case 'exhaustion-recorded': return cases.exhaustionRecorded(event);
    case 'observation-recorded': return cases.observationRecorded(event);
    case 'refs-collected': return cases.refsCollected(event);
    case 'memory-updated': return cases.memoryUpdated(event);
    case 'receipt-produced': return cases.receiptProduced(event);
  }
}

// ─── PipelineFailureClass ───

export interface PipelineFailureClassCases<R> {
  readonly translationThresholdMiss: () => R;
  readonly translationNormalizationGap: () => R;
  readonly aliasCoverageGap: () => R;
  readonly resolutionRungSkip: () => R;
  readonly scoringWeightMismatch: () => R;
  readonly recoveryStrategyMiss: () => R;
  readonly convergenceStall: () => R;
  readonly trustPolicyOverBlock: () => R;
}

export function foldPipelineFailureClass<R>(cls: PipelineFailureClass, cases: PipelineFailureClassCases<R>): R {
  switch (cls) {
    case 'translation-threshold-miss': return cases.translationThresholdMiss();
    case 'translation-normalization-gap': return cases.translationNormalizationGap();
    case 'alias-coverage-gap': return cases.aliasCoverageGap();
    case 'resolution-rung-skip': return cases.resolutionRungSkip();
    case 'scoring-weight-mismatch': return cases.scoringWeightMismatch();
    case 'recovery-strategy-miss': return cases.recoveryStrategyMiss();
    case 'convergence-stall': return cases.convergenceStall();
    case 'trust-policy-over-block': return cases.trustPolicyOverBlock();
  }
}

// ─── StepWinningSource ───

export interface StepWinningSourceCases<R> {
  readonly scenarioExplicit: () => R;
  readonly resolutionControl: () => R;
  readonly runbookDataset: () => R;
  readonly defaultDataset: () => R;
  readonly knowledgeHint: () => R;
  readonly postureSample: () => R;
  readonly generatedToken: () => R;
  readonly approvedKnowledge: () => R;
  readonly approvedEquivalent: () => R;
  readonly priorEvidence: () => R;
  readonly semanticDictionary: () => R;
  readonly structuredTranslation: () => R;
  readonly liveDom: () => R;
  readonly agentInterpreted: () => R;
  readonly none: () => R;
}

export function foldStepWinningSource<R>(source: StepWinningSource, cases: StepWinningSourceCases<R>): R {
  switch (source) {
    case 'scenario-explicit': return cases.scenarioExplicit();
    case 'resolution-control': return cases.resolutionControl();
    case 'runbook-dataset': return cases.runbookDataset();
    case 'default-dataset': return cases.defaultDataset();
    case 'knowledge-hint': return cases.knowledgeHint();
    case 'posture-sample': return cases.postureSample();
    case 'generated-token': return cases.generatedToken();
    case 'approved-knowledge': return cases.approvedKnowledge();
    case 'approved-equivalent': return cases.approvedEquivalent();
    case 'prior-evidence': return cases.priorEvidence();
    case 'semantic-dictionary': return cases.semanticDictionary();
    case 'structured-translation': return cases.structuredTranslation();
    case 'live-dom': return cases.liveDom();
    case 'agent-interpreted': return cases.agentInterpreted();
    case 'none': return cases.none();
  }
}

/**
 * Exhaustive record-based lookup for StepWinningSource to rung mapping.
 * TypeScript enforces all variants are covered at compile time.
 */
export const WINNING_SOURCE_TO_RUNG: Readonly<Record<StepWinningSource, string>> = {
  'scenario-explicit': 'explicit',
  'resolution-control': 'control',
  // Control-plane data resolutions: runbook datasets, dataset defaults,
  // and generated tokens are all produced by the control lane and
  // belong on the `control` rung, not the approved-knowledge rung.
  // Previously these were mapped to `approved-screen-knowledge` which
  // caused the resolution-by-rung display to lie about the state of
  // the system (inflating apparent knowledge coverage).
  'runbook-dataset': 'control',
  'default-dataset': 'control',
  'generated-token': 'control',
  'approved-equivalent': 'approved-equivalent-overlay',
  'semantic-dictionary': 'semantic-dictionary',
  'structured-translation': 'structured-translation',
  'live-dom': 'live-dom',
  'agent-interpreted': 'agent-interpreted',
  'prior-evidence': 'prior-evidence',
  'approved-knowledge': 'approved-screen-knowledge',
  'knowledge-hint': 'approved-screen-knowledge',
  'posture-sample': 'approved-screen-knowledge',
  // Unresolved steps belong at the terminal `needs-human` rung, not
  // inflating the approved-knowledge rate.
  'none': 'needs-human',
};

// ─── BottleneckSignal ───
//
// BottleneckSignal (product/domain/learning/types.ts:143) is a 5-variant
// union describing the shape of a knowledge bottleneck. Previously
// its only dispatch site (recommendArtifacts in
// workshop/learning/learning-bottlenecks.ts:179) used an
// ad-hoc switch. Named fold gives compile-time exhaustiveness so
// adding a new bottleneck signal variant breaks the build at every
// dispatch site until the new case is handled.

export interface BottleneckSignalCases<R> {
  readonly thinScreenCoverage: () => R;
  readonly repairRecoveryHotspot: () => R;
  readonly lowProvenanceCompleteness: () => R;
  readonly highUnresolvedRate: () => R;
  readonly translationFallbackDominant: () => R;
}

export function foldBottleneckSignal<R>(
  signal: BottleneckSignal,
  cases: BottleneckSignalCases<R>,
): R {
  switch (signal) {
    case 'thin-screen-coverage': return cases.thinScreenCoverage();
    case 'repair-recovery-hotspot': return cases.repairRecoveryHotspot();
    case 'low-provenance-completeness': return cases.lowProvenanceCompleteness();
    case 'high-unresolved-rate': return cases.highUnresolvedRate();
    case 'translation-fallback-dominant': return cases.translationFallbackDominant();
  }
}
