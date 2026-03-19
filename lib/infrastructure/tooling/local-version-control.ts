import { execSync } from 'child_process';
import type { VersionControlPort } from '../../application/ports';
import { trySync } from '../../application/effect';

export function makeLocalVersionControl(rootDir: string): VersionControlPort {
  return {
    currentRevision() {
      return trySync(
        () => execSync('git rev-parse --short HEAD', { cwd: rootDir, encoding: 'utf8' }).trim(),
        'git-revision-failed',
        'Unable to determine current git revision',
      );
    },
  };
}
