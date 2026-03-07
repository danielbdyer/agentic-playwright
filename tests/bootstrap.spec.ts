import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { Effect } from 'effect';
import { expect, test } from '@playwright/test';
import { bootstrapProject } from '../lib/application/bootstrap/service';
import { createBootstrapInput } from '../lib/domain/bootstrap';
import { createProjectPaths } from '../lib/application/paths';
import { AdoSource, FileSystem } from '../lib/application/ports';
import { LocalFileSystem } from '../lib/infrastructure/fs/local-fs';
import { makeLocalAdoSource } from '../lib/infrastructure/ado/local-ado-source';

function runBootstrap(tempRoot: string) {
  const paths = createProjectPaths(tempRoot);
  const program = bootstrapProject({
    paths,
    input: {
      baseUrl: 'https://example.test/policy-search',
      suiteIds: ['10001'],
      authStrategy: 'none',
      crawlBounds: {
        depth: 2,
        hostAllowlist: ['example.test'],
        timeoutMs: 20000,
        pageBudget: 10,
      },
    },
  });

  const wired = Effect.provideService(
    Effect.provideService(program, FileSystem, LocalFileSystem),
    AdoSource,
    makeLocalAdoSource(process.cwd()),
  );

  return Effect.runPromise(wired);
}

test('bootstrap ingress validates value objects and rejects invalid url', () => {
  expect(() =>
    createBootstrapInput({
      baseUrl: 'relative-path',
      suiteIds: ['10001'],
      authStrategy: 'none',
      crawlBounds: {
        depth: 1,
        hostAllowlist: ['example.test'],
        timeoutMs: 1000,
        pageBudget: 1,
      },
    }),
  ).toThrow(/baseUrl/);
});

test('bootstrap emits deterministically ordered artifact list and provenance', async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), 'tesseract-bootstrap-'));

  try {
    const result = await runBootstrap(tempRoot);
    const sorted = [...result.artifacts].sort((left, right) => left.localeCompare(right));
    expect(result.artifacts).toEqual(sorted);

    const provenance = JSON.parse(readFileSync(result.provenancePath, 'utf8')) as {
      artifacts: Array<{ artifactPath: string; sourceHash: string }>;
    };
    expect(provenance.artifacts.map((entry) => entry.artifactPath)).toEqual(sorted);
    expect(provenance.artifacts.every((entry) => entry.sourceHash.startsWith('sha256:'))).toBeTruthy();
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('bootstrap reruns are idempotent for canonical artifact content', async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), 'tesseract-bootstrap-'));

  try {
    const first = await runBootstrap(tempRoot);
    const firstMetadata = readFileSync(first.metadataPath, 'utf8');
    const firstProvenance = readFileSync(first.provenancePath, 'utf8');

    const second = await runBootstrap(tempRoot);
    const secondMetadata = readFileSync(second.metadataPath, 'utf8');
    const secondProvenance = readFileSync(second.provenancePath, 'utf8');

    expect(second.artifacts).toEqual(first.artifacts);
    expect(secondMetadata).toEqual(firstMetadata);
    expect(secondProvenance).toEqual(firstProvenance);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
