import { promises as fs } from 'fs';
import path from 'path';
import { AdoSourcePort } from '../../application/ports';
import { createAdoId } from '../../domain/identity';
import { tryAsync } from '../../application/effect';

function stripBom(value: string): string {
  return value.replace(/^\uFEFF/, '');
}

export function makeLocalAdoSource(rootDir: string): AdoSourcePort {
  const fixturesDir = path.join(rootDir, 'fixtures', 'ado');

  return {
    listSnapshotIds() {
      return tryAsync(async () => {
        const entries = await fs.readdir(fixturesDir);
        return entries
          .filter((entry) => entry.endsWith('.json'))
          .map((entry) => createAdoId(path.basename(entry, '.json')))
          .sort((left, right) => left.localeCompare(right));
      }, 'ado-list-failed', 'Unable to list local ADO fixtures');
    },

    loadSnapshot(adoId) {
      return tryAsync(
        async () => JSON.parse(stripBom(await fs.readFile(path.join(fixturesDir, `${adoId}.json`), 'utf8'))),
        'ado-read-failed',
        `Unable to load ADO fixture ${adoId}`,
      );
    },
  };
}


