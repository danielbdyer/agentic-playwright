import { readFileSync } from 'fs';
import path from 'path';
import { expect, test } from '@playwright/test';

const rootDir = process.cwd();

function readModuleMap(): string {
  return readFileSync(path.join(rootDir, 'docs', 'module-map.md'), 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
}

test('generated module map advertises layers, dependency rules, and quick reference', () => {
  const actual = readModuleMap();

  expect(actual).toContain('Do not hand-edit; run `npm run map`.');
  expect(actual).toContain('## Layer Overview');
  expect(actual).toContain('## Layer Dependencies');
  expect(actual).toContain('## Quick Reference');
  expect(actual).toContain('domain ← (no dependencies on other layers)');
  expect(actual).toContain('**Domain**');
  expect(actual).toContain('**Application**');
  expect(actual).toContain('**Runtime**');
  expect(actual).toContain('**Infrastructure**');
  expect(actual).toContain('**Composition**');
  expect(actual).toContain('**Playwright**');
});

test('each lib layer has a README.md with expected structure', () => {
  const layers = ['domain', 'application', 'runtime', 'infrastructure', 'composition'];

  for (const layer of layers) {
    const readmePath = path.join(rootDir, 'lib', layer, 'README.md');
    const content = readFileSync(readmePath, 'utf8');
    expect(content).toContain(`# ${layer.charAt(0).toUpperCase() + layer.slice(1)}`);
    expect(content).toContain('## Entry Points for Common Tasks');
    expect(content.length).toBeGreaterThan(500);
  }
});
