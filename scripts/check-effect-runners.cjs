const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const LIB_DIR = path.join(ROOT_DIR, 'lib');

const ALLOWED_FILES = new Set([
  'application/agent-interpreter-provider.ts',
  'infrastructure/mcp/dashboard-mcp-server.ts',
  'runtime/agent/mcp-bridge.ts',
]);

function walkTs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkTs(fullPath);
    if (!entry.isFile()) return [];
    return /\.ts$/.test(entry.name) ? [fullPath] : [];
  });
}

function isAllowed(relativePath) {
  return relativePath.startsWith('composition/') || ALLOWED_FILES.has(relativePath);
}

function main() {
  const violations = walkTs(LIB_DIR).flatMap((file) => {
    const content = fs.readFileSync(file, 'utf8');
    if (!/Effect\.runPromise|Effect\.runSync/.test(content)) return [];
    const relativePath = path.relative(LIB_DIR, file).replace(/\\/g, '/');
    return isAllowed(relativePath)
      ? []
      : [`${relativePath}: Effect.runPromise / Effect.runSync must remain in product/composition (or approved adapters).`];
  });

  if (violations.length > 0) {
    process.stderr.write('[effect-runners] boundary violations detected:\n');
    process.stderr.write(`${violations.join('\n')}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write('[effect-runners] ok\n');
}

main();
