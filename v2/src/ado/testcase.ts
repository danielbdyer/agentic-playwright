/**
 * From work items to TestCase: pure assembly. fetch.ts does the I/O (which
 * work items, which shared steps, which test points) and hands the results
 * here, so everything about how a case is read is testable without a server.
 */
import { fingerprintOf } from '../core/hash.js';
import type { TestCase, TestStep } from '../contract/schemas.js';
import { asInteger, asText, parseDataSource, parseParameterNames, parseStepsXml, splitTags, unionNames, type StepsNode } from './fields.js';

/** Field reference names read from Azure DevOps. */
export const FIELDS = {
  id: 'System.Id',
  title: 'System.Title',
  rev: 'System.Rev',
  state: 'System.State',
  type: 'System.WorkItemType',
  tags: 'System.Tags',
  areaPath: 'System.AreaPath',
  iterationPath: 'System.IterationPath',
  priority: 'Microsoft.VSTS.Common.Priority',
  steps: 'Microsoft.VSTS.TCM.Steps',
  parameters: 'Microsoft.VSTS.TCM.Parameters',
  dataSource: 'Microsoft.VSTS.TCM.LocalDataSource',
} as const;

export const TEST_CASE_FIELDS: readonly string[] = Object.values(FIELDS);

export const SHARED_STEP_FIELDS: readonly string[] = [FIELDS.id, FIELDS.title, FIELDS.rev, FIELDS.type, FIELDS.steps, FIELDS.parameters];

/** The part of a work item this module reads (the shape of workitemsbatch `value[]`). */
export interface WorkItem {
  readonly id: number;
  readonly rev?: number;
  readonly fields: Readonly<Record<string, unknown>>;
}

export type TestPointRef = NonNullable<TestCase['points']>[number];

export interface SharedStepDefinition {
  readonly id: number;
  readonly revision: number;
  readonly title: string;
  readonly nodes: readonly StepsNode[];
  readonly parameters: readonly string[];
  readonly warnings: readonly string[];
}

export const revisionOf = (item: WorkItem): number => item.rev ?? asInteger(item.fields[FIELDS.rev]) ?? 0;

export const workItemTypeOf = (item: WorkItem): string | undefined => asText(item.fields[FIELDS.type]);

export const parseSharedStep = (item: WorkItem): SharedStepDefinition => {
  const parsed = parseStepsXml(asText(item.fields[FIELDS.steps]));
  return {
    id: item.id,
    revision: revisionOf(item),
    title: asText(item.fields[FIELDS.title]) ?? `Shared steps ${item.id}`,
    nodes: parsed.nodes,
    parameters: parseParameterNames(asText(item.fields[FIELDS.parameters])),
    warnings: parsed.warnings,
  };
};

/** Distinct shared-step work item ids referenced anywhere in a steps tree, in document order. */
export const sharedStepRefsOf = (nodes: readonly StepsNode[]): readonly number[] => {
  const walk = (list: readonly StepsNode[]): readonly number[] =>
    list.flatMap((node) => (node.kind === 'compref' ? [...(node.ref !== null ? [node.ref] : []), ...walk(node.children)] : []));
  return [...new Set(walk(nodes))];
};

type UnindexedStep = Omit<TestStep, 'index'>;

export interface ExpandedSteps {
  readonly steps: readonly TestStep[];
  readonly warnings: readonly string[];
  /** Revision of every shared step that was expanded, keyed by its work item id. */
  readonly sharedStepRevisions: Readonly<Record<string, number>>;
  /** Parameter names declared by the expanded shared steps. */
  readonly sharedParameters: readonly string[];
}

/**
 * Inline shared steps. A `<compref id="C" ref="R">` becomes R's steps, each
 * with stepIdentifier "C;<childStepId>" and sharedStepId R, followed by any
 * parent steps nested inside the compref. Expansion is one level deep, as in
 * ADO: a compref inside a shared step is reported and not followed (its nested
 * steps, which belong to the shared step, are kept). A shared step that could
 * not be fetched (deleted, no access) is reported and contributes no steps.
 *
 * `sharedSteps` maps a ref to its definition, or to null when it was
 * requested and not returned.
 */
