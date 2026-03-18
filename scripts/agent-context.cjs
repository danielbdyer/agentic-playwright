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
  return collectCodeBlockAfterHeading(readme, 'Commands')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(npm(?:\s+run)?\s+[^\s]+)\s+#\s+(.+)$/);
      if (!match) {
        return null;
      }
      return { command: match[1], description: match[2].trim() };
    })
    .filter(Boolean);
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
    'Generated from `AGENTS.md`, `README.md`, `BACKLOG.md`, and `.github/instructions/`. Do not hand-edit; run `npm run agent:sync`.',
    '',
    '## Purpose',
    '',
    collectIntro(readme),
    '',
    '## Fast Start',
    '',
    '- Run `npm run context` to print this brief from live repository sources.',
    '- Use `npm run paths`, `npm run trace`, `npm run impact`, and `npm run surface` before editing scenario-specific files.',
    ...operationalDocs.map((item) => `- ${item}`),
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
