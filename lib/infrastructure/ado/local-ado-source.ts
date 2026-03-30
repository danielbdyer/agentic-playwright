import { promises as fs } from 'fs';
import path from 'path';
import { Effect } from 'effect';
import type { AdoSourcePort } from '../../application/ports';
import { createAdoId } from '../../domain/identity';
import { tryFileSystem } from '../../application/effect';
import { RETRY_POLICIES, retryScheduleForTaggedErrors } from '../../application/resilience/schedules';

function stripBom(value: string): string {
  return value.replace(/^\uFEFF/, '');
}

export function makeLocalAdoSource(rootDir: string, suiteRoot?: string): AdoSourcePort {
  const fixturesDir = path.join(suiteRoot ?? rootDir, 'fixtures', 'ado');
  const retryPolicy = RETRY_POLICIES.adoTransient;

  return {
    listSnapshotIds() {
      return tryFileSystem(async () => {
        const entries = await fs.readdir(fixturesDir);
        return entries
          .filter((entry) => entry.endsWith('.json'))
          .map((entry) => createAdoId(path.basename(entry, '.json')))
          .sort((left, right) => left.localeCompare(right));
      }, 'ado-list-failed', 'Unable to list local ADO fixtures', fixturesDir).pipe(
        Effect.retryOrElse(
          retryScheduleForTaggedErrors(retryPolicy, (error) => error._tag === 'FileSystemTransientIoError'),
          (error) => Effect.fail(error),
        ),
      );
    },

    loadSnapshot(adoId) {
      return tryFileSystem(
        async () => JSON.parse(stripBom(await fs.readFile(path.join(fixturesDir, `${adoId}.json`), 'utf8'))),
        'ado-read-failed',
        `Unable to load ADO fixture ${adoId}`,
        path.join(fixturesDir, `${adoId}.json`),
      ).pipe(
        Effect.retryOrElse(
          retryScheduleForTaggedErrors(retryPolicy, (error) => error._tag === 'FileSystemTransientIoError'),
          (error) => Effect.fail(error),
        ),
      );
    },
  };
}

