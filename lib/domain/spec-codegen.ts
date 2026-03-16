import * as ts from 'typescript';
import type { GroundedFlowStep, GroundedSpecFlow } from './types';
import type { ScenarioLifecycle } from './types/workflow';
import { deriveMethodName, deduplicateMethodNames } from './method-name';
import {
  awaitExpression,
  callExpression,
  constStatement,
  expressionFromLiteral,
  identifier,
  importDeclaration,
  objectBindingPattern,
  printModule,
  property,
  statementFromExpression,
  stringLiteral,
} from './ts-ast';

export interface ReadableSpecImports {
  readonly fixtures: string;
  readonly scenarioContext: string;
}

export interface ReadableSpecModuleOptions {
  readonly imports: ReadableSpecImports;
}

/** @deprecated Use ReadableSpecImports. Alias for migration. */
export type GeneratedSpecImports = ReadableSpecImports;

/** @deprecated Use ReadableSpecModuleOptions. Alias for migration. */
export type GeneratedSpecModuleOptions = ReadableSpecModuleOptions;

function titleWithTags(title: string, tags: ReadonlyArray<string>): string {
  return tags.length === 0
    ? title
    : `${title} ${tags.map((tag) => `@${tag}`).join(' ')}`;
}

function annotationStatements(flow: GroundedSpecFlow): ts.Statement[] {
  const { metadata } = flow;
  const deferredSteps = flow.steps.filter((step) => step.bindingKind === 'deferred').map((step) => step.index);
  const unboundSteps = flow.steps.filter((step) => step.bindingKind === 'unbound').map((step) => step.index);
  const confidence = typeof metadata.confidence === 'string' ? metadata.confidence : 'mixed';

  const annotations: Array<{ type: string; description: string }> = [
    { type: 'ado-id', description: metadata.adoId },
    { type: 'ado-revision', description: String(metadata.revision) },
    { type: 'content-hash', description: metadata.contentHash },
    { type: 'confidence', description: confidence },
  ];

  if (deferredSteps.length > 0) {
    annotations.push({ type: 'deferred-steps', description: deferredSteps.join(', ') });
  }
  if (unboundSteps.length > 0) {
    annotations.push({ type: 'unbound-steps', description: unboundSteps.join(', ') });
  }

  return annotations.map((annotation) =>
    statementFromExpression(
      callExpression(property(property(callExpression(property(identifier('test'), 'info'), []), 'annotations'), 'push'), [
        expressionFromLiteral(annotation),
      ]),
    ),
  );
}

function lifecycleStatements(lifecycle: ScenarioLifecycle): ts.Statement[] {
  switch (lifecycle) {
    case 'fixme':
      return [statementFromExpression(callExpression(property(identifier('test'), 'fixme'), []))];
    case 'skip':
      return [statementFromExpression(callExpression(property(identifier('test'), 'skip'), []))];
    case 'fail':
      return [statementFromExpression(callExpression(property(identifier('test'), 'fail'), []))];
    default:
      return [];
  }
}

interface ResolvedScreenMethod {
  readonly screenId: string;
  readonly methodName: string;
  readonly stepIndex: number;
  readonly stepTitle: string;
}

/**
 * Group steps by screen and derive POM-style method names.
 * Steps without a screen are assigned to a synthetic '__global__' screen.
 */
function resolveScreenMethods(steps: ReadonlyArray<GroundedFlowStep>): ReadonlyArray<ResolvedScreenMethod> {
  const rawMethods = steps.map((step) => ({
    screenId: step.screen ?? '__global__',
    methodName: deriveMethodName(step.action, step.element, step.intent),
    stepIndex: step.index,
    stepTitle: step.intent,
  }));

  // Deduplicate per screen
  const byScreen = new Map<string, Array<{ methodName: string; stepIndex: number; originalIndex: number }>>();
  for (let i = 0; i < rawMethods.length; i++) {
    const entry = rawMethods[i]!;
    const list = byScreen.get(entry.screenId) ?? [];
    list.push({ methodName: entry.methodName, stepIndex: entry.stepIndex, originalIndex: i });
    byScreen.set(entry.screenId, list);
  }

  const result: ResolvedScreenMethod[] = new Array(steps.length);
  for (const [screenId, screenMethods] of byScreen) {
    const deduped = deduplicateMethodNames(screenMethods);
    for (let i = 0; i < screenMethods.length; i++) {
      const original = screenMethods[i]!;
      const dedupedName = deduped[i] ?? original.methodName;
      result[original.originalIndex] = {
        screenId,
        methodName: dedupedName,
        stepIndex: original.stepIndex,
        stepTitle: rawMethods[original.originalIndex]!.stepTitle,
      };
    }
  }

  return result;
}

function fixtureSpreadExpression(fixtures: ReadonlyArray<string>): ts.Expression {
  return fixtures.length === 0
    ? ts.factory.createObjectLiteralExpression([], false)
    : ts.factory.createObjectLiteralExpression(
        fixtures.map((fixture) => ts.factory.createShorthandPropertyAssignment(identifier(fixture))),
        true,
      );
}

