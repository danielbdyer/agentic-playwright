const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const ROOT_DIR = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT_DIR, 'tsconfig.json');
const DEFAULT_REPORT_PATH = path.join(ROOT_DIR, '.tesseract', 'reports', 'typecheck-report.json');
const DEFAULT_BUILD_INFO_PATH = path.join(ROOT_DIR, '.tesseract', 'cache', 'typecheck.tsbuildinfo');

function host() {
  return {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => ROOT_DIR,
    getNewLine: () => '\n',
  };
}

function parseArgs(argv) {
  const result = {
    pretty: process.stdout.isTTY,
    reportFile: process.env.TESSERACT_TYPECHECK_REPORT_PATH || DEFAULT_REPORT_PATH,
    writeReport: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--pretty') {
      result.pretty = true;
      continue;
    }
    if (arg === '--no-pretty') {
      result.pretty = false;
      continue;
    }
    if (arg === '--no-report') {
      result.writeReport = false;
      continue;
    }
    if (arg === '--report-file') {
      const next = argv[index + 1];
      if (next) {
        result.reportFile = path.resolve(ROOT_DIR, next);
        index += 1;
      }
    }
  }

  return result;
}

function ensureDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function flattenMessage(messageText) {
  return ts.flattenDiagnosticMessageText(messageText, '\n');
}

function serializeDiagnostic(diagnostic) {
  const fileName = diagnostic.file ? path.relative(ROOT_DIR, diagnostic.file.fileName) : null;
  const start = diagnostic.file && typeof diagnostic.start === 'number'
    ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
    : null;
  return {
    code: diagnostic.code,
    category: ts.DiagnosticCategory[diagnostic.category].toLowerCase(),
    message: flattenMessage(diagnostic.messageText),
    file: fileName,
    line: start ? start.line + 1 : null,
    column: start ? start.character + 1 : null,
  };
}

function formatDiagnostics(diagnostics, pretty) {
  if (diagnostics.length === 0) {
    return '';
  }
  return pretty
    ? ts.formatDiagnosticsWithColorAndContext(diagnostics, host())
    : ts.formatDiagnostics(diagnostics, host());
}

function writeReport(reportFile, report) {
  ensureDirectory(reportFile);
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n', 'utf8');
}

function durationMs(startedAt) {
  return Date.now() - startedAt;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const startedAt = Date.now();
  const configFile = ts.readConfigFile(CONFIG_PATH, ts.sys.readFile);
  const configDiagnostics = [];
  if (configFile.error) {
    configDiagnostics.push(configFile.error);
  }

  const parsed = configDiagnostics.length === 0
    ? ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      ROOT_DIR,
      {
        noEmit: true,
        incremental: true,
        tsBuildInfoFile: DEFAULT_BUILD_INFO_PATH,
      },
      CONFIG_PATH,
    )
    : null;

  const diagnostics = [
    ...configDiagnostics,
    ...(parsed ? parsed.errors : []),
  ];

  let semanticDiagnostics = [];
  if (diagnostics.length === 0 && parsed) {
    ensureDirectory(DEFAULT_BUILD_INFO_PATH);
    const builder = ts.createIncrementalProgram({
      rootNames: parsed.fileNames,
      options: parsed.options,
      configFileParsingDiagnostics: parsed.errors,
      projectReferences: parsed.projectReferences,
    });
    semanticDiagnostics = ts.getPreEmitDiagnostics(builder.getProgram());
  }

  const allDiagnostics = [...diagnostics, ...semanticDiagnostics];
  const report = {
    kind: 'typecheck-report',
    version: 1,
    generatedAt: new Date().toISOString(),
    configPath: path.relative(ROOT_DIR, CONFIG_PATH),
    durationMs: durationMs(startedAt),
    success: allDiagnostics.length === 0,
    diagnosticCount: allDiagnostics.length,
    typescriptVersion: ts.version,
    diagnostics: allDiagnostics.map(serializeDiagnostic),
  };

  if (options.writeReport) {
    writeReport(options.reportFile, report);
  }

  if (allDiagnostics.length > 0) {
    process.stderr.write(formatDiagnostics(allDiagnostics, options.pretty));
    process.stderr.write(`typecheck failed (${allDiagnostics.length} diagnostics)`);
    if (options.writeReport) {
      process.stderr.write(` — report: ${path.relative(ROOT_DIR, options.reportFile)}`);
    }
    process.stderr.write('\n');
    process.exitCode = 1;
    return;
  }

  process.stdout.write('typecheck ok');
  if (options.writeReport) {
    process.stdout.write(` — report: ${path.relative(ROOT_DIR, options.reportFile)}`);
  }
  process.stdout.write('\n');
}

main();