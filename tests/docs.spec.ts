import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { expect, test } from '@playwright/test';

const rootDir = process.cwd();

function readFile(...segments: string[]): string {
  return readFileSync(path.join(rootDir, ...segments), 'utf8').replace(/^\uFEFF/, '');
}

test('repo docs describe deterministic auto-approval, supplements, and review artifacts', () => {
  const readme = readFile('README.md');
  const agents = readFile('AGENTS.md');
  const authoring = readFile('docs', 'authoring.md');
  const vision = readFile('VISION.md');
  const backlog = readFile('BACKLOG.md');

  expect(readme).toContain('compiler-derived');
  expect(readme).toContain('intent-only');
  expect(readme).toContain('.tesseract/tasks/{ado_id}.resolution.json');
  expect(readme).toContain('generated/{suite}/{ado_id}.proposals.json');
  expect(readme).toContain('generated/{suite}/{ado_id}.review.md');
  expect(agents).toContain('governance');
  expect(agents).toContain('needs-human');
  expect(agents).toContain('knowledge/screens/{screen}.hints.yaml');
  expect(authoring).toContain('knowledge/patterns/*.yaml');
  expect(authoring).toContain('binding.kind: deferred');
  expect(authoring).toContain('.tesseract/runs/{ado_id}/{run_id}/run.json');
  expect(authoring).toContain('review-gated');
  expect(vision).toContain('DSPy');
  expect(vision).toContain('bottleneck');
  expect(vision).toContain('task packet');
  expect(vision).toContain('run.json');
  expect(backlog).toContain('deterministic compiler core');
  expect(backlog).toContain('offline optimization and evaluation');
});

test('scoped instruction files reflect hints, patterns, generated review artifacts, and docs drift protection', () => {
  const files = [
    ['.github', 'instructions', 'domain.instructions.md'],
    ['.github', 'instructions', 'knowledge.instructions.md'],
    ['.github', 'instructions', 'generated.instructions.md'],
    ['.github', 'instructions', 'tests.instructions.md'],
  ] as const;

  for (const segments of files) {
    expect(existsSync(path.join(rootDir, ...segments))).toBeTruthy();
  }

  expect(readFile('.github', 'instructions', 'domain.instructions.md')).toContain('compiler-derived');
  expect(readFile('.github', 'instructions', 'knowledge.instructions.md')).toContain('knowledge/screens/*.hints.yaml');
  expect(readFile('.github', 'instructions', 'knowledge.instructions.md')).toContain('knowledge/patterns/*.yaml');
  expect(readFile('.github', 'instructions', 'generated.instructions.md')).toContain('review.md');
  expect(readFile('.github', 'instructions', 'tests.instructions.md')).toContain('documentation vocabulary');
});
