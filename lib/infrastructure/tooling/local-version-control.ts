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

    restoreToHead(paths) {
      return trySync(
        () => {
          for (const p of paths) {
            try {
              execSync(`git checkout HEAD -- ${p}`, { cwd: rootDir, stdio: 'pipe' });
            } catch {
              // Path may not have changes or may not exist in HEAD
            }
          }
        },
        'git-restore-failed',
        `Unable to restore paths to HEAD: ${paths.join(', ')}`,
      );
    },
  };
}
