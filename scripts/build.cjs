const path = require('path');
const ts = require('typescript');
const esbuild = require('esbuild');

const ROOT_DIR = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT_DIR, 'tsconfig.build.json');
const demoHarnessEntries = [
  {
    entry: path.join(ROOT_DIR, 'fixtures', 'demo-harness', 'src', 'policy-journey.tsx'),
    outfile: path.join(ROOT_DIR, 'fixtures', 'demo-harness', 'policy-journey.js'),
  },
];

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

async function buildDemoHarness() {
  await Promise.all(demoHarnessEntries.map(({ entry, outfile }) =>
    esbuild.build({
      entryPoints: [entry],
      outfile,
      bundle: true,
      format: 'iife',
      jsx: 'automatic',
      minify: false,
      platform: 'browser',
      sourcemap: false,
      target: ['es2020'],
      logLevel: 'silent',
    })));
}

async function main() {
  if (!shouldSkipTypeScript(process.argv.slice(2)) && !runTypeScriptBuild()) {
    return;
  }

  await buildDemoHarness();
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
