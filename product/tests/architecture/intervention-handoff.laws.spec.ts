/**
 * Intervention-handoff architecture law (W2.2 / Agent D #8).
 *
 * CLAUDE.md non-negotiable: "Every agentic decision produces
 * an InterventionHandoff. The shape is required, not optional.
 * No silent escalation; no `throw` as escape."
 *
 * v1 of the law (this file): structural invariants that catch
 * the most common drift patterns. v2 (deferred until the
 * convention beds in) will tighten with AST analysis to
 * detect "this code path should emit a handoff but throws
 * instead."
 *
 *   L-Single-Declaration: InterventionHandoff is declared in
 *     exactly one place (the canonical handshake module).
 *     Other modules import the type rather than redeclaring it.
 *
 *   L-Discriminator-Closed: ParticipantKind +
 *     ParticipantCapability are closed unions; widening either
 *     fails the build because all consumers fold them
 *     exhaustively.
 *
 *   L-Receipt-Discipline: any module that emits a `'needs-
 *     human'` literal (the canonical "agent gives up; operator
 *     follow-up" tag) imports from the handshake module — the
 *     fingerprint of "I produced a handoff, not a throw."
 */

import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const CANONICAL_HANDOFF_FILE = path.join(
  REPO_ROOT,
  'product/domain/handshake/intervention.ts',
);

function walkTs(dir: string, acc: string[] = []): string[] {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (
      entry.name === 'node_modules' ||
      entry.name === 'dist' ||
      entry.name.endsWith('.spec.ts')
    ) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTs(full, acc);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
      !entry.name.endsWith('.d.ts')
    ) {
      acc.push(full);
    }
  }
  return acc;
}

const SCAN_SUBTREES: readonly string[] = ['product', 'workshop', 'dashboard'];

describe('intervention-handoff architecture law (W2.2 / Agent D #8)', () => {
  test('L-Single-Declaration: InterventionHandoff is declared exactly once', () => {
    const declarationSites: string[] = [];
    for (const subtree of SCAN_SUBTREES) {
      const files = walkTs(path.join(REPO_ROOT, subtree));
      for (const file of files) {
        const content = readFileSync(file, 'utf-8');
        // Match `export interface InterventionHandoff` or
        // `export type InterventionHandoff =`.
        if (
          /export\s+interface\s+InterventionHandoff\b/.test(content) ||
          /export\s+type\s+InterventionHandoff\s*=/.test(content)
        ) {
          declarationSites.push(path.relative(REPO_ROOT, file));
        }
      }
    }
    expect(
      declarationSites,
      `InterventionHandoff must be declared in exactly one place; found ${declarationSites.length} sites: ${JSON.stringify(declarationSites)}`,
    ).toEqual([path.relative(REPO_ROOT, CANONICAL_HANDOFF_FILE)]);
  });

  test('L-Discriminator-Closed: handshake module exports the closed unions', () => {
    const content = readFileSync(CANONICAL_HANDOFF_FILE, 'utf-8');
    expect(content).toMatch(/export\s+type\s+ParticipantKind\s*=/);
    expect(content).toMatch(/export\s+type\s+ParticipantCapability\s*=/);
    expect(content).toMatch(/export\s+interface\s+InterventionHandoff\b/);
  });

  // Note: v1 of the law (this file) covers structural
  // invariants only. A "receipt-discipline" check that asserts
  // every agent-decision code path emits a handoff (rather
  // than throwing) was attempted but produced false positives:
  // the `'needs-human'` literal is also a legitimate status
  // tag in resolution/scenario types, not just a handoff
  // trigger. v2 of this law will use AST analysis to detect
  // "this code path returns a needs-human RESOLUTION outcome
  // without emitting a handoff" specifically — deferred until
  // the convention beds in.

  test('sanity: the canonical handshake file exists', () => {
    expect(statSync(CANONICAL_HANDOFF_FILE).isFile()).toBe(true);
  });
});
