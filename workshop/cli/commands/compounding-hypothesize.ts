/**
 * `tesseract compounding-hypothesize` — author a new Hypothesis.
 *
 * Per docs/v2-compounding-engine-plan.md §7.Z9, this command mints
 * a Hypothesis + appends it to the HypothesisLedger.
 *
 * Input shape: the CLI reads an --input flag pointing to a JSON
 * file describing the authoring input (description, cohort,
 * prediction, supersedes, author). The JSON maps 1:1 to
 * HypothesisAuthoringInput.
 *
 * Rationale for file-based input: the shape is rich (nested cohort
 * + prediction unions) and doesn't fit the shared flag parser. A
 * JSON file also serves as a diff-able, reviewable authoring
 * artifact — operators commit the file, then run the CLI against
 * it.
 *
 * Exit code: 0 on success; Effect failures bubble as non-zero.
 */

import { Effect } from 'effect';
import { readFile } from 'node:fs/promises';
import { createCommandSpec } from '../../../product/cli/shared';
import {
  authorHypothesis,
  type HypothesisAuthoringInput,
} from '../../compounding/application/authoring';
import { liveCompoundingLayer } from '../../compounding/composition/live-services';

export interface CompoundingHypothesizeResult {
  readonly status: 'authored';
  readonly hypothesisId: string;
  readonly path: string;
}

export const compoundingHypothesizeCommand = createCommandSpec({
  flags: ['--input'] as const,
  parse: (context) => ({
    command: 'compounding-hypothesize',
    strictExitOnUnbound: false,
    postureInput: {},
    execute: (paths) => {
      const layer = liveCompoundingLayer({ rootDir: paths.rootDir });
      const inputPath = context.flags.input ?? resolveInputPathFromArgv();
      if (!inputPath) {
        return Effect.fail(
          new Error(
            'compounding-hypothesize: --input <path-to-hypothesis.json> is required',
          ) as never,
        );
      }
      return Effect.gen(function* () {
        const raw = yield* Effect.promise(() => readFile(inputPath, 'utf-8'));
        const input = JSON.parse(raw) as HypothesisAuthoringInput;
        const hypothesis = yield* authorHypothesis(input);
        const result: CompoundingHypothesizeResult = {
          status: 'authored',
          hypothesisId: hypothesis.id,
          path: inputPath,
        };
        return result;
      }).pipe(Effect.provide(layer));
    },
  }),
});

function resolveInputPathFromArgv(): string | null {
  const argv = process.argv;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--input' && i + 1 < argv.length) {
      return argv[i + 1]!;
    }
    if (argv[i]?.startsWith('--input=')) {
      return argv[i]!.slice('--input='.length);
    }
  }
  return null;
}
