const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const OUTPUT_FILE = path.join(ROOT_DIR, 'docs', 'module-map.md');

/**
 * Layers in architectural order with their descriptions.
 */
const LAYERS = [
  {
    dir: 'product/domain',
    name: 'Domain',
    summary:
      'Pure, side-effect-free domain logic. No imports from other layers. No filesystem, network, or Effect dependencies.',
  },
  {
    dir: 'product/application',
    name: 'Application',
    summary:
      'Effect-based orchestration layer. CLI commands, execution pipelines, fitness reports, improvement loops, and workspace catalog management.',
  },
  {
    dir: 'product/runtime',
    name: 'Runtime',
    summary:
      'Playwright execution layer. Scenario step execution, agent resolution, screen identification, locator resolution, and ARIA snapshot handling.',
  },
  {
    dir: 'product/instruments',
    name: 'Infrastructure',
    summary:
      'Ports and adapters. File system abstraction, Azure DevOps integration, dashboard event bus, MCP protocol, VSCode integration, and Playwright reporter.',
  },
  {
    dir: 'product/composition',
    name: 'Composition',
    summary:
      'Dependency injection and service wiring. Effect Layer definitions, environment configuration, and service provisioning.',
  },
  {
    dir: 'product/instruments/observation',
    name: 'Playwright',
    summary:
      'Thin Playwright-specific utilities for ARIA capture, locator resolution strategies, and state topology observation.',
  },
];

function normalize(text) {
  return text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
}

function writeText(filePath, content) {
  const nextContent = content.endsWith('\n') ? content : `${content}\n`;
  fs.writeFileSync(filePath, nextContent, 'utf8');
}

/**
 * Recursively collect all .ts files under a directory, returning paths
 * relative to the given base.
 */
function collectTsFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) {
    return results;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsFiles(fullPath));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Extract the first meaningful comment from a TypeScript file.
 * Looks for JSDoc (/** ... * /), line comments (//), or block comments.
 * For multi-line JSDoc, extracts the first non-tag line.
 */
function extractPurpose(filePath) {
  const content = normalize(fs.readFileSync(filePath, 'utf8'));
  const lines = content.split('\n');

  // Try JSDoc block comment first — capture all lines between /** and */
  const jsdocMatch = content.match(/\/\*\*[\s\S]*?\*\//);
  if (jsdocMatch) {
    const block = jsdocMatch[0];
    const docLines = block
      .split('\n')
      .map((line) => line.replace(/^\s*\/?\*+\/?/, '').trim())
      .filter((line) => line.length > 0 && !line.startsWith('@'));
    const text = docLines[0] || '';
    if (text.length > 10 && !text.startsWith('import')) {
      return truncate(text, 120);
    }
  }

  // Try first non-import line comment
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('import ') || trimmed.startsWith('import{') || trimmed === '') {
      continue;
    }
    if (trimmed.startsWith('//')) {
      const text = trimmed.replace(/^\/\/\s*/, '').trim();
      if (
        text.length > 10 &&
        !text.startsWith('eslint') &&
        !text.startsWith('@ts-') &&
        !text.startsWith('istanbul')
      ) {
        return truncate(text, 120);
      }
    }
    // Stop after first non-comment, non-import line
    if (!trimmed.startsWith('/*') && !trimmed.startsWith('*')) {
      break;
    }
  }

  return '';
}

function truncate(text, max) {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 3)}...`;
}

/**
 * Count exported symbols in a file (approximate: counts export keywords).
 */
function countExports(filePath) {
  const content = normalize(fs.readFileSync(filePath, 'utf8'));
  const exportMatches = content.match(/^export\s/gm);
  return exportMatches ? exportMatches.length : 0;
}

/**
 * Get immediate subdirectories of a directory.
 */
function getSubdirectories(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/**
 * Build the module inventory for one layer.
 */
function buildLayerInventory(layerDir) {
  const absDir = path.join(ROOT_DIR, layerDir);
  const allFiles = collectTsFiles(absDir);
  const subdirs = getSubdirectories(absDir);

  // Separate root files from subdirectory files
  const rootFiles = allFiles
    .filter((f) => path.dirname(f) === absDir)
    .map((f) => path.basename(f))
    .sort();

  const subdirInventory = subdirs.map((subdir) => {
    const subdirPath = path.join(absDir, subdir);
    const files = collectTsFiles(subdirPath);
    return {
      name: subdir,
      fileCount: files.length,
      files: files.map((f) => ({
        name: path.relative(subdirPath, f).replace(/\\/g, '/'),
        purpose: extractPurpose(f),
        exports: countExports(f),
      })),
    };
  });

  const rootInventory = rootFiles.map((fileName) => {
    const filePath = path.join(absDir, fileName);
    return {
      name: fileName,
      purpose: extractPurpose(filePath),
      exports: countExports(filePath),
    };
  });

  return {
    totalFiles: allFiles.length,
    rootFiles: rootInventory,
    subdirectories: subdirInventory,
  };
}

/**
 * Render a file entry as a markdown table row.
 */
function renderFileRow(name, purpose, exports) {
  const desc = purpose || '—';
  return `| \`${name}\` | ${desc} | ${exports} |`;
}

/**
 * Generate the full module map document.
 */