/**
 * Convert a screen ID like "policy-search" to a camelCase variable name like "policySearch".
 */
function screenVarName(screenId: string): string {
  return screenId === '__global__'
    ? 'scenario'
    : screenId.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Build an inline POM facade object literal for a screen.
 * Each method is an arrow function that delegates to scenario.executeStep(index, title).
 *
 * Emits:
 * ```
 * const policySearch = {
 *   navigate: () => scenario.executeStep(0, "Navigate to Policy Search screen"),
 *   enterPolicyNumber: () => scenario.executeStep(1, "Enter policy number"),
 *   ...
 * };
 * ```
 */
function screenFacadeDeclaration(
  screenId: string,
  methods: ReadonlyArray<ResolvedScreenMethod>,
): ts.Statement {
  const properties = methods.map((m) =>
    ts.factory.createPropertyAssignment(
      identifier(m.methodName),
      ts.factory.createArrowFunction(
        undefined,
        undefined,
        [],
        undefined,
        ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
        callExpression(property(identifier('scenario'), 'executeStep'), [
          ts.factory.createNumericLiteral(m.stepIndex),
          stringLiteral(m.stepTitle),
        ]),
      ),
    ),
  );

  return constStatement(
    screenVarName(screenId),
    ts.factory.createObjectLiteralExpression(properties, true),
  );
}

/**
 * Emit a POM-aligned, QA-legible Playwright spec from a GroundedSpecFlow.
 *
 * The generated spec:
 * - Imports only `test` (from fixtures) and `createScenarioContext` (from scenario-context)
 * - Constructs a single `ScenarioContext` that curries all runtime internals
 * - Builds inline POM facade objects per screen with named methods
 * - Calls named methods on screen objects (e.g., `policySearch.navigate()`)
 * - Never exposes runPlan, runtimeEnvironment, runState, or step indices
 */
export function renderReadableSpecModule(
  flow: GroundedSpecFlow,
  options: ReadableSpecModuleOptions,
): {
  code: string;
  lifecycle: ScenarioLifecycle;
} {
  const { metadata, steps } = flow;
  const fixtures = metadata.fixtures;
  const resolvedMethods = resolveScreenMethods(steps);

  // Collect unique screens in order of first appearance
  const screenOrder: string[] = [];
  const seenScreens = new Set<string>();
  for (const m of resolvedMethods) {
    if (!seenScreens.has(m.screenId)) {
      seenScreens.add(m.screenId);
      screenOrder.push(m.screenId);
    }
  }

  // Group methods by screen for facade generation
  const methodsByScreen = new Map<string, ResolvedScreenMethod[]>();
  for (const m of resolvedMethods) {
    const list = methodsByScreen.get(m.screenId) ?? [];
    list.push(m);
    methodsByScreen.set(m.screenId, list);
  }

  const emitSteps = metadata.lifecycle === 'normal' || metadata.lifecycle === 'fail';

  // Build inline facade declarations for each screen
  const facadeDeclarations: ts.Statement[] = emitSteps
    ? screenOrder
        .filter((s) => s !== '__global__')
        .map((screenId) => screenFacadeDeclaration(screenId, methodsByScreen.get(screenId) ?? []))
    : [];

  // Build the step call statements: await policySearch.navigate()
  const stepStatements: ts.Statement[] = emitSteps
    ? resolvedMethods.map((m) => {
        const target = m.screenId === '__global__'
          ? identifier('scenario')
          : identifier(screenVarName(m.screenId));

        return statementFromExpression(
          awaitExpression(
            callExpression(property(target, m.methodName), []),
          ),
        );
      })
    : [];

  const testBody: ts.Statement[] = [
    ...annotationStatements(flow),
    ...lifecycleStatements(metadata.lifecycle),
    // const scenario = createScenarioContext(page, "adoId", { ...fixtures })
    constStatement(
      'scenario',
      callExpression(identifier('createScenarioContext'), [
        identifier('page'),
        stringLiteral(metadata.adoId),
        fixtureSpreadExpression(fixtures),
      ]),
    ),
    ...facadeDeclarations,
    ...stepStatements,
  ];

  const statements: ts.Statement[] = [
    importDeclaration({ modulePath: options.imports.fixtures, namedImports: ['test'] }),
    importDeclaration({ modulePath: options.imports.scenarioContext, namedImports: ['createScenarioContext'] }),
    statementFromExpression(
      callExpression(identifier('test'), [
        stringLiteral(titleWithTags(metadata.title, metadata.tags)),
        ts.factory.createArrowFunction(
          [ts.factory.createModifier(ts.SyntaxKind.AsyncKeyword)],
          undefined,
          [ts.factory.createParameterDeclaration(undefined, undefined, objectBindingPattern(['page', ...fixtures]))],
          undefined,
          ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
          ts.factory.createBlock(testBody, true),
        ),
      ]),
    ),
  ];

  return {
    code: printModule(statements),
    lifecycle: metadata.lifecycle,
  };
}

/** @deprecated Use renderReadableSpecModule. Kept temporarily for migration. */
export const renderGeneratedSpecModule = renderReadableSpecModule;
