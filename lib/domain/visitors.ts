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

import type {
  ValueRef,
  ValueRefLiteral,
  ValueRefFixturePath,
  ValueRefPostureSample,
  ValueRefParameterRow,
  ValueRefGeneratedToken,
  StepInstruction,
  LocatorStrategy,
  ResolutionReceipt,
  ResolvedReceipt,
  ResolvedWithProposalsReceipt,
  NeedsHumanReceipt,
  PipelineImprovementTarget,
  ResolutionEvent,
  PipelineFailureClass,
} from './types';

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

export type LocatorStrategyTestId = Extract<LocatorStrategy, { kind: 'test-id' }>;
export type LocatorStrategyRoleName = Extract<LocatorStrategy, { kind: 'role-name' }>;
export type LocatorStrategyCss = Extract<LocatorStrategy, { kind: 'css' }>;

export interface LocatorStrategyCases<R> {
  readonly testId: (strategy: LocatorStrategyTestId) => R;
  readonly roleName: (strategy: LocatorStrategyRoleName) => R;
  readonly css: (strategy: LocatorStrategyCss) => R;
}

export function foldLocatorStrategy<R>(strategy: LocatorStrategy, cases: LocatorStrategyCases<R>): R {
  switch (strategy.kind) {
    case 'test-id': return cases.testId(strategy);
    case 'role-name': return cases.roleName(strategy);
    case 'css': return cases.css(strategy);
  }
}

// ─── ResolutionReceipt ───

export interface ResolutionReceiptCases<R> {
  readonly resolved: (receipt: ResolvedReceipt) => R;
  readonly resolvedWithProposals: (receipt: ResolvedWithProposalsReceipt) => R;
  readonly needsHuman: (receipt: NeedsHumanReceipt) => R;
}

export function foldResolutionReceipt<R>(receipt: ResolutionReceipt, cases: ResolutionReceiptCases<R>): R {
  switch (receipt.kind) {
    case 'resolved': return cases.resolved(receipt);
    case 'resolved-with-proposals': return cases.resolvedWithProposals(receipt);
    case 'needs-human': return cases.needsHuman(receipt);
  }
}

/**
 * Binary fold: resolved (either variant) vs needs-human.
 * Useful for the common pattern of "if resolved, use target; else handle failure".
 */
export function foldResolutionOutcome<R>(
  receipt: ResolutionReceipt,
  cases: {
    readonly resolved: (receipt: ResolvedReceipt | ResolvedWithProposalsReceipt) => R;
    readonly needsHuman: (receipt: NeedsHumanReceipt) => R;
  },
): R {
  switch (receipt.kind) {
    case 'resolved': return cases.resolved(receipt);
    case 'resolved-with-proposals': return cases.resolved(receipt);
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
