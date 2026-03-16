import * as ts from 'typescript';
import type { GroundedFlowStep, GroundedSpecFlow } from './types';
import type { ScenarioLifecycle } from './types/workflow';
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
  readonly readableHelpers: string;
  readonly scenario: string;
  readonly execution: string;
  readonly environment: string;
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

function fixtureContextExpression(fixtures: ReadonlyArray<string>): ts.Expression {
  return fixtures.length === 0
    ? ts.factory.createObjectLiteralExpression([], false)
    : ts.factory.createObjectLiteralExpression(
        fixtures.map((fixture) => ts.factory.createShorthandPropertyAssignment(identifier(fixture))),
        true,
      );
}

function runtimeModeExpression(): ts.Expression {
  return ts.factory.createAsExpression(
    ts.factory.createBinaryExpression(
      ts.factory.createPropertyAccessExpression(
        ts.factory.createPropertyAccessExpression(identifier('process'), 'env'),
        'TESSERACT_INTERPRETER_MODE',
      ),
      ts.factory.createToken(ts.SyntaxKind.QuestionQuestionToken),
      stringLiteral('dry-run'),
    ),
    ts.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
  );
}

function runtimeWriteModeExpression(): ts.Expression {
  return ts.factory.createAsExpression(
    ts.factory.createBinaryExpression(
      ts.factory.createPropertyAccessExpression(
        ts.factory.createPropertyAccessExpression(identifier('process'), 'env'),
        'TESSERACT_WRITE_MODE',
      ),
      ts.factory.createToken(ts.SyntaxKind.QuestionQuestionToken),
      stringLiteral('persist'),
    ),
    ts.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
  );
}

