const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const OUTPUT_FILE = path.join(ROOT_DIR, 'docs', 'agent-context.md');

function normalize(text) {
  return text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
}

function readText(relativePath) {
  return normalize(fs.readFileSync(path.join(ROOT_DIR, relativePath), 'utf8'));
}

function writeText(filePath, content) {
  const nextContent = content.endsWith('\n') ? content : `${content}\n`;
  fs.writeFileSync(filePath, nextContent, 'utf8');
}

function collectBulletsAfterLine(markdown, marker) {
  const lines = markdown.split('\n');
  const markerIndex = lines.findIndex((line) => line.trim() === marker);
  if (markerIndex === -1) {
    throw new Error(`Could not find marker: ${marker}`);
  }

  const bullets = [];
  let sawBullet = false;

  for (let index = markerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line.startsWith('## ')) {
      break;
    }
    if (line.startsWith('- ')) {
      bullets.push(line.slice(2).trim());
      sawBullet = true;
      continue;
    }
    if (sawBullet && line.length === 0) {
      break;
    }
  }

  return bullets;
}

function collectCodeBlockAfterHeading(markdown, heading) {
  const headingMarker = `## ${heading}`;
  const headingIndex = markdown.indexOf(headingMarker);
  if (headingIndex === -1) {
    throw new Error(`Could not find heading: ${heading}`);
  }

  const afterHeading = markdown.slice(headingIndex + headingMarker.length);
  const fenceStart = afterHeading.indexOf('```');
  if (fenceStart === -1) {
    throw new Error(`Could not find code block for heading: ${heading}`);
  }

  const afterFence = afterHeading.slice(fenceStart + 3);
  const firstNewline = afterFence.indexOf('\n');
  if (firstNewline === -1) {
    throw new Error(`Malformed code block for heading: ${heading}`);
  }

  const body = afterFence.slice(firstNewline + 1);
  const fenceEnd = body.indexOf('\n```');
  if (fenceEnd === -1) {
    throw new Error(`Could not find closing code fence for heading: ${heading}`);
  }

  return body.slice(0, fenceEnd).trim();
}

