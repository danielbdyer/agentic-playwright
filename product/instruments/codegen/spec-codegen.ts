import * as ts from 'typescript';
import type { GroundedFlowStep, GroundedSpecFlow } from '../../domain/intent/types';
import type { Confidence, ScenarioLifecycle, StepBindingKind } from '../../domain/governance/workflow-types';
import { groupByMap } from '../../domain/kernel/collections';
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

function titleWithTags(title: string, tags: ReadonlyArray<string>): string {
  return tags.length === 0
    ? title
    : `${title} ${tags.map((tag) => `@${tag}`).join(' ')}`;
}

function annotationStatements(flow: GroundedSpecFlow): ReadonlyArray<ts.Statement> {
  const { metadata } = flow;
  const deferredSteps = flow.steps.flatMap((step) => step.bindingKind === 'deferred' ? [step.index] : []);
  const unboundSteps = flow.steps.flatMap((step) => step.bindingKind === 'unbound' ? [step.index] : []);
  const confidence = typeof metadata.confidence === 'string' ? metadata.confidence : 'mixed';

  const baseAnnotations: ReadonlyArray<{ readonly type: string; readonly description: string }> = [
    { type: 'ado-id', description: metadata.adoId },
    { type: 'ado-revision', description: String(metadata.revision) },
    { type: 'content-hash', description: metadata.contentHash },
    { type: 'confidence', description: confidence },
  ];

  const conditionalAnnotations: ReadonlyArray<{ readonly type: string; readonly description: string }> = [
    ...(deferredSteps.length > 0 ? [{ type: 'deferred-steps', description: deferredSteps.join(', ') }] : []),
    ...(unboundSteps.length > 0 ? [{ type: 'unbound-steps', description: unboundSteps.join(', ') }] : []),
  ];

  return [...baseAnnotations, ...conditionalAnnotations].map((annotation) =>
    statementFromExpression(
      callExpression(property(property(callExpression(property(identifier('test'), 'info'), []), 'annotations'), 'push'), [
        expressionFromLiteral(annotation),
      ]),
    ),
  );
}

function lifecycleStatements(lifecycle: ScenarioLifecycle): ReadonlyArray<ts.Statement> {
  const methodName: Record<string, string> = { fixme: 'fixme', skip: 'skip', fail: 'fail' };
  const name = methodName[lifecycle];
  return name
    ? [statementFromExpression(callExpression(property(identifier('test'), name), []))]
    : [];
}

