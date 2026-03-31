import { expect, test } from '@playwright/test';
import { Effect } from 'effect';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { createProjectPaths } from '../lib/application/paths';
import { createAdoId, createScreenId } from '../lib/domain/identity';
import { LocalFileSystem } from '../lib/infrastructure/fs/local-fs';
import {
  makeLocalExecutionRepository,
  makeLocalKnowledgeRepository,
  makeLocalResolutionTaskRepository,
} from '../lib/infrastructure/repositories/local-context-repositories';

test('resolution task repository persists deterministically and round-trips packet payloads', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tesseract-resolution-repo-'));
  try {
    const paths = createProjectPaths(rootDir, rootDir);
    const repository = makeLocalResolutionTaskRepository(paths, LocalFileSystem);
    const packet = {
      kind: 'scenario-interpretation-surface',
      version: 1,
      fingerprints: { artifact: 'abc123' },
    };

    await Effect.runPromise(repository.writeTaskPacket(createAdoId('10001'), packet));

    const reloaded = await Effect.runPromise(repository.readTaskPacket(createAdoId('10001')));
    const persistedText = await Effect.runPromise(LocalFileSystem.readText(path.join(paths.resolution.tasksDir, '10001.resolution.json')));

    expect(reloaded).toEqual(packet);
    expect(persistedText).toContain('"artifact": "abc123"');
  } finally {
    await fs.rm(rootDir, { recursive: true, force: true });
  }
});

test('knowledge repository encapsulates YAML serialization and maps missing files to FileSystemError', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tesseract-knowledge-repo-'));
  try {
    const paths = createProjectPaths(rootDir, rootDir);
    const repository = makeLocalKnowledgeRepository(paths, LocalFileSystem);

    await Effect.runPromise(repository.writeScreenElements(createScreenId('policy-search'), {
      screen: 'policy-search',
      elements: { searchButton: { role: 'button', name: 'Search' } },
    }));

    const elements = await Effect.runPromise(repository.readScreenElements(createScreenId('policy-search')));
    expect(elements).toEqual({
      screen: 'policy-search',
      elements: { searchButton: { role: 'button', name: 'Search' } },
    });

    const missingRead = await Effect.runPromise(Effect.either(repository.readScreenHints(createScreenId('missing-screen'))));
    expect('left' in missingRead).toBe(true);
    if (!('left' in missingRead)) {
      throw new Error('expected a left error result for missing hints file');
    }
    expect(missingRead.left).toMatchObject({ _tag: 'FileSystemError' });
  } finally {
    await fs.rm(rootDir, { recursive: true, force: true });
  }
});

test('execution repository writes run artifacts to deterministic context-specific paths', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tesseract-execution-repo-'));
  try {
    const paths = createProjectPaths(rootDir, rootDir);
    const repository = makeLocalExecutionRepository(paths, LocalFileSystem);
    const written = await Effect.runPromise(repository.writeRunArtifacts({
      adoId: createAdoId('10001'),
      runId: 'run-01',
      suite: 'demo',
      interpretation: { ok: true },
      execution: { pass: 1 },
      resolutionGraph: { nodes: [] },
      runRecord: { status: 'passed' },
      proposalBundle: { proposals: [] },
    }));

    expect(written.interpretationPath).toBe(path.join(paths.execution.runsDir, '10001', 'run-01', 'interpretation.json'));
    expect(written.proposalsPath).toBe(path.join(paths.governance.generatedDir, 'demo', '10001.proposals.json'));

    const runRecord = await Effect.runPromise(LocalFileSystem.readJson(written.runPath));
    expect(runRecord).toEqual({ status: 'passed' });
  } finally {
    await fs.rm(rootDir, { recursive: true, force: true });
  }
});
