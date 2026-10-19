/**
 * Generation from the single declaration. The playbook's tool table, the
 * plugin skill (playbook plus front matter), and the README's tool table are
 * all derived from contract/tools.ts. `drift-check` regenerates in memory and
 * fails when a file on disk differs, so the know-how can never disagree with
 * the capability. The MCP registration needs no check: it is built from the
 * declaration at runtime.
 */
import path from 'node:path';
import { readText, writeFileAtomic } from '../core/fsio.js';
import { packageRoot } from '../core/package-root.js';
import { CONTRACT_VERSION, TOOLS, wireName, type ToolDeclaration } from '../contract/tools.js';

const START = '<!-- tesseract:generated:tools:start -->';
const END = '<!-- tesseract:generated:tools:end -->';

const cell = (text: string): string => text.replace(/\|/g, '\\|').replace(/\n/g, ' ');

const hints = (tool: ToolDeclaration): string =>
  [
    tool.readOnly ? 'read-only' : 'writes',
    tool.destructive ? 'acts on the app' : null,
    tool.idempotent ? 'idempotent' : null,
    tool.caller === 'human' ? 'human decision' : null,
  ]
    .filter((h): h is string => h !== null)
    .join(', ');

export const toolTable = (): string => {
  const header = [
    `Contract ${CONTRACT_VERSION}. Generated from \`src/contract/tools.ts\`; do not edit by hand.`,
    '',
    '| Tool | MCP name | Release | What it does | Error families | Nature |',
    '|---|---|---|---|---|---|',
  ];
  const rows = (TOOLS as readonly ToolDeclaration[]).map(
    (tool) =>
      `| \`${tool.name}\` | \`${wireName(tool.name)}\` | ${tool.release} | ${cell(tool.summary)} | ${tool.errorFamilies.join(', ')} | ${hints(tool)} |`,
  );
  return [...header, ...rows].join('\n');
};

/** Replace the generated region between the markers; throws when the markers are missing. */
export const replaceRegion = (document: string, content: string, file: string): string => {
  const start = document.indexOf(START);
  const end = document.indexOf(END);
  if (start < 0 || end < 0 || end < start) {
    throw new Error(`${file} is missing the ${START} … ${END} markers`);
  }
  return `${document.slice(0, start + START.length)}\n${content}\n${document.slice(end)}`;
};

export const SKILL_FRONT_MATTER = [
  '---',
  'name: tesseract-qa',
  'description: Author plain Playwright tests for OutSystems applications from Azure DevOps test cases with the tesseract-qa MCP tools (observe pages, act, assert, keep a facet memory, emit specs and page objects, run them, publish results to ADO test points). Use when asked to automate an ADO test case, write or repair a Playwright test for an OutSystems screen, record a login or precondition flow, check whether page objects still match the app, or publish results to a test plan.',
  '---',
  '',
].join('\n');

export const renderSkill = (playbook: string): string =>
  `${SKILL_FRONT_MATTER}<!-- Generated from PLAYBOOK.md by \`tesseract-qa generate\`; edit the playbook, not this file. -->\n\n${playbook}`;

export interface GeneratedFile {
  readonly file: string;
  readonly expected: string;
  readonly actual: string | null;
}

/** Compute every generated file's expected content. */
export const generatedFiles = async (root: string = packageRoot()): Promise<readonly GeneratedFile[]> => {
  const table = toolTable();
  const playbookPath = path.join(root, 'PLAYBOOK.md');
  const readmePath = path.join(root, 'README.md');
  const skillPath = path.join(root, 'plugin', 'skills', 'tesseract-qa', 'SKILL.md');

  const playbookActual = await readText(playbookPath);
  if (playbookActual === null) throw new Error(`missing ${playbookPath}`);
  const playbookExpected = replaceRegion(playbookActual, table, 'PLAYBOOK.md');

  const readmeActual = await readText(readmePath);
  const files: GeneratedFile[] = [
    { file: playbookPath, expected: playbookExpected, actual: playbookActual },
    { file: skillPath, expected: renderSkill(playbookExpected), actual: await readText(skillPath) },
  ];
  if (readmeActual !== null) {
    files.push({ file: readmePath, expected: replaceRegion(readmeActual, table, 'README.md'), actual: readmeActual });
  }
  return files;
};

export const writeGenerated = async (root?: string): Promise<readonly string[]> => {
  const files = await generatedFiles(root);
  const changed = files.filter((f) => f.expected !== f.actual);
  for (const f of changed) await writeFileAtomic(f.file, f.expected);
  return changed.map((f) => f.file);
};

/** Files whose content on disk differs from what the declaration generates. */
export const driftedFiles = async (root?: string): Promise<readonly string[]> =>
  (await generatedFiles(root)).filter((f) => f.expected !== f.actual).map((f) => f.file);
