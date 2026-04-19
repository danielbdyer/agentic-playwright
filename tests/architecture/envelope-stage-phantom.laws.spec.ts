/**
 * Phase 0a: Envelope Stage Phantom Laws
 *
 * Asserts that the 8 envelope-compliant types carry narrow stage
 * literals via `WorkflowMetadata<'stage'>` extension, and that
 * stage-tag discrimination is enforced by the type system rather
 * than only by runtime assertion.
 *
 * Each `@ts-expect-error` block documents a specific cross-stage
 * assignment that is now a compile error. Removing the phantom
 * lift (reverting to `stage: WorkflowStage` wide union) would make
 * these lines compile successfully — and would therefore cause the
 * `@ts-expect-error` annotations themselves to fail, flagging the
 * regression.
 *
 * These laws are compile-time properties; the runtime test body
 * is mostly sanity checks.
 *
 * @see docs/envelope-axis-refactor-plan.md § 4 (Phase 0a)
 */
import { describe, test, expect } from 'vitest';
import type {
  WorkflowMetadata,
  WorkflowEnvelope,
  WorkflowStage,
} from '../../product/domain/governance/workflow-types';
import { asFingerprint } from '../../product/domain/kernel/hash';
import type { RunRecord, StepExecutionReceipt } from '../../product/domain/evidence/types';
import type { ProposalBundle } from '../../product/domain/execution/types';
import type { BoundScenario } from '../../product/domain/intent/types';
import type {
  ScenarioInterpretationSurface,
} from '../../product/domain/resolution/types';
import type {
  ResolutionGraphRecord,
  InterpretationDriftRecord,
} from '../../product/domain/drift/types';

