import * as ts from 'typescript';
import { aggregateConfidence, lifecycleForScenario } from './status';
import type { BoundScenario, ScenarioTaskPacket } from './types';
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

export interface GeneratedSpecImports {
  fixtures: string;
  runtime: string;
  environment: string;
}

export interface GeneratedSpecModuleOptions {
  imports: GeneratedSpecImports;
}

function titleWithTags(title: string, tags: string[]): string {
  if (tags.length === 0) {
    return title;
  }
  return `${title} ${tags.map((tag) => `@${tag}`).join(' ')}`;
}

function fixtureContextExpression(fixtures: string[]): ts.Expression {
  if (fixtures.length === 0) {
    return ts.factory.createObjectLiteralExpression([], false);
  }

  return ts.factory.createObjectLiteralExpression(
    fixtures.map((fixture) => ts.factory.createShorthandPropertyAssignment(identifier(fixture))),
    true,
  );
}

function fixtureReferencePattern(raw: string, fixtures: Set<string>): void {
  const matches = raw.matchAll(/\{\{\s*([A-Za-z0-9_-]+)(?:\.[^}]*)?\s*\}\}/g);
  for (const match of matches) {
    if (match[1]) {
      fixtures.add(match[1]);
    }
  }
}

function fixturesForScenario(boundScenario: BoundScenario, taskPacket: ScenarioTaskPacket): string[] {
  const fixtures = new Set<string>(boundScenario.preconditions.map((precondition) => precondition.fixture));
  for (const step of taskPacket.steps) {
    if (step.explicitResolution?.override) {
      fixtureReferencePattern(step.explicitResolution.override, fixtures);
    }
    for (const screen of step.runtimeKnowledge.screens) {
      for (const element of screen.elements) {
        if (element.defaultValueRef) {
          fixtureReferencePattern(element.defaultValueRef, fixtures);
        }
      }
    }
  }
  return [...fixtures].sort((left, right) => left.localeCompare(right));
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

function annotationStatements(boundScenario: BoundScenario, confidence: string, deferredSteps: number[], unboundSteps: number[]): ts.Statement[] {
  const annotations = [
    { type: 'ado-id', description: boundScenario.source.ado_id },
    { type: 'ado-revision', description: String(boundScenario.source.revision) },
    { type: 'content-hash', description: boundScenario.source.content_hash },
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

function stepStatement(boundScenario: BoundScenario, stepIndex: number, task: ScenarioTaskPacket['steps'][number]): ts.Statement {
  const step = boundScenario.steps[stepIndex];
  return statementFromExpression(
    awaitExpression(
      callExpression(property(identifier('test'), 'step'), [
        stringLiteral(step.intent),
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
                callExpression(identifier('runScenarioStep'), [
                  expressionFromLiteral(task),
                  identifier('runtimeEnvironment'),
                  identifier('runState'),
                  expressionFromLiteral({
                    adoId: boundScenario.source.ado_id,
                    revision: boundScenario.source.revision,
                    contentHash: boundScenario.source.content_hash,
                  }),
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

function lifecycleStatements(lifecycle: 'normal' | 'fixme' | 'skip' | 'fail'): ts.Statement[] {
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

export function renderGeneratedSpecModule(
  boundScenario: BoundScenario,
  taskPacket: ScenarioTaskPacket,
  options: GeneratedSpecModuleOptions,
): {
  code: string;
  lifecycle: 'normal' | 'fixme' | 'skip' | 'fail';
} {
  const hasUnbound = boundScenario.steps.some((step) => step.binding.kind === 'unbound');
  const lifecycle = lifecycleForScenario(boundScenario.metadata.status, hasUnbound);
  const fixtures = fixturesForScenario(boundScenario, taskPacket);
  const uniqueScreens = [...new Set(taskPacket.steps.flatMap((step) => step.runtimeKnowledge.screens.map((screen) => screen.screen)))].sort((left, right) => left.localeCompare(right));
  const confidence = aggregateConfidence(boundScenario.steps.map((step) => step.confidence));
  const deferredSteps = boundScenario.steps.filter((step) => step.binding.kind === 'deferred').map((step) => step.index);
  const unboundSteps = boundScenario.steps.filter((step) => step.binding.kind === 'unbound').map((step) => step.index);

  const statements: ts.Statement[] = [
    importDeclaration({ modulePath: options.imports.fixtures, namedImports: ['test'] }),
    importDeclaration({ modulePath: options.imports.runtime, namedImports: ['createScenarioRunState', 'runScenarioStep'] }),
    importDeclaration({ modulePath: options.imports.environment, namedImports: ['createLocalRuntimeEnvironment'] }),
    statementFromExpression(
      callExpression(identifier('test'), [
        stringLiteral(titleWithTags(boundScenario.metadata.title, boundScenario.metadata.tags)),
        ts.factory.createArrowFunction(
          [ts.factory.createModifier(ts.SyntaxKind.AsyncKeyword)],
          undefined,
          [ts.factory.createParameterDeclaration(undefined, undefined, objectBindingPattern(['page', ...fixtures]))],
          undefined,
          ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
          ts.factory.createBlock(
            [
              ...annotationStatements(boundScenario, confidence, deferredSteps, unboundSteps),
              ...lifecycleStatements(lifecycle),
              constStatement(
                'runtimeEnvironment',
                callExpression(identifier('createLocalRuntimeEnvironment'), [
                  ts.factory.createObjectLiteralExpression([
                    ts.factory.createPropertyAssignment('rootDir', callExpression(property(identifier('process'), 'cwd'), [])),
                    ts.factory.createPropertyAssignment('screenIds', expressionFromLiteral(uniqueScreens)),
                    ts.factory.createPropertyAssignment('fixtures', fixtureContextExpression(fixtures)),
                    ts.factory.createPropertyAssignment('mode', runtimeModeExpression()),
                    ts.factory.createPropertyAssignment('provider', stringLiteral('deterministic-runtime-step-agent')),
                    ts.factory.createPropertyAssignment('page', identifier('page')),
                  ], true),
                ]),
              ),
              constStatement('runState', callExpression(identifier('createScenarioRunState'), [])),
              ...(lifecycle === 'normal' || lifecycle === 'fail'
                ? taskPacket.steps.map((task, index) => stepStatement(boundScenario, index, task))
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
    lifecycle,
  };
}
