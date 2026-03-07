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
  interpreters: string;
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

function stepStatement(step: BoundStep, fixtures: string[], boundScenario: BoundScenario): ts.Statement {
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
              'runtimeResult',
              awaitExpression(
                ts.factory.createConditionalExpression(
                  ts.factory.createBinaryExpression(
                    ts.factory.createPropertyAccessExpression(
                      ts.factory.createPropertyAccessExpression(identifier('process'), 'env'),
                      'TESSERACT_INTERPRETER_MODE',
                    ),
                    ts.factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
                    stringLiteral('playwright'),
                  ),
                  ts.factory.createToken(ts.SyntaxKind.QuestionToken),
                  callExpression(identifier('runStepProgram'), [
                  identifier('page'),
                  identifier('screens'),
                  fixtureContextExpression(fixtures),
                  stepProgramExpression(step.program),
                  expressionFromLiteral({
                    adoId: boundScenario.source.ado_id,
                    stepIndex: step.index,
                    provenance: {
                      sourceRevision: boundScenario.source.revision,
                      contentHash: boundScenario.source.content_hash,
                    },
                  }),
                ]),
                  ts.factory.createToken(ts.SyntaxKind.ColonToken),
                  awaitExpression(
                    callExpression(identifier('runStaticInterpreter'), [
                      ts.factory.createAsExpression(
                        ts.factory.createBinaryExpression(
                          ts.factory.createPropertyAccessExpression(
                            ts.factory.createPropertyAccessExpression(identifier('process'), 'env'),
                            'TESSERACT_INTERPRETER_MODE',
                          ),
                          ts.factory.createToken(ts.SyntaxKind.QuestionQuestionToken),
                          stringLiteral('dry-run'),
                        ),
                        ts.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
                      ),
                      stepProgramExpression(step.program),
                      identifier('screens'),
                      fixtureContextExpression(fixtures),
                      expressionFromLiteral({
                        adoId: boundScenario.source.ado_id,
                        stepIndex: step.index,
                        provenance: {
                          sourceRevision: boundScenario.source.revision,
                          contentHash: boundScenario.source.content_hash,
                        },
                      }),
                    ]),
                  ),
                ),
              ),
            ),
            ts.factory.createIfStatement(
              ts.factory.createPrefixUnaryExpression(
                ts.SyntaxKind.ExclamationToken,
                property(identifier('runtimeResult'), 'ok'),
              ),
              ts.factory.createBlock(
                [
                  statementFromExpression(
                    callExpression(property(property(callExpression(property(identifier('test'), 'info'), []), 'annotations'), 'push'), [
                      ts.factory.createObjectLiteralExpression([
                        ts.factory.createPropertyAssignment('type', stringLiteral('runtime-diagnostic')),
                        ts.factory.createPropertyAssignment(
                          'description',
                          callExpression(property(identifier('JSON'), 'stringify'), [
                            ts.factory.createBinaryExpression(
                              property(identifier('runtimeResult'), 'diagnostic'),
                              ts.factory.createToken(ts.SyntaxKind.QuestionQuestionToken),
                              property(identifier('runtimeResult'), 'error'),
                            ),
                          ]),
                        ),
                      ])
                    ]),
                  ),
                  ts.factory.createThrowStatement(
                    ts.factory.createNewExpression(identifier('Error'), undefined, [
                      ts.factory.createTemplateExpression(ts.factory.createTemplateHead('['), [
                        ts.factory.createTemplateSpan(
                          property(property(identifier('runtimeResult'), 'error'), 'code'),
                          ts.factory.createTemplateMiddle('] '),
                        ),
                        ts.factory.createTemplateSpan(
                          property(property(identifier('runtimeResult'), 'error'), 'message'),
                          ts.factory.createTemplateTail(''),
                        ),
                      ]),
                    ]),
                  ),
                ],
                true,
              ),
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
    importDeclaration({ modulePath: options.imports.interpreters, namedImports: ['runStaticInterpreter'] }),
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
              ...(lifecycle === 'normal' || lifecycle === 'fail' ? boundScenario.steps.map((step) => stepStatement(step, fixtures, boundScenario)) : []),
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