function collectCommands(readme) {
  // Collect commands from ALL code blocks under ## Commands (not just the first)
  const headingMarker = '## Commands';
  const headingIndex = readme.indexOf(headingMarker);
  if (headingIndex === -1) {
    throw new Error('Could not find heading: Commands');
  }

  const afterHeading = readme.slice(headingIndex + headingMarker.length);
  // Stop at the next ## heading
  const nextSectionMatch = afterHeading.match(/\n## [^#]/);
  const section = nextSectionMatch ? afterHeading.slice(0, nextSectionMatch.index) : afterHeading;

  const commands = [];
  const fenceRegex = /```\w*\n([\s\S]*?)```/g;
  let match;
  while ((match = fenceRegex.exec(section)) !== null) {
    const block = match[1];
    for (const line of block.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const cmdMatch = trimmed.match(/^(npm(?:\s+run)?\s+[^\s]+)\s+#\s+(.+)$/);
      if (cmdMatch) {
        commands.push({ command: cmdMatch[1], description: cmdMatch[2].trim() });
      }
    }
  }
  return commands;
}

function collectIntro(markdown) {
  const sections = markdown.split('\n## ');
  const preface = sections[0] || '';
  const lines = preface.split('\n').slice(1).join('\n').trim();
  return lines;
}

function collectLayerRules(readme) {
  return collectBulletsAfterLine(readme, 'Boundary rules enforced by tests:');
}

function collectScopedGuidance() {
  const instructionsDir = path.join(ROOT_DIR, '.github', 'instructions');
  if (!fs.existsSync(instructionsDir)) {
    return [];
  }

  return fs.readdirSync(instructionsDir)
    .filter((fileName) => fileName.endsWith('.instructions.md'))
    .sort((left, right) => left.localeCompare(right))
    .map((fileName) => {
      const relativePath = path.posix.join('.github/instructions', fileName);
      const content = normalize(fs.readFileSync(path.join(instructionsDir, fileName), 'utf8'));
      const scopeMatch = content.match(/^applyTo:\s*"([^"]+)"/m);
      return {
        scope: scopeMatch ? scopeMatch[1] : 'unspecified',
        file: relativePath,
      };
    });
}

function collectPriorities(backlog, limit = 4) {
  return [...backlog.matchAll(/^###\s+\d+\.\s+(.+)$/gm)]
    .map((match) => match[1].trim())
    .filter((title) => !title.includes('DONE'))
    .slice(0, limit);
}

function renderTable(headers, rows) {
  const lines = [
    `| ${headers[0]} | ${headers[1]} |`,
    '| --- | --- |',
  ];

  for (const [left, right] of rows) {
    lines.push(`| ${left} | ${right} |`);
  }

  return lines.join('\n');
}

/**
 * Count .ts files (excluding .d.ts) under a directory recursively.
 */
function countTsFiles(dir) {
  const absDir = path.join(ROOT_DIR, dir);
  if (!fs.existsSync(absDir)) {
    return 0;
  }

  const entries = fs.readdirSync(absDir, { withFileTypes: true });
  return entries.reduce((sum, entry) => {
    const full = path.join(absDir, entry.name);
    if (entry.isDirectory()) {
      return sum + countTsFiles(path.relative(ROOT_DIR, full));
    }
    if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      return sum + 1;
    }
    return sum;
  }, 0);
}

/**
 * Build the codebase structure overview section.
 */
function buildStructureOverview() {
  const layers = [
    { dir: 'product/domain', name: 'Domain', desc: 'Pure domain logic — types, validation, graph derivation, code generation' },
    { dir: 'product/application', name: 'Application', desc: 'Effect orchestration — CLI commands, execution pipelines, fitness, improvement' },
    { dir: 'product/runtime', name: 'Runtime', desc: 'Playwright execution — scenario steps, agent resolution, screen identification' },
    { dir: 'product/instruments', name: 'Infrastructure', desc: 'Ports and adapters — ADO, filesystem, dashboard, MCP, VSCode' },
    { dir: 'product/composition', name: 'Composition', desc: 'Dependency injection — Effect Layers, service wiring' },
    { dir: 'product/instruments/observation', name: 'Playwright', desc: 'ARIA capture, locator resolution, state topology' },
  ];

  const rows = layers.map(({ dir, name, desc }) => {
    const files = countTsFiles(dir);
    return [name, `\`${dir}/\``, String(files), desc];
  });

  const total = rows.reduce((sum, row) => sum + Number(row[2]), 0);

  const lines = [
    '| Layer | Directory | Files | Description |',
    '| --- | --- | --- | --- |',
    ...rows.map(([name, dir, files, desc]) => `| **${name}** | ${dir} | ${files} | ${desc} |`),
    '',
    `**Total**: ${total} TypeScript modules across ${layers.length} layers.`,
    '',
    'Each layer has a `README.md` with detailed module inventory and entry points.',
    'Run `npm run map` for the full auto-generated module map, or see [`docs/module-map.md`](module-map.md).',
  ];

  return lines;
}

function generateAgentContext() {
  const agents = readText('AGENTS.md');
  const readme = readText('README.md');
  const backlog = readText('BACKLOG.md');
  const operationalDocs = collectBulletsAfterLine(agents, 'Read the doc that matches your task:')
    .filter((item) => !item.includes('docs/agent-context.md'));
  const canonicalInputs = collectBulletsAfterLine(readme, 'Approved, reviewable inputs:');
  const derivedOutputs = collectBulletsAfterLine(readme, 'Derived outputs. Do not hand-edit:');
  const commands = collectCommands(readme);
  const scopedGuidance = collectScopedGuidance();
  const layerRules = collectLayerRules(readme);
  const priorities = collectPriorities(backlog);
  const adapterRequiredEnv = collectBulletsAfterLine(readme, 'Required live env vars:');
  const adapterOptionalEnv = collectBulletsAfterLine(readme, 'Optional live filters:');

  const lines = [
    '# Agent Context',
    '',
    '> Auto-generated — run `npm run agent:sync` to refresh. Skip if you already read AGENTS.md.',
    '',
    'Generated from `AGENTS.md`, `README.md`, `BACKLOG.md`, and `.github/instructions/`. Do not hand-edit; run `npm run agent:sync`.',
    '',
    '## Purpose',
    '',
    collectIntro(readme),
    '',
    '## Fast Start',
    '',
    '- Run `npm run context` to print this brief from live repository sources.',
    '- Run `npm run map` to print the full module map from live repository sources.',
    '- Use `npm run paths`, `npm run trace`, `npm run impact`, and `npm run surface` before editing scenario-specific files.',
    ...operationalDocs.map((item) => `- ${item}`),
    '',
    '## Codebase Structure',
    '',
    ...buildStructureOverview(),
    '',
    '## Canonical Inputs',
    '',
    ...canonicalInputs.map((item) => `- ${item}`),
    '',
    '## Derived Outputs',
    '',
    ...derivedOutputs.map((item) => `- ${item}`),
    '',
    '## Command Surface',
    '',
    ...commands.map(({ command, description }) => `- \`${command}\` - ${description}`),
    '',
    '## ADO Adapter Selection',
    '',
    '- Default adapter: fixture (`dogfood/fixtures/ado/*.json`).',
    '- Live adapter: set `--ado-source live` or `TESSERACT_ADO_SOURCE=live`.',
    ...adapterRequiredEnv.length > 0
      ? [
          '',
          'Required env vars:',
          ...adapterRequiredEnv.map((item) => `- ${item}`),
        ]
      : [],
    ...adapterOptionalEnv.length > 0
      ? [
          '',
          'Optional env vars:',
          ...adapterOptionalEnv.map((item) => `- ${item}`),
        ]
      : [],
    '',
    '## Scoped Guidance',
    '',
    renderTable(['Scope', 'File'], scopedGuidance.map(({ scope, file }) => [scope, `\`${file}\``])),
    '',
    '## Layer Rules',
    '',
    ...layerRules.map((rule) => `- ${rule}`),
    '',
    '## Current Priorities',
    '',
    ...priorities.map((priority, index) => `${index + 1}. ${priority}`),
    '',
  ];

  return lines.join('\n');
}

function main(argv) {
  const content = generateAgentContext();

  if (argv.includes('--write')) {
    writeText(OUTPUT_FILE, content);
    process.stdout.write(`Updated ${path.relative(ROOT_DIR, OUTPUT_FILE).replace(/\\/g, '/')}\n`);
    return;
  }

  if (argv.includes('--check')) {
    const current = fs.existsSync(OUTPUT_FILE) ? normalize(fs.readFileSync(OUTPUT_FILE, 'utf8')) : '';
    if (current !== content) {
      process.stderr.write('docs/agent-context.md is out of date. Run npm run agent:sync\n');
      process.exitCode = 1;
    }
    return;
  }

  process.stdout.write(`${content}\n`);
}

module.exports = {
  ROOT_DIR,
  OUTPUT_FILE,
  generateAgentContext,
};

if (require.main === module) {
  main(process.argv.slice(2));
}
