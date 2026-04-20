const path = require('path');
const ts = require('typescript');
const esbuild = require('esbuild');

const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT_DIR, 'tsconfig.build.json');
const GENERATED_KNOWLEDGE_PATH = path.join(ROOT_DIR, 'product', 'generated', 'tesseract-knowledge.ts');

/**
 * Ensure product/generated/tesseract-knowledge.ts exists so the build can bootstrap.
 * The real generator (via `npm run types`) overwrites this stub with full content.
 * Without this stub, a fresh clone cannot compile because workflow-facade.ts imports it.
 */
function ensureGeneratedKnowledgeStub() {
  if (fs.existsSync(GENERATED_KNOWLEDGE_PATH)) return;
  const dir = path.dirname(GENERATED_KNOWLEDGE_PATH);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(GENERATED_KNOWLEDGE_PATH, [
    '// AUTO-GENERATED bootstrap stub -- overwritten by `npm run types`',
    'export const screenIds = [] as const;',
    'export type ScreenId = string;',
    'export const surfaceIds = {} as const;',
    'export type SurfaceId<S extends ScreenId = ScreenId> = string;',
    'export const elementIds = {} as const;',
    'export type ElementId<S extends ScreenId = ScreenId> = string;',
    'export const widgetSupportedActions = {} as const;',
    'export type WidgetId = string;',
    'export type WidgetSupportedAction<W extends WidgetId = WidgetId> = string;',
    'export const surfaceSupportedActions = {} as const;',
    'export const postureIds = {} as const;',
    'export type ScreenPostureId<S extends ScreenId = ScreenId> = string;',
    'export const snapshotTemplateIds = [] as const;',
    'export type SnapshotTemplateId = string;',
    'export const fixtureIds = [] as const;',
    'export type FixtureId = string;',
    'export const knowledgeIndex = {} as const;',
    '',
  ].join('\n'));
}
const demoHarnessEntries = [
  {
    entry: path.join(ROOT_DIR, 'dogfood', 'fixtures', 'demo-harness', 'src', 'policy-journey.tsx'),
    outfile: path.join(ROOT_DIR, 'dogfood', 'fixtures', 'demo-harness', 'policy-journey.js'),
  },
];

const dashboardEntry = {
  entry: path.join(ROOT_DIR, 'dashboard', 'src', 'app', 'bootstrap.tsx'),
  outfile: path.join(ROOT_DIR, 'dashboard', 'dashboard.js'),
};

function host() {
  return {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => ROOT_DIR,
    getNewLine: () => '\n',
  };
}

function shouldSkipTypeScript(argv) {
  return argv.includes('--demo-harness-only');
}

function runTypeScriptBuild() {
  const configFile = ts.readConfigFile(CONFIG_PATH, ts.sys.readFile);
  if (configFile.error) {
    process.stderr.write(ts.formatDiagnosticsWithColorAndContext([configFile.error], host()));
    process.exitCode = 1;
    return false;
  }

  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, ROOT_DIR, undefined, CONFIG_PATH);
  const diagnostics = [...parsed.errors];
  if (diagnostics.length > 0) {
    process.stderr.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, host()));
    process.exitCode = 1;
    return false;
  }

  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
  });

  const emitResult = program.emit();
  const allDiagnostics = [...ts.getPreEmitDiagnostics(program), ...emitResult.diagnostics];
  if (allDiagnostics.length > 0) {
    process.stderr.write(ts.formatDiagnosticsWithColorAndContext(allDiagnostics, host()));
    process.exitCode = 1;
    return false;
  }

  return true;
}

async function buildTailwindCSS() {
  const { execSync } = require('child_process');
  try {
    execSync(
      `npx @tailwindcss/cli -i dashboard/src/styles/globals.css -o dashboard/styles.css --minify`,
      { cwd: ROOT_DIR, stdio: 'pipe' },
    );
  } catch {
    // Tailwind not available — skip (CSS falls back to index.html inline styles)
    process.stderr.write('tailwind: skipped (not installed or config missing)\n');
  }
}

async function buildDemoHarness() {
  await Promise.all(demoHarnessEntries.map(({ entry, outfile }) =>
    esbuild.build({
      entryPoints: [entry],
      outfile,
      bundle: true,
      format: 'esm',
      jsx: 'automatic',
      minify: false,
      platform: 'browser',
      sourcemap: false,
      target: ['es2020'],
      logLevel: 'silent',
    })));
}

/** Build dashboard with React Compiler via esbuild-plugin-babel.
 *  Falls back to plain esbuild if babel plugin is unavailable. */
async function buildDashboard() {
  const esbuildOptions = {
    entryPoints: [dashboardEntry.entry],
    outfile: dashboardEntry.outfile,
    bundle: true,
    format: 'esm',
    jsx: 'automatic',
    minify: false,
    platform: 'browser',
    sourcemap: false,
    target: ['es2020'],
    logLevel: 'silent',
  };

  let useCompiler = false;
  try {
    require.resolve('babel-plugin-react-compiler');
    require.resolve('@babel/core');
    useCompiler = true;
  } catch { /* React Compiler not installed — skip */ }

  if (useCompiler) {
    const babelCore = require('@babel/core');
    const reactCompilerPlugin = {
      name: 'react-compiler',
      setup(build) {
        build.onLoad({ filter: /dashboard\/src\/.*\.tsx?$/ }, async (args) => {
          const source = await fs.promises.readFile(args.path, 'utf8');
          const result = babelCore.transformSync(source, {
            filename: args.path,
            presets: [['@babel/preset-typescript', { isTSX: true, allExtensions: true }]],
            plugins: [['babel-plugin-react-compiler', {}]],
          });
          return { contents: result.code, loader: 'jsx' };
        });
      },
    };
    await esbuild.build({ ...esbuildOptions, plugins: [reactCompilerPlugin] });
  } else {
    await esbuild.build(esbuildOptions);
  }
}

const { execSync } = require('child_process');

function runManifestDriftCheck() {
  // The drift check is a Node-level TS module under product/build/. Run
  // it via tsx so the CJS build harness can stay free of ESM loaders.
  // Exit non-zero from the check fails the build.
  const args = shouldSkipTypeScript(process.argv.slice(2)) ? ['--allow-additive'] : [];
  try {
    execSync(`npx tsx product/build/emitter/drift-check.ts ${args.join(' ')}`, {
      stdio: 'inherit',
    });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  ensureGeneratedKnowledgeStub();
  if (!runManifestDriftCheck()) {
    process.exitCode = 1;
    return;
  }
  if (!shouldSkipTypeScript(process.argv.slice(2)) && !runTypeScriptBuild()) {
    return;
  }

  await Promise.all([buildDemoHarness(), buildDashboard(), buildTailwindCSS()]);
  process.stdout.write('build ok\n');
}

main().catch((error) => {
  if (error && typeof error === 'object' && 'errors' in error && Array.isArray(error.errors)) {
    for (const entry of error.errors) {
      process.stderr.write(`${entry.text ?? String(entry)}\n`);
    }
    process.exitCode = 1;
    return;
  }

  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