export interface ResolvedScreenMethod {
  readonly screenId: string;
  readonly methodName: string;
  readonly stepIndex: number;
  readonly stepTitle: string;
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
 * Collect unique values from an array by key, preserving first-appearance order.
 */
function uniqueBy<T>(items: ReadonlyArray<T>, keyFn: (item: T) => string): ReadonlyArray<string> {
  return items.reduce<{ readonly keys: ReadonlyArray<string>; readonly seen: ReadonlySet<string> }>(
    (acc, item) => {
      const key = keyFn(item);
      return acc.seen.has(key)
        ? acc
        : { keys: [...acc.keys, key], seen: new Set([...acc.seen, key]) };
    },
    { keys: [], seen: new Set() },
  ).keys;
}

/**
 * Group steps by screen and derive POM-style method names.
 * Steps without a screen are assigned to a synthetic '__global__' screen.
 */
function resolveScreenMethods(steps: ReadonlyArray<GroundedFlowStep>): ReadonlyArray<ResolvedScreenMethod> {
  const rawMethods = steps.map((step, originalIndex) => ({
    screenId: step.screen ?? '__global__',
    methodName: deriveMethodName(step.action, step.element, step.intent),
    stepIndex: step.index,
    stepTitle: step.intent,
    originalIndex,
  }));

  const byScreen = groupByMap(rawMethods, (m) => m.screenId);

  // Deduplicate per screen, then reassemble in original order
  const deduplicatedEntries: ReadonlyArray<{ readonly originalIndex: number; readonly resolved: ResolvedScreenMethod }> =
    [...byScreen.entries()].flatMap(([screenId, screenMethods]) => {
      const deduped = deduplicateMethodNames(screenMethods);
      return screenMethods.map((m, i) => ({
        originalIndex: m.originalIndex,
        resolved: {
          screenId,
          methodName: deduped[i] ?? m.methodName,
          stepIndex: m.stepIndex,
          stepTitle: m.stepTitle,
        },
      }));
    });

  return [...deduplicatedEntries]
    .sort((a, b) => a.originalIndex - b.originalIndex)
    .map((entry) => entry.resolved);
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
 * Build an inline POM facade object literal for a screen.
 * Each method is an arrow function that delegates to scenario.executeStep(index, title).
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

interface StepRenderContext {
  readonly method: ResolvedScreenMethod;
  readonly bindingKind: StepBindingKind;
  readonly confidence: Confidence;
}

function stepMarkerComment(ctx: StepRenderContext): string | null {
  if (ctx.confidence === 'intent-only') return ' [intent-only]';
  if (ctx.bindingKind === 'deferred') return ' [deferred]';
  return null;
}

function stepCallStatement(ctx: StepRenderContext): ts.Statement {
  const target = ctx.method.screenId === '__global__'
    ? identifier('scenario')
    : identifier(screenVarName(ctx.method.screenId));

  const statement = statementFromExpression(
    awaitExpression(
      callExpression(property(target, ctx.method.methodName), []),
    ),
  );

  const marker = stepMarkerComment(ctx);
  return marker
    ? ts.addSyntheticLeadingComment(statement, ts.SyntaxKind.SingleLineCommentTrivia, marker, true)
    : statement;
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
  readonly code: string;
  readonly lifecycle: ScenarioLifecycle;
} {
  const { metadata, steps } = flow;
  const resolvedMethods = resolveScreenMethods(steps);
  const emitSteps = metadata.lifecycle === 'normal' || metadata.lifecycle === 'fail';

  const screenOrder = uniqueBy(resolvedMethods, (m) => m.screenId);
  const methodsByScreen = groupByMap(resolvedMethods, (m) => m.screenId);

  const facadeDeclarations: ReadonlyArray<ts.Statement> = emitSteps
    ? screenOrder
        .flatMap((s) => s !== '__global__' ? [screenFacadeDeclaration(s, methodsByScreen.get(s) ?? [])] : [])
    : [];

  const stepStatements: ReadonlyArray<ts.Statement> = emitSteps
    ? resolvedMethods.map((method, i) => stepCallStatement({
        method,
        bindingKind: steps[i]?.bindingKind ?? 'bound',
        confidence: steps[i]?.confidence ?? 'compiler-derived',
      }))
    : [];

  const testBody: ReadonlyArray<ts.Statement> = [
    ...annotationStatements(flow),
    ...lifecycleStatements(metadata.lifecycle),
    constStatement(
      'scenario',
      callExpression(identifier('createScenarioContext'), [
        identifier('page'),
        stringLiteral(metadata.adoId),
        fixtureSpreadExpression(metadata.fixtures),
      ]),
    ),
    ...facadeDeclarations,
    ...stepStatements,
  ];

  const statements: ReadonlyArray<ts.Statement> = [
    importDeclaration({ modulePath: options.imports.fixtures, namedImports: ['test'] }),
    importDeclaration({ modulePath: options.imports.scenarioContext, namedImports: ['createScenarioContext'] }),
    statementFromExpression(
      callExpression(identifier('test'), [
        stringLiteral(titleWithTags(metadata.title, metadata.tags)),
        ts.factory.createArrowFunction(
          [ts.factory.createModifier(ts.SyntaxKind.AsyncKeyword)],
          undefined,
          [ts.factory.createParameterDeclaration(undefined, undefined, objectBindingPattern(['page', ...metadata.fixtures]))],
          undefined,
          ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
          ts.factory.createBlock([...testBody], true),
        ),
      ]),
    ),
  ];

  return {
    code: printModule([...statements]),
    lifecycle: metadata.lifecycle,
  };
}

// ─── Pre-generated screen facade (v2 §3.2) ───

export interface ScreenFacadeModuleOptions {
  /** The screen identifier the facade is for (e.g. 'policy-search'). */
  readonly screenId: string;
  /** Named methods on this screen, already deduplicated and ordered. */
  readonly methods: ReadonlyArray<ResolvedScreenMethod>;
  /** Relative module path (no .ts extension) that exports
   *  `ScenarioContext` type. Imported by the facade module so method
   *  argument is typed. */
  readonly scenarioContextTypeModule: string;
}

/**
 * Emit a per-screen facade module.
 *
 * Per v2-direction.md §3.2: "The facade switches from runtime-
 * instantiated (via `lib/composition/scenario-context.ts`) to pre-
 * generated per-screen modules regenerated from the facet catalog on
 * every authoring pass."
 *
 * The emitted module exposes ONE factory function per screen. The
 * factory takes a `ScenarioContext` and returns an object with named
 * methods — the same shape the inline facade in `renderReadableSpecModule`
 * produces, but as a standalone importable module. A spec that imports
 * it looks like:
 *
 * ```ts
 * import { policySearch } from './screens/policy-search';
 * const search = policySearch(scenario);
 * await search.navigate();
 * ```
 *
 * The module is QA-legible in a way the inline facade isn't: it names
 * each method on a screen and its step index / title, letting a human
 * reader see the screen's surface without parsing spec file shape.
 *
 * Wiring: this emitter lives alongside `renderReadableSpecModule`.
 * The full emit-pipeline migration from inline facade to pre-generated
 * modules lands when the authoring pass gains facet-catalog-driven
 * regeneration (see Step 7 of the v2 construction order).
 */
export function renderScreenFacadeModule(options: ScreenFacadeModuleOptions): {
  readonly code: string;
  readonly factoryName: string;
} {
  const factoryName = screenVarName(options.screenId);

  const methodProperties = options.methods.map((m) =>
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

  const factoryDeclaration = ts.factory.createVariableStatement(
    [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    ts.factory.createVariableDeclarationList(
      [
        ts.factory.createVariableDeclaration(
          identifier(factoryName),
          undefined,
          undefined,
          ts.factory.createArrowFunction(
            undefined,
            undefined,
            [
              ts.factory.createParameterDeclaration(
                undefined,
                undefined,
                identifier('scenario'),
                undefined,
                ts.factory.createTypeReferenceNode('ScenarioContext', undefined),
              ),
            ],
            undefined,
            ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
            ts.factory.createParenthesizedExpression(
              ts.factory.createObjectLiteralExpression(methodProperties, true),
            ),
          ),
        ),
      ],
      ts.NodeFlags.Const,
    ),
  );

  const statements: ReadonlyArray<ts.Statement> = [
    importDeclaration({
      modulePath: options.scenarioContextTypeModule,
      namedImports: ['ScenarioContext'],
      isTypeOnly: true,
    }),
    factoryDeclaration,
  ];

  return {
    code: printModule([...statements]),
    factoryName,
  };
}

/**
 * Partition a GroundedSpecFlow's steps into per-screen method groups,
 * ready to feed into `renderScreenFacadeModule`. Returns a map keyed
 * by screen ID; the `__global__` bucket (steps without a screen) is
 * omitted since those do not participate in per-screen facades.
 */
export function screenFacadesFromFlow(
  flow: GroundedSpecFlow,
): ReadonlyMap<string, ReadonlyArray<ResolvedScreenMethod>> {
  const methods = resolveScreenMethods(flow.steps);
  const byScreen = groupByMap(methods, (m) => m.screenId);
  const result = new Map<string, ReadonlyArray<ResolvedScreenMethod>>();
  for (const [screenId, screenMethods] of byScreen) {
    if (screenId !== '__global__') {
      result.set(screenId, screenMethods);
    }
  }
  return result;
}
