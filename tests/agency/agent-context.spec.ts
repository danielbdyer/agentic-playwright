import { readFileSync } from 'fs';
import path from 'path';
import { expect, test } from '@playwright/test';

const rootDir = process.cwd();

function readAgentContext(): string {
  return readFileSync(path.join(rootDir, 'docs', 'agent-context.md'), 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
}

test('generated agent context advertises the canonical command surface and generation contract', () => {
  const actual = readAgentContext();

  expect(actual).toContain('Generated from `AGENTS.md`, `README.md`, `BACKLOG.md`, and `.github/instructions/`.');
  expect(actual).toContain('Do not hand-edit; run `npm run agent:sync`.');
  expect(actual).toContain('`npm run context`');
  expect(actual).toContain('`npm run refresh`');
  expect(actual).toContain('`npm run trace`');
  expect(actual).toContain('`npm run impact`');
});
