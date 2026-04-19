import { existsSync, readdirSync, readFileSync } from 'fs';
import path from 'path';
import { expect, test } from '@playwright/test';

const rootDir = process.cwd();

function listTsFiles(relativeDir: string): string[] {
  const target = path.join(rootDir, relativeDir);
  if (!existsSync(target)) {
    return [];
  }

  const pending = [target];
  const files: string[] = [];

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) {
      continue;
    }

    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const nextPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(nextPath);
        continue;
      }
      if (entry.isFile() && nextPath.endsWith('.ts')) {
        files.push(nextPath);
      }
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function importsFor(filePath: string): string[] {
  const text = readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  return [...text.matchAll(/from\s+['"]([^'"]+)['"]/g)].flatMap((match) => (match[1] ? [match[1]] : []));
}

function fileText(filePath: string): string {
  return readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
}

function relativeFile(filePath: string): string {
  return path.relative(rootDir, filePath).replace(/\\/g, '/');
}

test('domain layer does not depend on application, infrastructure, runtime, or tooling layers', () => {
  const forbidden = ['../application', '../infrastructure', '../runtime'];
  const offenders = listTsFiles('product/domain').flatMap((filePath) =>
    importsFor(filePath)
      .filter((specifier) => forbidden.some((prefix) => specifier.startsWith(prefix)))
      .map((specifier) => `${relativeFile(filePath)} -> ${specifier}`),
  );

  expect(offenders).toEqual([]);
});

test('domain layer stays pure of playwright, filesystem adapters, and runtime component implementations', () => {
  const offenders = listTsFiles('product/domain').flatMap((filePath) =>
    importsFor(filePath)
      .filter((specifier) =>
        specifier === '@playwright/test'
        || specifier === 'fs'
        || specifier === 'path'
        || specifier.startsWith('node:fs')
        || specifier.startsWith('node:path')
        || specifier.includes('knowledge/components')
        || specifier.includes('dogfood/knowledge/components'),
      )
      .map((specifier) => `${relativeFile(filePath)} -> ${specifier}`),
  );

  expect(offenders).toEqual([]);
});

test('application layer depends on domain and application-local modules, not infrastructure or runtime', () => {
  const forbidden = ['../infrastructure/', '../runtime/'];
  const allowed = ['../runtime-support/'];
  const offenders = listTsFiles('product/application').flatMap((filePath) =>
    importsFor(filePath)
      .filter((specifier) => forbidden.some((prefix) => specifier.startsWith(prefix))
        && !allowed.some((prefix) => specifier.startsWith(prefix)))
      .map((specifier) => `${relativeFile(filePath)} -> ${specifier}`),
  );

  expect(offenders).toEqual([]);
});

