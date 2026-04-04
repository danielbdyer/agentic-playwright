import { isApproved, isReviewRequired } from '../../domain/types/shared-context';
import { foldResolutionReceipt } from '../../domain/kernel/visitors';
import { isResolution } from '../../domain/commitment/pipeline-staging';
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
    assertInvariant(isResolution(receipt.stage), `step[${index}] stage must be "resolution"`);
    assertInvariant(receipt.scope === 'step', `step[${index}] scope must be "step"`);
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