function generateModuleMap() {
  const timestamp = new Date().toISOString().split('T')[0];

  const sections = [];

  sections.push('# Module Map');
  sections.push('');
  sections.push(
    `Auto-generated structural inventory of the codebase. Do not hand-edit; run \`npm run map\`.`
  );
  sections.push(`Last generated: ${timestamp}.`);
  sections.push('');
  sections.push(
    'Use this document to locate modules by layer, understand what each file does, and find entry points for common tasks.'
  );
  sections.push('');

  // Summary table
  sections.push('## Layer Overview');
  sections.push('');
  sections.push('| Layer | Directory | Files | Description |');
  sections.push('| --- | --- | --- | --- |');

  const inventories = [];
  let totalFileCount = 0;

  for (const layer of LAYERS) {
    const inventory = buildLayerInventory(layer.dir);
    inventories.push({ layer, inventory });
    totalFileCount += inventory.totalFiles;
    sections.push(
      `| **${layer.name}** | \`${layer.dir}/\` | ${inventory.totalFiles} | ${layer.summary} |`
    );
  }

  sections.push('');
  sections.push(`**Total**: ${totalFileCount} TypeScript modules across ${LAYERS.length} layers.`);
  sections.push('');

  // Dependency rules
  sections.push('## Layer Dependencies');
  sections.push('');
  sections.push('```');
  sections.push('domain ← (no dependencies on other layers)');
  sections.push('application ← domain');
  sections.push('runtime ← domain');
  sections.push('infrastructure ← domain, application');
  sections.push('composition ← domain, application, infrastructure, runtime');
  sections.push('playwright ← (standalone Playwright utilities)');
  sections.push('```');
  sections.push('');

  // Per-layer detail
  for (const { layer, inventory } of inventories) {
    sections.push(`## ${layer.name} Layer — \`${layer.dir}/\``);
    sections.push('');
    sections.push(layer.summary);
    sections.push('');

    // Subdirectory summary
    if (inventory.subdirectories.length > 0) {
      sections.push('### Subdirectories');
      sections.push('');
      sections.push('| Directory | Files | Key Contents |');
      sections.push('| --- | --- | --- |');

      for (const subdir of inventory.subdirectories) {
        const keyFiles = subdir.files
          .slice(0, 3)
          .map((f) => f.name.replace(/\.ts$/, ''))
          .join(', ');
        const ellipsis = subdir.files.length > 3 ? ', …' : '';
        sections.push(`| \`${subdir.name}/\` | ${subdir.fileCount} | ${keyFiles}${ellipsis} |`);
      }
      sections.push('');
    }

    // Root modules
    if (inventory.rootFiles.length > 0) {
      sections.push('### Modules');
      sections.push('');
      sections.push('| File | Purpose | Exports |');
      sections.push('| --- | --- | --- |');

      for (const file of inventory.rootFiles) {
        sections.push(renderFileRow(file.name, file.purpose, file.exports));
      }
      sections.push('');
    }
  }

  // Quick-reference: common tasks
  sections.push('## Quick Reference — Where to Find Things');
  sections.push('');
  sections.push('| Task | Start Here |');
  sections.push('| --- | --- |');
  sections.push(
    '| Understand domain types | `product/domain/types/` (30 type definition files) |'
  );
  sections.push(
    '| Add a CLI command | `product/cli/commands/` + register in `product/cli/registry.ts` |'
  );
  sections.push(
    '| Modify the execution pipeline | `product/application/execution/` (11 files: plan → interpret → execute → evidence → proposals) |'
  );
  sections.push(
    '| Change resolution logic | `product/runtime/agent/` (17 files: strategy registry, resolution stages, candidate lattice) |'
  );
  sections.push(
    '| Add a new screen to knowledge | `dogfood/knowledge/screens/{screen}.elements.yaml` + `.hints.yaml` + `.surface.yaml` |'
  );
  sections.push(
    '| Modify graph derivation | `product/domain/derived-graph.ts` + `product/application/graph.ts` |'
  );
  sections.push(
    '| Change code emission | `product/domain/spec-codegen.ts` + `product/application/emit.ts` |'
  );
  sections.push(
    '| Understand governance | `product/domain/governance/` (4 files) + `product/domain/types/workflow.ts` |'
  );
  sections.push(
    '| Wire new infrastructure | `product/instruments/` (adapter) + `product/composition/layers.ts` (Effect Layer) |'
  );
  sections.push(
    '| Add a validation rule | `product/domain/validation/` (16 files) |'
  );
  sections.push(
    '| Dashboard / visualization | `dashboard/` (React + R3F) + `product/domain/` (flywheel modules) |'
  );
  sections.push('');

  return sections.join('\n');
}

function main(argv) {
  const content = generateModuleMap();

  if (argv.includes('--write')) {
    writeText(OUTPUT_FILE, content);
    process.stdout.write(
      `Updated ${path.relative(ROOT_DIR, OUTPUT_FILE).replace(/\\/g, '/')}\n`
    );
    return;
  }

  if (argv.includes('--check')) {
    const current = fs.existsSync(OUTPUT_FILE)
      ? normalize(fs.readFileSync(OUTPUT_FILE, 'utf8'))
      : '';
    if (current !== content) {
      process.stderr.write('docs/module-map.md is out of date. Run npm run map -- --write\n');
      process.exitCode = 1;
    }
    return;
  }

  process.stdout.write(`${content}\n`);
}

module.exports = {
  ROOT_DIR,
  OUTPUT_FILE,
  generateModuleMap,
};

if (require.main === module) {
  main(process.argv.slice(2));
}
