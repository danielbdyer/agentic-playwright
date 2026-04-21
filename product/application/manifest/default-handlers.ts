/**
 * Default manifest verb handlers (v2 §6 Step 4c — full).
 *
 * Factory that builds a `ManifestVerbHandlerRegistry` covering the
 * declared verbs that have a usable runtime implementation. Verbs
 * whose runtime is not yet standalone-callable fall through to the
 * dashboard's "Unknown tool" branch by being absent from the
 * returned registry.
 *
 * ## Wired verbs
 *
 * - `test-compose` — calls `renderReadableSpecModule` from
 *   `product/instruments/codegen/spec-codegen.ts`. Pure: takes a
 *   `GroundedSpecFlow` + imports config, returns `{ code, lifecycle }`.
 *   No IO, no live page state; the agent can invoke it with a flow
 *   JSON and get a Playwright spec back.
 *
 * ## Unwired verbs (intentional)
 *
 * - `observe`, `interact`, `intent-fetch`, `facet-mint`,
 *   `facet-enrich`, `facet-query`, `locator-health-track`.
 *
 * These need runtime dependencies the MCP server doesn't hold:
 * `observe` / `interact` require a live Playwright page; `intent-
 * fetch` needs an AdoSource; `facet-*` need filesystem catalog
 * paths; `locator-health-track` needs evidence-log write access.
 * They'll wire in follow-up commits as each runtime gains a
 * standalone surface the MCP host can compose in.
 *
 * Absence from the registry is intentional and safe — the
 * dashboard MCP server falls through to the "Unknown tool" error
 * branch, giving the agent a legible response instead of a silent
 * hang or a crash.
 */

import { renderReadableSpecModule } from '../../instruments/codegen/spec-codegen';
import type { GroundedSpecFlow } from '../../domain/intent/types';
import { manifestVerbHandlerRegistry, type ManifestVerbHandlerRegistry } from './invoker';

/** Shape of the test-compose input as it arrives over the MCP
 *  wire. Must match the ManifestVerb declaration's `inputs.typeName`
 *  in `product/manifest/declarations.ts`. */
interface TestComposeInput {
  readonly flow: GroundedSpecFlow;
  readonly imports: {
    readonly fixtures: string;
    readonly scenarioContext: string;
  };
}

function isTestComposeInput(value: unknown): value is TestComposeInput {
  if (typeof value !== 'object' || value === null) return false;
  const input = value as { flow?: unknown; imports?: unknown };
  if (typeof input.flow !== 'object' || input.flow === null) return false;
  if (typeof input.imports !== 'object' || input.imports === null) return false;
  const imports = input.imports as { fixtures?: unknown; scenarioContext?: unknown };
  return typeof imports.fixtures === 'string' && typeof imports.scenarioContext === 'string';
}

/** The test-compose handler: emits a Playwright spec module from a
 *  grounded spec flow. Validates the input shape minimally and
 *  surfaces any validation failure as an error-shaped result that
 *  the MCP envelope will mark with `isError: true`. */
function testComposeHandler(input: unknown): unknown {
  if (!isTestComposeInput(input)) {
    throw new Error(
      'test-compose expects { flow: GroundedSpecFlow; imports: { fixtures: string; scenarioContext: string } }',
    );
  }
  const rendered = renderReadableSpecModule(input.flow, { imports: input.imports });
  return {
    code: rendered.code,
    lifecycle: rendered.lifecycle,
  };
}

/** Build the default manifest verb handler registry. Callers that
 *  want to extend it with host-specific handlers can merge via
 *  `mergeManifestVerbHandlerRegistries(defaultHandlers, extensions)`. */
export function createDefaultManifestVerbHandlers(): ManifestVerbHandlerRegistry {
  return manifestVerbHandlerRegistry({
    'test-compose': testComposeHandler,
  });
}
