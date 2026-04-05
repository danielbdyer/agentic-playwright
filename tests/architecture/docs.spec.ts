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
  const agentContext = readFile('docs', 'agent-context.md');
  const authoring = readFile('docs', 'authoring.md');
  const masterArchitecture = readFile('docs', 'master-architecture.md');
  const operatorHandbook = readFile('docs', 'operator-handbook.md');
  const recursiveImprovement = readFile('docs', 'recursive-self-improvement.md');
  const vision = readFile('VISION.md');
  const backlog = readFile('BACKLOG.md');

  expect(readme).toContain('interface intelligence');
  expect(readme).toContain('agent workbench');
  expect(readme).toContain('compiler-derived');
  expect(readme).toContain('intent-only');
  expect(readme).toContain('.tesseract/tasks/{ado_id}.resolution.json');
  expect(readme).toContain('.tesseract/runs/improvement-loop-ledger.json');
  expect(readme).toContain('.tesseract/benchmarks/{benchmark}/{run_id}.benchmark-improvement.json');
  expect(readme).toContain('generated/{suite}/{ado_id}.proposals.json');
  expect(readme).toContain('generated/{suite}/{ado_id}.review.md');
  expect(agents).toContain('docs/master-architecture.md');
  expect(agents).toContain('governance');
  expect(agents).toContain('interface');
  expect(agents).toContain('intervention');
  expect(agents).toContain('improvement');
  expect(agents).toContain('needs-human');
  expect(agents).toContain('knowledge/screens/{screen}.hints.yaml');
  expect(agentContext).toContain('interface intelligence');
  expect(agentContext).toContain('docs/master-architecture.md');
  expect(authoring).toContain('knowledge/patterns/*.yaml');
  expect(authoring).toContain('tests/fixtures/knowledge/**');
  expect(authoring).toContain('knowledge/patterns/');
  expect(authoring).toContain('certification');
  expect(authoring).toContain('binding.kind: deferred');
  expect(authoring).toContain('.tesseract/runs/{ado_id}/{run_id}/run.json');
  expect(authoring).toContain('uncertified');
  expect(masterArchitecture).toContain('Interface Intelligence');
  expect(masterArchitecture).toContain('Agent Workbench');
  expect(masterArchitecture).toContain('Recursive Improvement');
  expect(masterArchitecture).toContain('Interpretation Surface');
  expect(masterArchitecture).toContain('CanonicalTargetRef');
  expect(masterArchitecture).toContain('StateTransitionGraph');
  expect(masterArchitecture).toContain('2000');
  expect(masterArchitecture).toContain('ScenarioProjectionInput');
  expect(operatorHandbook).toContain('.tesseract/benchmarks/{benchmark}/{run_id}.benchmark-improvement.json');
  expect(operatorHandbook).toContain('.tesseract/benchmarks/{benchmark}/{run_id}.dogfood-run.json');
  expect(recursiveImprovement).toContain('.tesseract/benchmarks/improvement-ledger.json');
  expect(recursiveImprovement).toContain('compatibility projection');
  expect(vision).toContain('DSPy');
  expect(vision).toContain('bottleneck');
  expect(vision).toContain('task packet');
  expect(vision).toContain('run.json');
  expect(backlog).toContain('deterministic compiler core');
  expect(backlog).toContain('offline optimization and evaluation');
});

test('canonical doctrine docs use the architectural spines vocabulary and retire the dragon metaphor', () => {
  const docs = [
    ['README.md'],
    ['AGENTS.md'],
    ['VISION.md'],
    ['BACKLOG.md'],
    ['docs', 'agent-context.md'],
    ['docs', 'master-architecture.md'],
    ['docs', 'domain-ontology.md'],
    ['docs', 'coding-notes.md'],
    ['docs', 'direction.md'],
    ['docs', 'seams-and-invariants.md'],
    ['docs', 'moonshots.md'],
  ] as const;

  const retiredMetaphor = /\bdragons?\b/i;

  for (const segments of docs) {
    const text = readFile(...segments);
    expect(text).toContain('interface');
    expect(text).toContain('intervention');
    expect(text).toContain('improvement');
    expect(retiredMetaphor.test(text)).toBeFalsy();
  }

  expect(readFile('docs', 'master-architecture.md')).toContain('three durable architectural spines');
  expect(readFile('docs', 'domain-ontology.md')).toContain('## The Three Architectural Spines');
  expect(readFile('docs', 'coding-notes.md')).toContain('## The Three Architectural Spines');
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
  expect(readFile('.github', 'instructions', 'knowledge.instructions.md')).toContain('tests/fixtures/');
  expect(readFile('.github', 'instructions', 'generated.instructions.md')).toContain('review.md');
  expect(readFile('.github', 'instructions', 'tests.instructions.md')).toContain('documentation vocabulary');
  expect(existsSync(path.join(rootDir, 'tests', 'fixtures', 'knowledge', 'patterns', 'form-entry.behavior.yaml'))).toBeTruthy();
  expect(existsSync(path.join(rootDir, 'knowledge', 'patterns', 'form-entry.behavior.yaml'))).toBeFalsy();
});
