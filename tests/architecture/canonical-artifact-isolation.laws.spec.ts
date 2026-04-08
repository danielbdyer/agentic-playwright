/**
 * Architecture-fitness laws for canonical artifact store isolation.
 *
 * Per docs/canon-and-derivation.md § 7 Promotion and demotion, the
 * canonical artifact store at `{suiteRoot}/.canonical-artifacts/`
 * is the system's trusted understanding of the SUT. Writes to that
 * directory are reserved for the promotion machinery — operator
 * gestures, agent interventions, and deterministic-engine
 * promotions. Other code paths (the runtime, the measurement
 * subsystem, the iterate loop's scratch substrate) MUST NOT write
 * directly to the store.
 *
 * These laws are doctrinal guardrails. They MUST stay green; a
 * regression is a strong signal that an architectural mistake is
 * being made and should be reverted, not whitelisted.
 */

import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const LIB_ROOT = path.resolve(__dirname, '../..', 'lib');

function walkTs(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkTs(full));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      results.push(full);
    }
  }
  return results;
}

/** True when the source file appears to write to the canonical
 *  artifact store. The check looks for the path constants from
 *  `lib/application/paths/` (atomsAgenticDir, atomsDeterministicDir,
 *  etc.) being passed to writeText/writeJson calls, OR for literal
 *  references to '.canonical-artifacts'. */
function writesToCanonicalArtifacts(content: string): boolean {
  // Look for literal path references that would only appear in
  // code that writes to the store.
  if (content.includes("'.canonical-artifacts'") || content.includes('".canonical-artifacts"')) {
    return true;
  }
  // Look for path-constant references combined with write methods.
  const pathConstants = [
    'pipeline.canonicalArtifactsDir',
    'pipeline.atomsDir',
    'pipeline.atomsAgenticDir',
    'pipeline.atomsDeterministicDir',
    'pipeline.compositionsDir',
    'pipeline.compositionsAgenticDir',
    'pipeline.compositionsDeterministicDir',
    'pipeline.projectionsDir',
    'pipeline.projectionsAgenticDir',
    'pipeline.projectionsDeterministicDir',
  ];
  const hasPathRef = pathConstants.some((constant) => content.includes(constant));
  if (!hasPathRef) return false;
  // Path references AND write calls? That's a write-side touch.
  const hasWrite =
    content.includes('writeText(') ||
    content.includes('writeJson(') ||
    content.includes('ensureDir(');
  return hasWrite;
}

// ─── Law: lib/runtime/ does not write to the canonical artifact store ───

test('lib/runtime/ does not write to the canonical artifact store', () => {
  const runtimeFiles = walkTs(path.join(LIB_ROOT, 'runtime'));
  const violations: string[] = [];
  for (const file of runtimeFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    if (writesToCanonicalArtifacts(content)) {
      violations.push(path.relative(LIB_ROOT, file));
    }
  }
  expect(violations).toEqual([]);
});

// ─── Law: lib/application/measurement/ does not write to the store ───

test('lib/application/measurement/ does not write to the canonical artifact store', () => {
  const measurementFiles = walkTs(path.join(LIB_ROOT, 'application', 'measurement'));
  const violations: string[] = [];
  for (const file of measurementFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    if (writesToCanonicalArtifacts(content)) {
      violations.push(path.relative(LIB_ROOT, file));
    }
  }
  expect(violations).toEqual([]);
});

// ─── Law: lib/runtime-support/ does not write to the store ───

test('lib/application/runtime-support/ does not write to the canonical artifact store', () => {
  const supportFiles = walkTs(path.join(LIB_ROOT, 'application', 'runtime-support'));
  const violations: string[] = [];
  for (const file of supportFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    if (writesToCanonicalArtifacts(content)) {
      violations.push(path.relative(LIB_ROOT, file));
    }
  }
  expect(violations).toEqual([]);
});

// ─── Law: domain layer does not import application layer ───────

test('lib/domain/pipeline/ has no application or infrastructure imports', () => {
  const domainPipelineFiles = walkTs(path.join(LIB_ROOT, 'domain', 'pipeline'));
  const violations: string[] = [];
  const importRegex = /from\s+['"]([^'"]+)['"]/g;
  for (const file of domainPipelineFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(content)) !== null) {
      const imp = match[1]!;
      // Forbid any import that crosses out of the domain layer.
      if (
        imp.includes('lib/application/') ||
        imp.includes('lib/runtime/') ||
        imp.includes('lib/infrastructure/') ||
        imp.includes('lib/composition/')
      ) {
        violations.push(`${path.relative(LIB_ROOT, file)}: ${imp}`);
        continue;
      }
      if (imp.startsWith('.')) {
        const resolved = path.resolve(path.dirname(file), imp);
        const rel = path.relative(LIB_ROOT, resolved);
        if (
          rel.startsWith('application') ||
          rel.startsWith('runtime') ||
          rel.startsWith('infrastructure') ||
          rel.startsWith('composition')
        ) {
          violations.push(`${path.relative(LIB_ROOT, file)}: ${imp}`);
        }
      }
    }
  }
  expect(violations).toEqual([]);
});

// ─── Law: domain pipeline references existing identity types ────

test('lib/domain/pipeline/ atom-address.ts references existing kernel identities', () => {
  const atomAddressFile = path.join(LIB_ROOT, 'domain', 'pipeline', 'atom-address.ts');
  const content = fs.readFileSync(atomAddressFile, 'utf-8');
  expect(content).toContain("from '../kernel/identity'");
  // The atom address file should reference the canonical identity
  // brands rather than redefining them.
  expect(content).toContain('RouteId');
  expect(content).toContain('ScreenId');
  expect(content).toContain('ElementId');
  expect(content).toContain('PostureId');
});

// ─── Law: lookup chain implementation honors precedence order ───

test('lookup chain impl precedence order matches doctrine', () => {
  const implFile = path.join(LIB_ROOT, 'application', 'pipeline', 'lookup-chain-impl.ts');
  const content = fs.readFileSync(implFile, 'utf-8');
  // The pickHighestPrecedence functions should encode the
  // operator > agentic > deterministic > live > cold order.
  expect(content).toContain("'operator-override': 0");
  expect(content).toContain("'agentic-override': 1");
  expect(content).toContain("'deterministic-observation': 2");
  expect(content).toContain("'live-derivation': 3");
  expect(content).toContain("'cold-derivation': 4");
});
