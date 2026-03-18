import path from 'path';
import { writeFileSync } from 'fs';
import { computeNormalizedSnapshotHash, normalizeAriaSnapshot } from '../lib/domain/hash';
import { test } from '../dogfood/fixtures/index';
import { captureAriaYaml } from '../lib/runtime/aria';
import { loadScreen } from '../lib/runtime/load';

test('capture requested screen section', async ({ page }, testInfo) => {
  const screenId = process.env.TESSERACT_CAPTURE_SCREEN;
  const sectionId = process.env.TESSERACT_CAPTURE_SECTION;

  if (!screenId || !sectionId) {
    throw new Error('TESSERACT_CAPTURE_SCREEN and TESSERACT_CAPTURE_SECTION are required');
  }

  const loaded = loadScreen(screenId);
  const section = loaded.screen.sections[sectionId];
  if (!section) {
    throw new Error(`Unknown section ${sectionId} on screen ${screenId}`);
  }

  await page.goto(section.url ?? loaded.screen.url);
  const snapshot = await captureAriaYaml(page.locator(section.selector));
  if (!snapshot.ok) {
    throw snapshot.error;
  }

  const normalized = normalizeAriaSnapshot(snapshot.value);
  const hash = computeNormalizedSnapshotHash(snapshot.value);
  const snapshotPath = path.join(process.cwd(), 'knowledge', 'snapshots', screenId, `${sectionId}.yaml`);
  const hashPath = path.join(process.cwd(), 'knowledge', 'snapshots', screenId, `${sectionId}.hash`);

  writeFileSync(snapshotPath, `${normalized}\n`, 'utf8');
  writeFileSync(hashPath, `${hash}\n`, 'utf8');

  testInfo.annotations.push({ type: 'capture-hash', description: hash });
  process.stdout.write(`${JSON.stringify({ snapshotPath, hashPath, hash })}\n`);
});
