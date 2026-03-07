const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const NODE = process.execPath;

function formatDuration(startTime) {
  const elapsedMs = Date.now() - startTime;
  return `${(elapsedMs / 1000).toFixed(1)}s`;
}

function resolveLocalModule(relativePath) {
  return path.join(ROOT_DIR, relativePath);
}

function ensureFileExists(filePath, phaseName) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`[check] missing executable for ${phaseName}: ${path.relative(ROOT_DIR, filePath)}`);
  }
}

function runPhase(phase) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const commandPath = phase.args[0];

    if (phase.command === NODE && typeof commandPath === 'string') {
      ensureFileExists(commandPath, phase.name);
    }

    process.stdout.write(`[check] ${phase.name}...\n`);

    const child = spawn(phase.command, phase.args, {
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        TESSERACT_CHECK: '1',
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
  const phases = [
    {
      name: 'build',
      command: NODE,
      args: [resolveLocalModule('node_modules/typescript/bin/tsc'), '-p', 'tsconfig.build.json', '--pretty', 'false'],
    },
    {
      name: 'typecheck',
      command: NODE,
      args: [resolveLocalModule('node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json', '--noEmit', '--pretty', 'false'],
    },
    {
      name: 'lint',
      command: NODE,
      args: [resolveLocalModule('node_modules/eslint/bin/eslint.js'), '.', '--max-warnings', '0', '--format', 'compact'],
    },
    {
      name: 'test',
      command: NODE,
      args: [resolveLocalModule('node_modules/@playwright/test/cli.js'), 'test', '--reporter=line'],
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