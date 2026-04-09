import { isApproved, isReviewRequired } from '../../domain/governance/workflow-types';
import { foldResolutionReceipt } from '../../domain/kernel/visitors';
import type { RuntimeScenarioStepResult } from '../ports';
import { TesseractError } from '../../domain/kernel/errors';

function assertInvariant(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new TesseractError('validation-error', `Resolution receipt invariant failed: ${message}`);
  }
}

export function validateStepResults(input: {
  providerId: string;
  results: RuntimeScenarioStepResult[];
}) {
  input.results.forEach((step, index) => {
    const receipt = step.interpretation;
    // `receipt.stage` and `receipt.scope` are already narrowed to
    // the literals `'resolution'` and `'step'` at compile time —
    // `ResolutionReceipt` is a union of types that all extend
    // `ResolutionReceiptBase extends WorkflowMetadata<'resolution'>`
    // with `scope: 'step'` narrowed in the base. The previous
    // runtime `assertInvariant(isResolution(receipt.stage))` and
    // `assertInvariant(receipt.scope === 'step')` are now
    // compile-time invariants via Phase 0a's stage-phantom lift.
    assertInvariant(receipt.provider === input.providerId, `step[${index}] provider mismatch`);
    assertInvariant(receipt.stepIndex === step.execution.stepIndex, `step[${index}] interpretation/execution stepIndex mismatch`);
    assertInvariant(receipt.handshakes.includes('resolution'), `step[${index}] missing resolution handshake`);
    foldResolutionReceipt(receipt, {
      resolved: (r) => assertInvariant(isApproved(r), `step[${index}] resolved governance must be approved`),
      resolvedWithProposals: (r) => assertInvariant(isApproved(r), `step[${index}] resolved-with-proposals governance must be approved`),
      agentInterpreted: (r) => assertInvariant(isReviewRequired(r), `step[${index}] agent-interpreted governance must be review-required`),
      needsHuman: (r) => assertInvariant(isReviewRequired(r), `step[${index}] needs-human governance must be review-required`),
    });
  });
}
