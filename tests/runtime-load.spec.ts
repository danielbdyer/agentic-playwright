import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { expect, test } from '@playwright/test';
import { createProjectPaths } from '../lib/application/paths';
import { inspectSurface } from '../lib/application/surface';
import { runWithLocalServices } from '../lib/composition/local-services';
import { createScreenId } from '../lib/domain/identity';
import { createLocalScreenRegistryLoader } from '../lib/infrastructure/screen-registry/local-screen-registry-loader';

function createWorkspace(
  screenId: string,
  options: {
    includePostures: boolean;
    includeHints?: boolean;
  },
): { root: string; posturesPath: string } {
  const root = mkdtempSync(path.join(tmpdir(), 'tesseract-runtime-load-'));
  const surfacesDir = path.join(root, 'knowledge', 'surfaces');
  const screensDir = path.join(root, 'knowledge', 'screens');
  mkdirSync(surfacesDir, { recursive: true });
  mkdirSync(screensDir, { recursive: true });

  writeFileSync(
    path.join(surfacesDir, `${screenId}.surface.yaml`),
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
    path.join(screensDir, `${screenId}.elements.yaml`),
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

  const posturesPath = path.join(screensDir, `${screenId}.postures.yaml`);
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

  if (options.includeHints) {
    writeFileSync(
      path.join(screensDir, `${screenId}.hints.yaml`),
      `screen: ${screenId}
screenAliases:
  - Runtime Hints
elements:
  input-field:
    aliases:
      - Input Field
    affordance: masked-entry
`,
      'utf8',
    );
  }

  return { root, posturesPath };
}

test('loadScreen succeeds with empty postures when posture knowledge is missing', () => {
  const screenId = `runtime-load-no-postures-${Date.now()}`;
  const workspace = createWorkspace(screenId, { includePostures: false });

  try {
    const loaded = createLocalScreenRegistryLoader(workspace.root).loadScreen(createScreenId(screenId));
    const inputField = loaded.elements['input-field'];

    expect(loaded.screen.screen).toBe(screenId);
    expect(inputField?.surface).toBe('main-surface');
    expect(loaded.postures).toEqual({});
    expect(existsSync(workspace.posturesPath)).toBeFalsy();
  } finally {
    rmSync(workspace.root, { recursive: true, force: true });
  }
});

test('loadScreen validates and returns postures when posture knowledge exists', () => {
  const screenId = `runtime-load-with-postures-${Date.now()}`;
  const workspace = createWorkspace(screenId, { includePostures: true });

  try {
    const loaded = createLocalScreenRegistryLoader(workspace.root).loadScreen(createScreenId(screenId));
    const inputFieldPostures = loaded.postures['input-field'];
    const validPosture = inputFieldPostures?.valid;

    expect(validPosture?.values).toEqual(['abc123']);
    expect(validPosture?.effects).toEqual([]);
  } finally {
    rmSync(workspace.root, { recursive: true, force: true });
  }
});

test('loadScreen overlays screen hint affordances onto element signatures', () => {
  const screenId = `runtime-load-with-hints-${Date.now()}`;
  const workspace = createWorkspace(screenId, { includePostures: false, includeHints: true });

  try {
    const loaded = createLocalScreenRegistryLoader(workspace.root).loadScreen(createScreenId(screenId));
    const inputField = loaded.elements['input-field'];

    expect(inputField?.affordance).toBe('masked-entry');
  } finally {
    rmSync(workspace.root, { recursive: true, force: true });
  }
});

test('runtime loader and application surface inspection share the same screen bundle view', async () => {
  const screenId = `runtime-load-parity-${Date.now()}`;
  const workspace = createWorkspace(screenId, { includePostures: true, includeHints: true });
  const screen = createScreenId(screenId);

  try {
    const loaded = createLocalScreenRegistryLoader(workspace.root).loadScreen(screen);
    const inspected = await runWithLocalServices(
      inspectSurface({ screen, paths: createProjectPaths(workspace.root) }),
      workspace.root,
    );

    expect(loaded.surfaces).toEqual(inspected.screenBundle.surfaceGraph.surfaces);
    expect(loaded.elements).toEqual(inspected.screenBundle.mergedElements);
    expect(loaded.postures).toEqual(inspected.screenBundle.postures?.postures ?? {});
  } finally {
    rmSync(workspace.root, { recursive: true, force: true });
  }
});
