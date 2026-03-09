const path = require('path');
const { spawnSync } = require('child_process');

function parseArgs(argv) {
  const options = {
    config: undefined,
    headed: false,
    interpreterMode: undefined,
    passthrough: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--config') {
      options.config = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === '--headed') {
      options.headed = true;
      continue;
    }
    if (token === '--interpreter-mode') {
      options.interpreterMode = argv[index + 1];
      index += 1;
      continue;
    }
    options.passthrough.push(token);
  }

  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const cliPath = path.join(process.cwd(), 'node_modules', '@playwright', 'test', 'cli.js');
  const args = ['test'];

  if (options.config) {
    args.push('--config', options.config);
  }

  args.push(...options.passthrough);

  const environment = { ...process.env };
  if (options.headed) {
    environment.TESSERACT_HEADLESS = '0';
  }
  if (options.interpreterMode) {
    environment.TESSERACT_INTERPRETER_MODE = options.interpreterMode;
  }

  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: process.cwd(),
    env: environment,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  process.exit(result.status === null ? 1 : result.status);
}

main();
