/**
 * `tesseract compounding-ratchet` — lock in a currently-passing
 * scenario as a never-regress invariant.
 *
 * Per docs/v2-compounding-engine-plan.md §7.Z9, this command:
 *   1. Reads the target scenario id from --scenario-id argv.
 *   2. Verifies the scenario is currently passing
 *      (trajectory-holds) in the latest receipt stream.
 *   3. Appends a Ratchet to the store.
 *   4. Exits 0 on success; non-zero if the scenario is not
 *      currently passing (evidenceQueryFailed).
 *
 * Append is idempotent by id (ratchet:<scenario-id>), so
 * re-running the command is safe.
 */

import { Effect } from 'effect';
import { createCommandSpec } from '../../../product/cli/shared';
import { authorRatchet } from '../../compounding/application/authoring';
import { liveCompoundingLayer } from '../../compounding/composition/live-services';

export interface CompoundingRatchetResult {
  readonly status: 'ratcheted';
  readonly ratchetId: string;
  readonly scenarioId: string;
  readonly firstPassedFingerprint: string;
}

export const compoundingRatchetCommand = createCommandSpec({
  flags: [] as const,
  parse: () => ({
    command: 'compounding-ratchet',
    strictExitOnUnbound: false,
    postureInput: {},
    execute: (paths) => {
      const layer = liveCompoundingLayer({ rootDir: paths.rootDir });
      const scenarioId = resolveScenarioIdFromArgv();
      if (!scenarioId) {
        return Effect.fail(
          new Error(
            'compounding-ratchet: --scenario-id <id> is required',
          ) as never,
        );
      }
      return Effect.gen(function* () {
        const ratchet = yield* authorRatchet({ scenarioId });
        const result: CompoundingRatchetResult = {
          status: 'ratcheted',
          ratchetId: ratchet.id,
          scenarioId: ratchet.scenarioId,
          firstPassedFingerprint: ratchet.firstPassedFingerprint,
        };
        return result;
      }).pipe(Effect.provide(layer));
    },
  }),
});

function resolveScenarioIdFromArgv(): string | null {
  const argv = process.argv;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--scenario-id' && i + 1 < argv.length) {
      return argv[i + 1]!;
    }
    if (argv[i]?.startsWith('--scenario-id=')) {
      return argv[i]!.slice('--scenario-id='.length);
    }
  }
  return null;
}
