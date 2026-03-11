import type { RuntimeScenarioStepResult } from '../ports';

function assertInvariant(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Resolution receipt invariant failed: ${message}`);
  }
}

export function validateStepResults(input: {
  providerId: string;
  results: RuntimeScenarioStepResult[];
}) {
  input.results.forEach((step, index) => {
    const receipt = step.interpretation;
    assertInvariant(receipt.stage === 'resolution', `step[${index}] stage must be "resolution"`);
    assertInvariant(receipt.scope === 'step', `step[${index}] scope must be "step"`);
    assertInvariant(receipt.provider === input.providerId, `step[${index}] provider mismatch`);
    assertInvariant(receipt.stepIndex === step.execution.stepIndex, `step[${index}] interpretation/execution stepIndex mismatch`);
    assertInvariant(receipt.handshakes.includes('resolution'), `step[${index}] missing resolution handshake`);
    if (receipt.kind === 'needs-human') {
      assertInvariant(receipt.governance === 'review-required', `step[${index}] needs-human governance must be review-required`);
    }
    if (receipt.kind === 'resolved') {
      assertInvariant(receipt.governance === 'approved', `step[${index}] resolved governance must be approved`);
    }
    if (receipt.kind === 'resolved-with-proposals') {
      assertInvariant(receipt.governance === 'review-required', `step[${index}] resolved-with-proposals governance must be review-required`);
    }
  });
}
