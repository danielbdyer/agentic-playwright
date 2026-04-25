/**
 * Reasoning-port architecture law (W2.4 / Agent D #7).
 *
 * CLAUDE.md non-negotiable: "Every reasoning call produces a
 * ReasoningReceipt<Op>. Every agent-cognition callsite routes
 * through the unified Reasoning port." (See `AGENTS.md` lines
 * 158 + 241-250.)
 *
 * This law closes the gap Agent D #7 flagged: the commitment
 * was aspirational until now — no architecture-level test
 * prevented a future PR from adding `import { Anthropic } from
 * '@anthropic-ai/sdk'` directly in, say, `workshop/compounding/`
 * or `dashboard/server/`, bypassing the unified Reasoning port
 * entirely.
 *
 * ## What the law asserts
 *
 * Provider-SDK imports (Anthropic, OpenAI, GitHub Copilot,
 * Azure OpenAI) are permitted ONLY under
 * `product/reasoning/adapters/`. Any file outside that
 * subtree that imports such an SDK fails the build.
 *
 * This mirrors the discipline for:
 *   - Playwright imports (concentrated in
 *     product/instruments/tooling/);
 *   - Filesystem writes (concentrated at composition
 *     boundaries);
 *   - the reasoning port itself (product/reasoning/reasoning.ts
 *     is the only consumer of the adapters — everything else
 *     consumes the port via the Context.Tag).
 *
 * ## What's forbidden vs. what's permitted
 *
 * **Forbidden anywhere outside product/reasoning/adapters/**:
 *   - `import { Anthropic } from '@anthropic-ai/sdk'`
 *   - `import OpenAI from 'openai'`
 *   - `import ... from '@azure/openai'`
 *   - `import ... from '@github/copilot-language-server'`
 *   - Any path matching those SDK-package conventions.
 *
 * **Permitted anywhere**:
 *   - `import { Reasoning } from '.../reasoning/reasoning'` —
 *     the port contract, not an SDK.
 *   - `import { foldReasoningError } from '.../kernel/errors'` —
 *     classified-error handling.
 *   - Tests under `tests/` that document SDK contracts may
 *     import the type surface; the forbidden regex pattern
 *     deliberately matches only the value-import shape to
 *     accommodate them.
 */

import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../..');

/** Subtrees that may legitimately import provider SDKs. The
 *  adapter layer is the single crossing point. */
const ALLOWED_SUBTREES: readonly string[] = [
  'product/reasoning/adapters',
];

/** Provider-SDK import-specifier patterns. A file outside the
 *  allowed subtrees that matches any of these fails the law. */
const FORBIDDEN_SDK_PATTERNS: readonly RegExp[] = [
  /from\s+['"]@anthropic-ai\/sdk['"]/,
  /from\s+['"]@anthropic\/sdk['"]/,
  /from\s+['"]openai['"]/,
  /from\s+['"]@openai['"]/,
  /from\s+['"]@azure\/openai['"]/,
  /from\s+['"]@google\/generative-ai['"]/,
  /from\s+['"]@github\/copilot-language-server['"]/,
  /from\s+['"]@google-cloud\/aiplatform['"]/,
];

/** Subtrees to scan for violations. Top-level trees the
 *  discipline applies to. */
const SCAN_SUBTREES: readonly string[] = [
  'product',
  'workshop',
  'dashboard',
  'scripts',
  'bin',
];

function walkTs(dir: string, acc: string[] = []): string[] {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
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

function isUnderAllowedSubtree(filePath: string): boolean {
  const rel = path.relative(REPO_ROOT, filePath);
  return ALLOWED_SUBTREES.some((allowed) =>
    rel === allowed || rel.startsWith(allowed + path.sep),
  );
}

/** The law file itself mentions the SDK-path patterns literally
 *  in its regex source. It is allowed to self-reference — the
 *  test's scanner excludes itself. */
const SCAN_EXCLUDED_FILES: readonly string[] = [
  path.relative(REPO_ROOT, __filename),
];

describe('reasoning-port architecture law (W2.4 / Agent D #7)', () => {
  test('L-Reasoning-Port-Centrality: provider-SDK imports are confined to product/reasoning/adapters/', () => {
    const violations: string[] = [];

    for (const subtree of SCAN_SUBTREES) {
      const files = walkTs(path.join(REPO_ROOT, subtree));
      for (const file of files) {
        if (isUnderAllowedSubtree(file)) continue;
        const relForFilter = path.relative(REPO_ROOT, file);
        if (SCAN_EXCLUDED_FILES.includes(relForFilter)) continue;
        const content = readFileSync(file, 'utf-8');
        // Skip content inside block comments? For v1 we allow
        // block comments / strings to mention SDK names — only
        // `from '...'` import-statement matches trip the law.
        for (const pattern of FORBIDDEN_SDK_PATTERNS) {
          if (pattern.test(content)) {
            violations.push(
              `${path.relative(REPO_ROOT, file)}: forbidden provider-SDK import matching ${pattern.source}`,
            );
          }
        }
      }
    }

    expect(
      violations,
      `Provider-SDK imports are permitted only under product/reasoning/adapters/. Violations found:\n${violations.join('\n')}`,
    ).toEqual([]);
  });

  test('sanity: the scan reaches the three compartments', () => {
    // Prevent a silent pass if the walker stops finding files.
    const productFiles = walkTs(path.join(REPO_ROOT, 'product'));
    const workshopFiles = walkTs(path.join(REPO_ROOT, 'workshop'));
    expect(productFiles.length).toBeGreaterThan(0);
    expect(workshopFiles.length).toBeGreaterThan(0);
  });

  test('the allowed subtree exists (prevents scope drift)', () => {
    for (const allowed of ALLOWED_SUBTREES) {
      const absolute = path.join(REPO_ROOT, allowed);
      const stat = statSync(absolute, { throwIfNoEntry: false });
      expect(
        stat?.isDirectory() ?? false,
        `Allowed subtree "${allowed}" must exist`,
      ).toBe(true);
    }
  });
});
