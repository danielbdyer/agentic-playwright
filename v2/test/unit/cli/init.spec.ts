/**
 * `init` keeps saved sessions out of git: the storage-state file app.open
 * recommends (.tesseract/auth/<profile>.json) holds live cookies for the QA
 * tenant, while the rest of .tesseract/ (catalog, evidence, receipts) is
 * meant to be committed.
 */
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { main } from '../../../src/cli/main.js';

describe('tesseract-qa init', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'tqa-init-'));
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
  });

  it('gitignores .tesseract/auth/ so storage-state cookies are never committed', async () => {
    expect(await main(['init', '--root', root, '--base-url', 'https://qa.example.com/App'])).toBe(0);
    const gitignore = await readFile(path.join(root, '.gitignore'), 'utf8');
    expect(gitignore.split('\n')).toContain('.tesseract/auth/');

    const git = (...args: string[]) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    expect(git('init', '-q').status).toBe(0);
    await mkdir(path.join(root, '.tesseract', 'auth'), { recursive: true });
    await writeFile(path.join(root, '.tesseract', 'auth', 'qa.json'), '{"cookies":[]}');
    expect(git('check-ignore', '-q', '.tesseract/auth/qa.json').status).toBe(0);
    // The committed parts of .tesseract/ stay tracked.
    expect(git('check-ignore', '-q', '.tesseract/config.json').status).toBe(1);
  });

  it('adds the entry to an existing .gitignore once', async () => {
    await writeFile(path.join(root, '.gitignore'), 'node_modules/\n');
    await main(['init', '--root', root]);
    await main(['init', '--root', root]);
    const lines = (await readFile(path.join(root, '.gitignore'), 'utf8')).split('\n');
    expect(lines.filter((line) => line === '.tesseract/auth/')).toHaveLength(1);
    expect(lines[0]).toBe('node_modules/');
  });
});