function runtimeHeadedExpression(): ts.Expression {
  return ts.factory.createBinaryExpression(
    ts.factory.createPropertyAccessExpression(
      ts.factory.createPropertyAccessExpression(identifier('process'), 'env'),
      'TESSERACT_HEADLESS',
    ),
    ts.factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
    stringLiteral('0'),
  );
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

function helperNameForAction(step: GroundedFlowStep): string {
  switch (step.action) {
    case 'navigate': return 'navigateTo';
    case 'input': return 'fillField';
    case 'click': return 'clickElement';
    case 'assert-snapshot': return 'expectSnapshot';
    case 'custom': return 'executeStep';
  }
}

function readableHelperImports(steps: ReadonlyArray<GroundedFlowStep>): string[] {
  const helpers = new Set(steps.map(helperNameForAction));
  return [...helpers].sort((left, right) => left.localeCompare(right));
}

function stepComment(step: GroundedFlowStep): string {
  const parts: string[] = [];
  if (step.screen) parts.push(`screen: ${step.screen}`);
  if (step.element) parts.push(`element: ${step.element}`);
  if (step.dataValue) parts.push(`data: ${step.dataValue}`);
  return parts.length > 0 ? ` [${parts.join(', ')}]` : '';
}

function failureConditionExpression(): ts.Expression {
  return ts.factory.createBinaryExpression(
    ts.factory.createBinaryExpression(
      property(property(identifier('stepResult'), 'interpretation'), 'kind'),
      ts.factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
      stringLiteral('needs-human'),
    ),
    ts.factory.createToken(ts.SyntaxKind.BarBarToken),
    ts.factory.createBinaryExpression(
      property(property(property(identifier('stepResult'), 'execution'), 'execution'), 'status'),
      ts.factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
      stringLiteral('failed'),
    ),
  );
}

function readableStepStatement(step: GroundedFlowStep, zeroBasedIndex: number): ts.Statement {
  const helperName = helperNameForAction(step);
  const comment = stepComment(step);
  const stepTitle = `${step.intent}${comment}`;

  return statementFromExpression(
    awaitExpression(
      callExpression(property(identifier('test'), 'step'), [
        stringLiteral(stepTitle),
        ts.factory.createArrowFunction(
          [ts.factory.createModifier(ts.SyntaxKind.AsyncKeyword)],
          undefined,
          [],
          undefined,
          ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
          ts.factory.createBlock([
            constStatement(
              'stepResult',
              awaitExpression(
                callExpression(identifier(helperName), [
                  identifier('runtimeEnvironment'),
                  identifier('runState'),
                  identifier('runPlan'),
                  ts.factory.createNumericLiteral(zeroBasedIndex),
                ]),
              ),
            ),
            statementFromExpression(
              callExpression(property(property(callExpression(property(identifier('test'), 'info'), []), 'annotations'), 'push'), [
                ts.factory.createObjectLiteralExpression([
                  ts.factory.createPropertyAssignment('type', stringLiteral('runtime-receipt')),
                  ts.factory.createPropertyAssignment(
                    'description',
                    callExpression(property(identifier('JSON'), 'stringify'), [
                      identifier('stepResult'),
                    ]),
                  ),
                ]),
              ]),
            ),
            ts.factory.createIfStatement(
              failureConditionExpression(),
              ts.factory.createBlock([
                ts.factory.createThrowStatement(
                  ts.factory.createNewExpression(identifier('Error'), undefined, [
                    stringLiteral(`Step ${step.index} requires operator attention or failed execution`),
                  ]),
                ),
              ], true),
              undefined,
            ),
          ], true),
        ),
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

export function renderReadableSpecModule(
  flow: GroundedSpecFlow,
  options: ReadableSpecModuleOptions,
): {
  code: string;
  lifecycle: ScenarioLifecycle;
} {
  const { metadata, steps } = flow;
  const helperImports = readableHelperImports(steps);
  const fixtures = metadata.fixtures;

  const statements: ts.Statement[] = [
    importDeclaration({ modulePath: options.imports.fixtures, namedImports: ['test'] }),
    importDeclaration({ modulePath: options.imports.readableHelpers, namedImports: helperImports }),
    importDeclaration({ modulePath: options.imports.scenario, namedImports: ['createScenarioRunState'] }),
    importDeclaration({ modulePath: options.imports.execution, namedImports: ['loadScenarioRunPlan'] }),
    importDeclaration({ modulePath: options.imports.environment, namedImports: ['createLocalRuntimeEnvironment'] }),
    statementFromExpression(
      callExpression(identifier('test'), [
        stringLiteral(titleWithTags(metadata.title, metadata.tags)),
        ts.factory.createArrowFunction(
          [ts.factory.createModifier(ts.SyntaxKind.AsyncKeyword)],
          undefined,
          [ts.factory.createParameterDeclaration(undefined, undefined, objectBindingPattern(['page', ...fixtures]))],
          undefined,
          ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
          ts.factory.createBlock(
            [
              ...annotationStatements(flow),
              ...lifecycleStatements(metadata.lifecycle),
              constStatement(
                'runPlan',
                callExpression(identifier('loadScenarioRunPlan'), [
                  ts.factory.createObjectLiteralExpression([
                    ts.factory.createPropertyAssignment('rootDir', callExpression(property(identifier('process'), 'cwd'), [])),
                    ts.factory.createPropertyAssignment('adoId', stringLiteral(metadata.adoId)),
                    ts.factory.createPropertyAssignment(
                      'executionContextPosture',
                      ts.factory.createObjectLiteralExpression([
                        ts.factory.createPropertyAssignment('interpreterMode', runtimeModeExpression()),
                        ts.factory.createPropertyAssignment('writeMode', runtimeWriteModeExpression()),
                        ts.factory.createPropertyAssignment('headed', runtimeHeadedExpression()),
                        ts.factory.createPropertyAssignment('executionProfile', stringLiteral('interactive')),
                      ], true),
                    ),
                    ts.factory.createPropertyAssignment('interpreterMode', runtimeModeExpression()),
                  ], true),
                ]),
              ),
              constStatement(
                'runtimeEnvironment',
                callExpression(identifier('createLocalRuntimeEnvironment'), [
                  ts.factory.createObjectLiteralExpression([
                    ts.factory.createPropertyAssignment('rootDir', callExpression(property(identifier('process'), 'cwd'), [])),
                    ts.factory.createPropertyAssignment('screenIds', property(identifier('runPlan'), 'screenIds')),
                    ts.factory.createPropertyAssignment(
                      'fixtures',
                      ts.factory.createObjectLiteralExpression([
                        ts.factory.createSpreadAssignment(property(identifier('runPlan'), 'fixtures')),
                        ts.factory.createSpreadAssignment(fixtureContextExpression(fixtures)),
                      ], true),
                    ),
                    ts.factory.createPropertyAssignment('mode', runtimeModeExpression()),
                    ts.factory.createPropertyAssignment('provider', property(identifier('runPlan'), 'providerId')),
                    ts.factory.createPropertyAssignment(
                      'posture',
                      ts.factory.createObjectLiteralExpression(
                        [
                          ts.factory.createSpreadAssignment(property(identifier('runPlan'), 'posture')),
                          ts.factory.createPropertyAssignment('interpreterMode', runtimeModeExpression()),
                          ts.factory.createPropertyAssignment('writeMode', runtimeWriteModeExpression()),
                          ts.factory.createPropertyAssignment('headed', runtimeHeadedExpression()),
                        ],
                        true,
                      ),
                    ),
                    ts.factory.createPropertyAssignment('controlSelection', property(identifier('runPlan'), 'controlSelection')),
                    ts.factory.createPropertyAssignment('page', identifier('page')),
                  ], true),
                ]),
              ),
              constStatement('runState', callExpression(identifier('createScenarioRunState'), [])),
              ...(metadata.lifecycle === 'normal' || metadata.lifecycle === 'fail'
                ? steps.map((step, index) => readableStepStatement(step, index))
                : []),
            ],
            true,
          ),
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