export const expandSteps = (
  nodes: readonly StepsNode[],
  sharedSteps: ReadonlyMap<number, SharedStepDefinition | null>,
): ExpandedSteps => {
  const warnings: string[] = [];
  const revisions: Record<string, number> = {};
  const parameterLists: (readonly string[])[] = [];

  const sharedChildren = (shared: SharedStepDefinition, comprefId: string, list: readonly StepsNode[]): readonly UnindexedStep[] =>
    list.flatMap((node): readonly UnindexedStep[] => {
      if (node.kind === 'step') {
        return [{ stepIdentifier: `${comprefId};${node.id}`, action: node.action, expected: node.expected, sharedStepId: shared.id }];
      }
      warnings.push(
        `shared step ${shared.id} itself references shared step ${node.ref ?? '(no ref)'}; nested shared steps are not expanded (Azure DevOps does not allow them)`,
      );
      return sharedChildren(shared, comprefId, node.children);
    });

  const expand = (list: readonly StepsNode[]): readonly UnindexedStep[] =>
    list.flatMap((node): readonly UnindexedStep[] => {
      if (node.kind === 'step') return [{ stepIdentifier: node.id, action: node.action, expected: node.expected }];
      const shared = node.ref === null ? undefined : sharedSteps.get(node.ref);
      const inlined = ((): readonly UnindexedStep[] => {
        if (node.ref === null) return [];
        if (shared === undefined || shared === null) {
          warnings.push(`shared step ${node.ref} (step ${node.id}) could not be fetched (deleted, or no access); its steps are missing`);
          return [];
        }
        revisions[String(shared.id)] = shared.revision;
        parameterLists.push(shared.parameters);
        warnings.push(...shared.warnings.map((warning) => `shared step ${shared.id}: ${warning}`));
        return sharedChildren(shared, node.id, shared.nodes);
      })();
      return [...inlined, ...expand(node.children)];
    });

  const flat = expand(nodes);
  return {
    steps: flat.map((step, position) => ({ ...step, index: position + 1 })),
    warnings: [...new Set(warnings)],
    sharedStepRevisions: revisions,
    sharedParameters: unionNames(parameterLists),
  };
};

export interface ContentHashInput {
  readonly steps: readonly Pick<TestStep, 'stepIdentifier' | 'action' | 'expected'>[];
  readonly parameters: readonly string[];
  readonly dataRows: readonly Readonly<Record<string, string>>[];
  readonly sharedStepRevisions: Readonly<Record<string, number>>;
}

/**
 * The content hash a spec is annotated with and re-authoring is keyed on.
 *
 * Deliberately NOT v1's hash. v1 hashed `{ parameters: [{name, values}],
 * steps: [{action, expected, index, sharedStepId}] }`, with shared steps
 * dropped and parameter values misaligned with rows. Version 2 hashes the
 * expanded steps by stepIdentifier, the parameter names, the data rows, and
 * the revision of every expanded shared step: editing a shared step does not
 * change the parent's System.Rev, and this hash is how the parent notices.
 * Title, tags, priority, state, and the case's own revision are excluded, so
 * the automation association write (which bumps the revision) does not look
 * like an intent change.
 */
export const contentHashOf = (input: ContentHashInput): string =>
  fingerprintOf({
    v: 2,
    steps: input.steps.map((step) => ({ stepIdentifier: step.stepIdentifier, action: step.action, expected: step.expected })),
    parameters: input.parameters,
    dataRows: input.dataRows,
    sharedStepRevisions: input.sharedStepRevisions,
  });

export interface BuildContext {
  /** Every shared step referenced by the case: definition, or null when it could not be fetched. */
  readonly sharedSteps: ReadonlyMap<number, SharedStepDefinition | null>;
  /** Web URL of a work item. */
  readonly webUrl: (id: number) => string;
  /** Test points, when the case was read through a plan/suite. */
  readonly points?: readonly TestPointRef[];
}

/** Build the contract TestCase for one Test Case work item. Pure. */
export const buildTestCase = (item: WorkItem, context: BuildContext): TestCase => {
  const fields = item.fields;
  const parsedSteps = parseStepsXml(asText(fields[FIELDS.steps]));
  const expanded = expandSteps(parsedSteps.nodes, context.sharedSteps);
  const parameters = unionNames([parseParameterNames(asText(fields[FIELDS.parameters])), expanded.sharedParameters]);
  const dataSource = parseDataSource(asText(fields[FIELDS.dataSource]), parameters);
  const warnings = [...parsedSteps.warnings, ...expanded.warnings, ...dataSource.warnings];
  const priority = asInteger(fields[FIELDS.priority]);
  const state = asText(fields[FIELDS.state]);
  const areaPath = asText(fields[FIELDS.areaPath]);
  const iterationPath = asText(fields[FIELDS.iterationPath]);
  return {
    id: String(item.id),
    title: asText(fields[FIELDS.title]) ?? `ADO ${item.id}`,
    revision: revisionOf(item),
    contentHash: contentHashOf({
      steps: expanded.steps,
      parameters,
      dataRows: dataSource.rows,
      sharedStepRevisions: expanded.sharedStepRevisions,
    }),
    ...(state !== undefined ? { state } : {}),
    ...(priority !== undefined ? { priority } : {}),
    ...(areaPath !== undefined ? { areaPath } : {}),
    ...(iterationPath !== undefined ? { iterationPath } : {}),
    tags: [...splitTags(fields[FIELDS.tags])],
    steps: [...expanded.steps],
    parameters: [...parameters],
    dataRows: dataSource.rows.map((row) => ({ ...row })),
    url: context.webUrl(item.id),
    ...(context.points !== undefined ? { points: [...context.points] } : {}),
    ...(warnings.length > 0 ? { warnings } : {}),
  };
};

/** Numeric ids sort numerically ("9999" before "10002"); anything else after, by text. */
export const compareCaseIds = (a: string, b: string): number => {
  const numericA = /^\d+$/.test(a);
  const numericB = /^\d+$/.test(b);
  if (numericA && numericB) return Number(a) - Number(b) || a.localeCompare(b);
  if (numericA !== numericB) return numericA ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
};
