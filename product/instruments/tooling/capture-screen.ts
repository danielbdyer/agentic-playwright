import path from 'path';
import { execFile } from 'child_process';
import type { ScreenId } from '../../domain/kernel/identity';
import type { ProjectPaths } from '../../application/paths';
import { tryAsync } from '../../application/effect';

export function captureScreenSection(options: {
  screen: ScreenId;
  section: string;
  paths: ProjectPaths;
}) {
  return tryAsync(
    () =>
      new Promise((resolve, reject) => {
        execFile(
          process.execPath,
          [
            path.join(options.paths.rootDir, 'node_modules', '@playwright', 'test', 'cli.js'),
            'test',
            '--config',
            path.join(options.paths.rootDir, 'playwright.capture.config.ts'),
          ],
          {
            cwd: options.paths.rootDir,
            env: {
              ...process.env,
              TESSERACT_CAPTURE_SCREEN: options.screen,
              TESSERACT_CAPTURE_SECTION: options.section,
            },
          },
          (error) => {
            if (error) {
              reject(error);
              return;
            }

            const snapshotPath = path.join(
              options.paths.knowledgeDir,
              'snapshots',
              options.screen,
              `${options.section}.yaml`,
            );
            const hashPath = path.join(
              options.paths.knowledgeDir,
              'snapshots',
              options.screen,
              `${options.section}.hash`,
            );
            const hash = require('fs').readFileSync(hashPath, 'utf8').trim();
            const snapshot = require('fs').readFileSync(snapshotPath, 'utf8').trim();
            resolve({ snapshotPath, hashPath, hash, snapshot });
          },
        );
      }),
    'capture-command-failed',
    `Unable to capture screen ${options.screen} section ${options.section}`,
  );
}



