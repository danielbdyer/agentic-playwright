const path = require('path');
const ts = require('typescript');

const ROOT_DIR = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT_DIR, 'tsconfig.build.json');

function host() {
  return {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => ROOT_DIR,
    getNewLine: () => '\n',
  };
}

function main() {
  const configFile = ts.readConfigFile(CONFIG_PATH, ts.sys.readFile);
  if (configFile.error) {
    process.stderr.write(ts.formatDiagnosticsWithColorAndContext([configFile.error], host()));
    process.exitCode = 1;
    return;
  }

  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, ROOT_DIR, undefined, CONFIG_PATH);
  const diagnostics = [...parsed.errors];
  if (diagnostics.length > 0) {
    process.stderr.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, host()));
    process.exitCode = 1;
    return;
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
    return;
  }

  process.stdout.write('build ok\n');
}

main();
