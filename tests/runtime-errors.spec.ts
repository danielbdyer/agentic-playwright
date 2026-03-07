import { expect, test } from '@playwright/test';
import {
  missingActionHandlerError,
  snapshotHandleResolutionError,
  unknownEffectTargetError,
  unknownScreenError,
} from '../lib/domain/errors';
import { createAdoId } from '../lib/domain/identity';
import { runtimeFailureDiagnostic } from '../lib/runtime/program';

test('runtime/domain error constructors keep stable machine-classifiable codes', () => {
  expect(unknownScreenError('policy-search').code).toBe('runtime-unknown-screen');
  expect(unknownScreenError('policy-search').message).toBe('Unknown screen policy-search');

  expect(unknownEffectTargetError('results-grid', 'surface').code).toBe('runtime-unknown-effect-target');
  expect(unknownEffectTargetError('results-grid', 'surface').message).toBe('Unknown surface target results-grid');

  expect(missingActionHandlerError('os-date', 'fill').code).toBe('runtime-missing-action-handler');
  expect(missingActionHandlerError('os-date', 'fill').message).toBe('No fill action registered for os-date');

  expect(snapshotHandleResolutionError().code).toBe('runtime-snapshot-handle-resolution-failed');
  expect(snapshotHandleResolutionError().message).toBe('Unable to resolve element handle for ARIA snapshot');
});

test('runtime failures map to compiler diagnostics with provenance for reporting/graph flows', () => {
  const diagnostic = runtimeFailureDiagnostic(
    {
      code: 'runtime-unknown-screen',
      message: 'Unknown screen policy-search',
      context: { screenId: 'policy-search' },
    },
    {
      adoId: createAdoId('10001'),
      stepIndex: 3,
      artifactPath: 'generated/specs/demo/10001.spec.ts',
      provenance: {
        sourceRevision: 12,
        contentHash: 'abc123',
      },
    },
  );

  expect(diagnostic.code).toBe('runtime-unknown-screen');
  expect(diagnostic.message).toBe('Unknown screen policy-search');
  expect(diagnostic.adoId).toBe(createAdoId('10001'));
  expect(diagnostic.stepIndex).toBe(3);
  expect(diagnostic.provenance.sourceRevision).toBe(12);
  expect(diagnostic.provenance.contentHash).toBe('abc123');
});