test('recursive-improvement application modules route filesystem and git access through ports', () => {
  const files = [
    'workshop/orchestration/dogfood.ts',
    'workshop/orchestration/speedrun.ts',
    'workshop/orchestration/experiment-registry.ts',
  ].map((relativePath) => path.join(rootDir, relativePath));
  const forbiddenImports = ['fs', 'node:fs', 'child_process', 'node:child_process', 'simple-git'];
  const forbiddenPatterns = [
    /\breadFileSync\(/,
    /\bwriteFileSync\(/,
    /\bmkdirSync\(/,
    /\brmSync\(/,
    /\bexecSync\(/,
    /\bspawnSync\(/,
    /\bprocess\.cwd\(/,
  ];

  const offenders = files.flatMap((filePath) => {
    const importOffenders = importsFor(filePath)
      .filter((specifier) => forbiddenImports.includes(specifier))
      .map((specifier) => `${relativeFile(filePath)} -> import ${specifier}`);
    const text = fileText(filePath);
    const patternOffenders = forbiddenPatterns
      .filter((pattern) => pattern.test(text))
      .map((pattern) => `${relativeFile(filePath)} -> ${pattern}`);
    return [...importOffenders, ...patternOffenders];
  });

  expect(offenders).toEqual([]);
});

test('recursive-improvement fitness and aggregate builders do not import the dogfood orchestrator for loop contracts', () => {
  const files = [
    'workshop/orchestration/fitness.ts',
    'workshop/orchestration/dogfood.ts',
  ].map((relativePath) => path.join(rootDir, relativePath));

  const offenders = files.flatMap((filePath) =>
    importsFor(filePath)
      .filter((specifier) => specifier === './dogfood' || specifier.endsWith('/application/dogfood'))
      .map((specifier) => `${relativeFile(filePath)} -> ${specifier}`),
  );

  expect(offenders).toEqual([]);
});

test('runtime layer remains isolated from application and infrastructure orchestration', () => {
  const forbidden = ['../application', '../infrastructure'];
  const offenders = listTsFiles('product/runtime').flatMap((filePath) =>
    importsFor(filePath)
      .filter((specifier) => forbidden.some((prefix) => specifier.startsWith(prefix)))
      .map((specifier) => `${relativeFile(filePath)} -> ${specifier}`),
  );

  expect(offenders).toEqual([]);
});

test('runtime layer does not perform repo-root filesystem loading directly', () => {
  const forbiddenPatterns = [/process\.cwd\(/, /readFileSync\(/, /existsSync\(/];
  const offenders = listTsFiles('product/runtime')
    .filter((filePath) => forbiddenPatterns.some((pattern) => pattern.test(fileText(filePath))))
    .map(relativeFile);

  expect(offenders).toEqual([]);
});

test('infrastructure layer depends on application ports/domain, not runtime internals', () => {
  const forbidden = ['../runtime/', '../../runtime/'];
  const allowed = [
    '../runtime-support/',
    '../../runtime-support/',
    '../../runtime/adapters/navigation-strategy',
    // Grandfathered Step 0 crossings surfaced by the lib → product/instruments/ move.
    // product/instruments/observation/aria.ts carries the runtime result envelope
    // directly; its former lib/playwright/ location was outside this test's scan.
    '../../runtime/result',
  ];
  const offenders = listTsFiles('product/instruments').flatMap((filePath) =>
    importsFor(filePath)
      .filter((specifier) => forbidden.some((prefix) => specifier.startsWith(prefix))
        && !allowed.some((prefix) => specifier.startsWith(prefix)))
      .map((specifier) => `${relativeFile(filePath)} -> ${specifier}`),
  );

  expect(offenders).toEqual([]);
});

test('legacy compiler/adapters/tools/reporter directories no longer carry TypeScript sources', () => {
  const legacyFiles = [
    ...listTsFiles('lib/compiler'),
    ...listTsFiles('lib/adapters'),
    ...listTsFiles('lib/tools'),
    ...listTsFiles('lib/reporter'),
  ].map(relativeFile);

  expect(legacyFiles).toEqual([]);
});

test('active source no longer references legacy phase-one runtime and graph compatibility names', () => {
  const files = [
    ...[...listTsFiles('product'), ...listTsFiles('workshop'), ...listTsFiles('dashboard')],
  ];
  const forbidden = [
    /\bRuntimeProvider\b/,
    /\bRuntimeKnowledgeSession\b/,
    /\bCompiledInterfaceGraph\b/,
    /task-grounding-legacy/,
  ];

  const offenders = files
    .filter((filePath) => forbidden.some((pattern) => pattern.test(fileText(filePath))))
    .map(relativeFile);

  expect(offenders).toEqual([]);
});

test('bounded workflow packages expose explicit seam files instead of hidden lane contracts', () => {
  const expectedFiles = [
    'product/domain/kernel/index.ts',
    'product/domain/knowledge/index.ts',
    'product/domain/resolution/model.ts',
    'product/domain/resolution/index.ts',
    'product/domain/commitment/index.ts',
    'product/domain/governance/index.ts',
    'product/domain/projection/index.ts',
    'product/instruments/codegen/index.ts',
    'product/application/resolution/compile.ts',
    'product/application/commitment/run.ts',
    'product/application/projections/runner.ts',
    'product/runtime/resolve/index.ts',
    'product/runtime/execute/index.ts',
    'product/runtime/observe/index.ts',
  ];

  const missing = expectedFiles
    .filter((relativePath) => !existsSync(path.join(rootDir, relativePath)))
    .sort((left, right) => left.localeCompare(right));

  expect(missing).toEqual([]);
});

test('canonical control surfaces are present as first-class repo seams', () => {
  const suiteRoot = path.join(rootDir, 'dogfood');
  const expectedPaths = [
    'benchmarks',
    'controls/datasets',
    'controls/resolution',
    'controls/runbooks',
  ];
  const missing = expectedPaths
    .filter((relativePath) => !existsSync(path.join(suiteRoot, relativePath)))
    .sort((left, right) => left.localeCompare(right));

  expect(missing).toEqual([]);
});

test('scenario kernel: buildInterfaceResolutionContext is confined to preparation-phase files only', () => {
  const allowedFiles = new Set([
    'product/application/resolution/task.ts',
    'product/application/resolution/interface-resolution.ts',
  ]);
  const files = [...listTsFiles('product'), ...listTsFiles('workshop'), ...listTsFiles('dashboard')];
  const offenders = files
    .filter((filePath) => {
      const rel = relativeFile(filePath);
      if (allowedFiles.has(rel)) return false;
      return fileText(filePath).includes('buildInterfaceResolutionContext');
    })
    .map(relativeFile);

  expect(offenders).toEqual([]);
});

test('scenario kernel: ScenarioRuntimeHandoff type has been fully removed', () => {
  const files = [...listTsFiles('product'), ...listTsFiles('workshop'), ...listTsFiles('dashboard')];
  const offenders = files
    .filter((filePath) => /\bScenarioRuntimeHandoff\b/.test(fileText(filePath)))
    .map(relativeFile);

  expect(offenders).toEqual([]);
});

test('scenario kernel: runtime layer does not import from application/runtime-handoff', () => {
  const offenders = listTsFiles('product/runtime').flatMap((filePath) =>
    importsFor(filePath)
      .filter((specifier) => specifier.includes('runtime-handoff'))
      .map((specifier) => `${relativeFile(filePath)} -> ${specifier}`),
  );

  expect(offenders).toEqual([]);
});

test('scenario kernel: new code should use ScenarioRunPlan not SelectedRunContext for plan data', () => {
  const allowedFiles = new Set([
    'product/application/execution/select-run-context.ts',
    'product/application/run.ts',
    'product/application/emit.ts',
  ]);
  const files = [...listTsFiles('product'), ...listTsFiles('workshop'), ...listTsFiles('dashboard')];
  const offenders = files
    .filter((filePath) => {
      const rel = relativeFile(filePath);
      if (allowedFiles.has(rel)) return false;
      const text = fileText(filePath);
      // Check for accessing old SelectedRunContext fields directly (not through .plan)
      return /selectedContext\.(mode|steps|screenIds|fixtures|resolutionContext|posture|providerId)\b/.test(text);
    })
    .map(relativeFile);

  expect(offenders).toEqual([]);
});

test('operator documentation surfaces are present and linked from the repo entrypoints', () => {
  const expectedPaths = [
    'docs/operator-handbook.md',
  ];
  const missing = expectedPaths
    .filter((relativePath) => !existsSync(path.join(rootDir, relativePath)))
    .sort((left, right) => left.localeCompare(right));

  expect(missing).toEqual([]);
  expect(fileText(path.join(rootDir, 'README.md'))).toContain('docs/operator-handbook.md');
  expect(fileText(path.join(rootDir, 'docs/authoring.md'))).toContain('docs/operator-handbook.md');
});
