import * as ts from 'typescript';
import { aggregateConfidence, lifecycleForScenario } from './status';
import { BoundScenario, BoundStep, StepProgram } from './types';
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
  program: string;
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

function annotationStatements(boundScenario: BoundScenario, confidence: string, unboundSteps: number[]): ts.Statement[] {
  const annotations = [
    { type: 'ado-id', description: boundScenario.source.ado_id },
    { type: 'ado-revision', description: String(boundScenario.source.revision) },
    { type: 'content-hash', description: boundScenario.source.content_hash },
    { type: 'confidence', description: confidence },
  ];

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

function stepProgramExpression(program: StepProgram | undefined): ts.Expression {
  return expressionFromLiteral(program ?? { kind: 'step-program', instructions: [{ kind: 'custom-escape-hatch', reason: 'missing-program' }] });
}

function stepStatement(step: BoundStep, fixtures: string[]): ts.Statement {
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
            statementFromExpression(
              awaitExpression(
                callExpression(identifier('runStepProgram'), [
                  identifier('page'),
                  identifier('screens'),
                  fixtureContextExpression(fixtures),
                  stepProgramExpression(step.program),
                ]),
              ),
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

export function renderGeneratedSpecModule(boundScenario: BoundScenario, options: GeneratedSpecModuleOptions): {
  code: string;
  lifecycle: 'normal' | 'fixme' | 'skip' | 'fail';
} {
  const hasUnbound = boundScenario.steps.some((step) => step.binding.kind === 'unbound');
  const lifecycle = lifecycleForScenario(boundScenario.metadata.status, hasUnbound);
  const fixtures = boundScenario.preconditions.map((precondition) => precondition.fixture);
  const uniqueScreens = [...new Set(boundScenario.steps.map((step) => step.screen).filter(Boolean) as string[])].sort((left, right) => left.localeCompare(right));
  const confidence = aggregateConfidence(boundScenario.steps.map((step) => step.confidence));
  const unboundSteps = boundScenario.steps.filter((step) => step.binding.kind === 'unbound').map((step) => step.index);

  const statements: ts.Statement[] = [
    importDeclaration({ modulePath: options.imports.fixtures, namedImports: ['test'] }),
    importDeclaration({ modulePath: options.imports.program, namedImports: ['loadScreenRegistry', 'runStepProgram'] }),
    constStatement('screens', callExpression(identifier('loadScreenRegistry'), [expressionFromLiteral(uniqueScreens)])),
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
              ...annotationStatements(boundScenario, confidence, unboundSteps),
              ...lifecycleStatements(lifecycle),
              ...(lifecycle === 'normal' || lifecycle === 'fail' ? boundScenario.steps.map((step) => stepStatement(step, fixtures)) : []),
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
