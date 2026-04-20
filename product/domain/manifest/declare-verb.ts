/**
 * declareVerb — the registration convention every `product/` verb
 * uses to surface itself in the vocabulary manifest.
 *
 * Usage (inside a verb's declaration module):
 *
 *   import { declareVerb } from '<path>/product/domain/manifest/declare-verb';
 *
 *   export const observeVerb = declareVerb({
 *     name: 'observe',
 *     category: 'observe',
 *     summary: 'Capture an ARIA snapshot of the current page.',
 *     inputs: {
 *       typeName: 'ObserveInput',
 *       declaredIn: 'product/instruments/observation/aria.ts',
 *     },
 *     outputs: {
 *       typeName: 'ObserveResult',
 *       declaredIn: 'product/instruments/observation/aria.ts',
 *     },
 *     errorFamilies: ['timeout', 'unclassified'],
 *     sinceVersion: '2.1.0',
 *     declaredIn: 'product/instruments/observation/aria.ts',
 *   });
 *
 * The manifest emitter imports every verb declaration module at
 * build time and reads the exported `VerbEntry` values via a
 * module-level registry. The registry is append-only per module
 * load; duplicates fail the build via `buildManifest` in
 * `./manifest.ts`.
 *
 * Pure domain — no Effect, no IO. The registry state is opaque to
 * consumers; read it via `readRegisteredVerbs()`.
 */

import type { VerbEntry } from './verb-entry';

const registry: VerbEntry[] = [];
const registeredNames = new Set<string>();

/** Register a verb entry. Returns the entry unchanged so declaration
 *  modules can use the return value (e.g., as a default export or
 *  a callsite constant) while also getting registered. */
export function declareVerb(entry: VerbEntry): VerbEntry {
  if (registeredNames.has(entry.name)) {
    throw new Error(
      `declareVerb: duplicate verb name "${entry.name}" (already declared in ${
        registry.find((v) => v.name === entry.name)?.declaredIn ?? 'an earlier call'
      }).`,
    );
  }
  registeredNames.add(entry.name);
  registry.push(entry);
  return entry;
}

/** Read the current registry contents. Returns a fresh array so
 *  callers cannot mutate the internal state. */
export function readRegisteredVerbs(): readonly VerbEntry[] {
  return [...registry];
}

/** Clear the registry. Intended only for test isolation — never
 *  call this in production code. */
export function __resetVerbRegistry(): void {
  registry.length = 0;
  registeredNames.clear();
}
