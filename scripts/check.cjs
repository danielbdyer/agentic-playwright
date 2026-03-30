const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const NODE = process.execPath;

function formatDuration(startTime) {
  const elapsedMs = Date.now() - startTime;
  return `${(elapsedMs / 1000).toFixed(1)}s`;
}

function loadFileScript(filePath, argv = []) {
  const nodeModulesPath = path.join(ROOT_DIR, 'node_modules');
  return [
    "const fs=require('fs')",
    "const path=require('path')",
    "const Module=module.constructor",
    `const file=${JSON.stringify(filePath)}`,
    `const nodeModulesPath=${JSON.stringify(nodeModulesPath)}`,
    "const code=fs.readFileSync(file,'utf8')",
    "const m=new Module(file)",
    "m.filename=file",
    'm.paths=[nodeModulesPath]',
    `process.argv=['node',file${argv.map((value) => `,${JSON.stringify(value)}`).join('')}]`,
    'm._compile(code,file)',
  ].join(';');
}

function runPhase(phase) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    process.stdout.write(`[check] ${phase.name}...\n`);

    const child = spawn(phase.command, phase.args, {
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        TESSERACT_CHECK: '1',
        npm_config_cache: process.env.npm_config_cache ?? path.join(ROOT_DIR, '.npm-cache'),
        ...(phase.env ?? {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      const duration = formatDuration(startTime);
      if (code === 0) {
        process.stdout.write(`[check] ${phase.name} ok (${duration})\n`);
        resolve(undefined);
        return;
      }

      process.stderr.write(`[check] ${phase.name} failed (${duration})\n`);
      if (stdout.trim().length > 0) {
        process.stderr.write(`${stdout.trimEnd()}\n`);
      }
      if (stderr.trim().length > 0) {
        process.stderr.write(`${stderr.trimEnd()}\n`);
      }
      process.exitCode = code ?? 1;
      resolve(undefined);
    });
  });
}

async function main() {
  if (!fs.existsSync(path.join(ROOT_DIR, 'package.json'))) {
    throw new Error('[check] package.json not found');
  }

  const phases = [
    {
      name: 'build',
      command: NODE,
      args: ['-e', loadFileScript(path.join(ROOT_DIR, 'scripts', 'build.cjs'))],
    },
    {
      name: 'typecheck',
      command: NODE,
      args: [
        path.join(ROOT_DIR, 'scripts', 'typecheck.cjs'),
        '--no-pretty',
        '--report-file',
        '.tesseract/reports/check-typecheck-report.json',
      ],
    },
    {
      name: 'lint',
      command: NODE,
      args: ['-e', loadFileScript(path.join(ROOT_DIR, 'scripts', 'lint.cjs'), ['--format', 'compact'])],
    },
    {
      name: 'effect-runners',
      command: NODE,
      args: [path.join(ROOT_DIR, 'scripts', 'check-effect-runners.cjs')],
    },
    {
      name: 'test',
      command: NODE,
      args: ['-e', loadFileScript(path.join(ROOT_DIR, 'node_modules', '@playwright', 'test', 'cli.js'), ['test', '--reporter=line'])],
    },
  ];

  const startTime = Date.now();
  for (const phase of phases) {
    await runPhase(phase);
    if (process.exitCode && process.exitCode !== 0) {
      return;
    }
  }

  process.stdout.write(`[check] all phases passed (${formatDuration(startTime)})\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