describe('Phase 0a: envelope stage phantom', () => {
  // ─── Law 1: RunRecord is execution-stage ────────────────────

  test('Law 1: RunRecord extends WorkflowMetadata<"execution">', () => {
    // Type-level: RunRecord is assignable to WorkflowMetadata<'execution'>.
    type _ExecutionStage = RunRecord extends WorkflowMetadata<'execution'> ? true : false;
    const assertion: _ExecutionStage = true;
    expect(assertion).toBe(true);
  });

  test('Law 1b: RunRecord is NOT assignable to WorkflowMetadata<"preparation">', () => {
    // Type-level: RunRecord is NOT assignable to WorkflowMetadata<'preparation'>.
    type _NotPreparation = RunRecord extends WorkflowMetadata<'preparation'> ? true : false;
    const assertion: _NotPreparation = false;
    expect(assertion).toBe(false);
  });

  // ─── Law 2: ProposalBundle is proposal-stage ────────────────

  test('Law 2: ProposalBundle extends WorkflowMetadata<"proposal">', () => {
    type _ProposalStage = ProposalBundle extends WorkflowMetadata<'proposal'> ? true : false;
    const assertion: _ProposalStage = true;
    expect(assertion).toBe(true);
  });

  test('Law 2b: ProposalBundle is NOT assignable to WorkflowMetadata<"execution">', () => {
    type _NotExecution = ProposalBundle extends WorkflowMetadata<'execution'> ? true : false;
    const assertion: _NotExecution = false;
    expect(assertion).toBe(false);
  });

  // ─── Law 3: StepExecutionReceipt is execution-stage ─────────

  test('Law 3: StepExecutionReceipt extends WorkflowMetadata<"execution">', () => {
    type _ExecutionStage = StepExecutionReceipt extends WorkflowMetadata<'execution'> ? true : false;
    const assertion: _ExecutionStage = true;
    expect(assertion).toBe(true);
  });

  // ─── Law 4: BoundScenario is preparation-stage ──────────────

  test('Law 4: BoundScenario extends WorkflowMetadata<"preparation">', () => {
    type _PreparationStage = BoundScenario extends WorkflowMetadata<'preparation'> ? true : false;
    const assertion: _PreparationStage = true;
    expect(assertion).toBe(true);
  });

  // ─── Law 5: ScenarioInterpretationSurface is preparation-stage ───

  test('Law 5: ScenarioInterpretationSurface extends WorkflowMetadata<"preparation">', () => {
    type _PreparationStage = ScenarioInterpretationSurface extends WorkflowMetadata<'preparation'> ? true : false;
    const assertion: _PreparationStage = true;
    expect(assertion).toBe(true);
  });

  // ─── Law 6: ResolutionGraphRecord is resolution-stage ───────

  test('Law 6: ResolutionGraphRecord extends WorkflowMetadata<"resolution">', () => {
    type _ResolutionStage = ResolutionGraphRecord extends WorkflowMetadata<'resolution'> ? true : false;
    const assertion: _ResolutionStage = true;
    expect(assertion).toBe(true);
  });

  // ─── Law 7: InterpretationDriftRecord is resolution-stage ───

  test('Law 7: InterpretationDriftRecord extends WorkflowMetadata<"resolution">', () => {
    type _ResolutionStage = InterpretationDriftRecord extends WorkflowMetadata<'resolution'> ? true : false;
    const assertion: _ResolutionStage = true;
    expect(assertion).toBe(true);
  });

  // ─── Law 8: The stage parameter is required (no shim) ──────

  test('Law 8: WorkflowEnvelope requires an explicit stage parameter', () => {
    // After the Phase 0a tightening pass, the default stage
    // parameter is gone. Every call site must declare its stage.
    // Legitimate generic usage passes the wide `WorkflowStage`
    // union explicitly:
    type GenericWorkflowEnvelope = WorkflowEnvelope<{ x: number }, WorkflowStage>;
    type _HasWideStage = GenericWorkflowEnvelope extends { stage: WorkflowStage }
      ? true
      : false;
    const assertion: _HasWideStage = true;
    expect(assertion).toBe(true);
  });

  test('Law 8b: WorkflowEnvelope<T, "execution"> narrows the stage literal', () => {
    type _NarrowedExecution = WorkflowEnvelope<{ x: number }, 'execution'> extends { stage: 'execution' }
      ? true
      : false;
    const assertion: _NarrowedExecution = true;
    expect(assertion).toBe(true);
  });

  // ─── Law 9: Cross-stage assignment is a type error ─────────

  test('Law 9: cannot pass a preparation envelope where an execution envelope is expected', () => {
    // Regression signal: removing the stage phantom lift (reverting
    // to `stage: WorkflowStage` wide union) would make the ts-ignore
    // directive below become unused (TS2578), flagging the
    // regression at tsc time.
    function consumeExecution(_envelope: WorkflowMetadata<'execution'>): void {}

    const preparation: WorkflowMetadata<'preparation'> = {
      version: 1,
      stage: 'preparation',
      scope: 'scenario',
      ids: { adoId: null, suite: null, runId: null, dataset: null, runbook: null, resolutionControl: null },
      fingerprints: {
        artifact: asFingerprint('artifact', ''),
        content: null,
        surface: null,
        knowledge: null,
        controls: null,
        run: asFingerprint('run', ''),
      },
      lineage: { sources: [], parents: [], handshakes: ['preparation'] },
      governance: 'approved',
    };

    // @ts-expect-error cross-stage assignment: preparation → execution
    consumeExecution(preparation);

    expect(preparation.stage).toBe('preparation');
  });

  test('Law 9b: cannot pass an execution envelope where a proposal envelope is expected', () => {
    function consumeProposal(_envelope: WorkflowMetadata<'proposal'>): void {}

    const execution: WorkflowMetadata<'execution'> = {
      version: 1,
      stage: 'execution',
      scope: 'run',
      ids: { adoId: null, suite: null, runId: null, dataset: null, runbook: null, resolutionControl: null },
      fingerprints: {
        artifact: asFingerprint('artifact', ''),
        content: null,
        surface: null,
        knowledge: null,
        controls: null,
        run: asFingerprint('run', ''),
      },
      lineage: { sources: [], parents: [], handshakes: ['preparation', 'resolution', 'execution'] },
      governance: 'approved',
    };

    // @ts-expect-error cross-stage assignment: execution → proposal
    consumeProposal(execution);

    expect(execution.stage).toBe('execution');
  });

  // ─── Law 10: WorkflowStage enum includes all six canonical stages ───

  test('Law 10: all six canonical stages are members of WorkflowStage', () => {
    // Compile-time assertion that every canonical stage literal
    // is assignable to WorkflowStage. Adding a new stage to the
    // enum without updating the envelope types would fail here.
    const stages: readonly WorkflowStage[] = [
      'preparation',
      'resolution',
      'execution',
      'evidence',
      'proposal',
      'projection',
    ];
    expect(stages).toHaveLength(6);
  });
});
