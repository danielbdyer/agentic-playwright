const path = require('path');

process.chdir(path.resolve(__dirname, '..'));

const { FlatESLint } = require('eslint/use-at-your-own-risk');

function parseArgs(argv) {
  const options = {
    fix: false,
    format: process.env.TESSERACT_CHECK === '1' ? 'compact' : 'stylish',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--fix') {
      options.fix = true;
      continue;
    }
    if (token === '--format') {
      const value = argv[index + 1];
      if (value) {
        options.format = value;
      }
      index += 1;
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const eslint = new FlatESLint({
    cwd: process.cwd(),
    fix: options.fix,
  });

  const results = await eslint.lintFiles(['.']);
  if (options.fix) {
    await FlatESLint.outputFixes(results);
  }

  const formatter = await eslint.loadFormatter(options.format);
  const output = formatter.format(results);
  if (output.trim().length > 0) {
    process.stdout.write(`${output}\n`);
  }

  const errorCount = results.reduce((total, result) => total + result.errorCount, 0);
  const warningCount = results.reduce((total, result) => total + result.warningCount, 0);
  if (errorCount > 0 || warningCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
