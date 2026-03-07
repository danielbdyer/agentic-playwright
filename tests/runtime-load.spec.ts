import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import { expect, test } from '@playwright/test';
import { createScreenId } from '../lib/domain/identity';
import { loadScreen } from '../lib/runtime/load';

function writeScreenKnowledge(
  screenId: string,
  options: {
    includePostures: boolean;
  },
): { surfacePath: string; elementsPath: string; posturesPath: string } {
  const root = process.cwd();
  const surfacesDir = path.join(root, 'knowledge', 'surfaces');
  const screensDir = path.join(root, 'knowledge', 'screens');
  mkdirSync(surfacesDir, { recursive: true });
  mkdirSync(screensDir, { recursive: true });

  const surfacePath = path.join(surfacesDir, `${screenId}.surface.yaml`);
  const elementsPath = path.join(screensDir, `${screenId}.elements.yaml`);
  const posturesPath = path.join(screensDir, `${screenId}.postures.yaml`);

  writeFileSync(
    surfacePath,
    `screen: ${screenId}
url: /${screenId}.html
sections:
  main:
    selector: '#main'
    kind: form
    surfaces:
      - main-surface
surfaces:
  main-surface:
    kind: form
    section: main
    selector: '#main'
    parents: []
    children: []
    elements:
      - input-field
    assertions:
      - state
    required: true
`,
    'utf8',
  );

  writeFileSync(
    elementsPath,
    `screen: ${screenId}
url: /${screenId}.html
elements:
  input-field:
    role: textbox
    name: Input Field
    testId: input-field
    surface: main-surface
    widget: os-input
    required: true
`,
    'utf8',
  );

  if (options.includePostures) {
    writeFileSync(
      posturesPath,
      `screen: ${screenId}
postures:
  input-field:
    valid:
      values:
        - abc123
      effects: []
`,
      'utf8',
    );
  }

  return { surfacePath, elementsPath, posturesPath };
}

test('loadScreen succeeds with empty postures when posture knowledge is missing', () => {
  const screenId = `runtime-load-no-postures-${Date.now()}`;
  const { surfacePath, elementsPath, posturesPath } = writeScreenKnowledge(screenId, { includePostures: false });

  try {
    const loaded = loadScreen(createScreenId(screenId));

    expect(loaded.screen.screen).toBe(screenId);
    expect(loaded.elements['input-field'].surface).toBe('main-surface');
    expect(loaded.postures).toEqual({});
    expect(existsSync(posturesPath)).toBeFalsy();
  } finally {
    rmSync(surfacePath, { force: true });
    rmSync(elementsPath, { force: true });
  }
});

test('loadScreen validates and returns postures when posture knowledge exists', () => {
  const screenId = `runtime-load-with-postures-${Date.now()}`;
  const { surfacePath, elementsPath, posturesPath } = writeScreenKnowledge(screenId, { includePostures: true });

  try {
    const loaded = loadScreen(createScreenId(screenId));

    expect(loaded.postures['input-field'].valid.values).toEqual(['abc123']);
    expect(loaded.postures['input-field'].valid.effects).toEqual([]);
  } finally {
    rmSync(surfacePath, { force: true });
    rmSync(elementsPath, { force: true });
    rmSync(posturesPath, { force: true });
  }
});
