import * as ts from 'typescript';
import {
  asConst,
  conditionalByScreen,
  constStatement,
  expressionFromLiteral,
  printModule,
  typeAliasStatement,
  unionOfStringLiterals,
} from './ts-ast';

export interface GeneratedKnowledgeInput {
  screens: readonly string[];
  surfaces: Readonly<Record<string, readonly string[]>>;
  surfaceActions: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>>;
  elements: Readonly<Record<string, readonly string[]>>;
  widgetActions: Readonly<Record<string, readonly string[]>>;
  postures: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>>;
  snapshots: readonly string[];
  fixtures: readonly string[];
}

function typeParameterScreenId(): ts.TypeParameterDeclaration {
  return ts.factory.createTypeParameterDeclaration(
    undefined,
    'S',
    ts.factory.createTypeReferenceNode('ScreenId'),
    ts.factory.createTypeReferenceNode('ScreenId'),
  );
}

function screenCases(input: GeneratedKnowledgeInput, selector: (screen: string) => readonly string[]): Array<{ screen: string; values: readonly string[] }> {
  return input.screens.map((screen) => ({
    screen,
    values: selector(screen),
  }));
}

function postureValuesForScreen(input: GeneratedKnowledgeInput, screen: string): string[] {
  const registry = input.postures[screen] ?? {};
  return [...new Set(Object.values(registry).flat())].sort((left, right) => left.localeCompare(right));
}

export function renderGeneratedKnowledgeModule(input: GeneratedKnowledgeInput): string {
  const statements: ts.Statement[] = [
    constStatement('screenIds', asConst(expressionFromLiteral(input.screens)), true),
    typeAliasStatement('ScreenId', unionOfStringLiterals(input.screens), { exported: true }),
    constStatement('surfaceIds', asConst(expressionFromLiteral(input.surfaces)), true),
    typeAliasStatement(
      'SurfaceId',
      conditionalByScreen('S', screenCases(input, (screen) => input.surfaces[screen] ?? [])),
      { exported: true, parameters: [typeParameterScreenId()] },
    ),
    constStatement('elementIds', asConst(expressionFromLiteral(input.elements)), true),
    typeAliasStatement(
      'ElementId',
      conditionalByScreen('S', screenCases(input, (screen) => input.elements[screen] ?? [])),
      { exported: true, parameters: [typeParameterScreenId()] },
    ),
    constStatement('widgetSupportedActions', asConst(expressionFromLiteral(input.widgetActions)), true),
    typeAliasStatement(
      'WidgetId',
      unionOfStringLiterals(Object.keys(input.widgetActions).sort((left, right) => left.localeCompare(right))),
      { exported: true },
    ),
    typeAliasStatement('WidgetSupportedAction', ts.factory.createIndexedAccessTypeNode(
      ts.factory.createIndexedAccessTypeNode(
        ts.factory.createTypeQueryNode(ts.factory.createIdentifier('widgetSupportedActions')),
        ts.factory.createTypeReferenceNode('W'),
      ),
      ts.factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword),
    ), {
      exported: true,
      parameters: [
        ts.factory.createTypeParameterDeclaration(
          undefined,
          'W',
          ts.factory.createTypeReferenceNode('WidgetId'),
          ts.factory.createTypeReferenceNode('WidgetId'),
        ),
      ],
    }),
    constStatement('surfaceSupportedActions', asConst(expressionFromLiteral(input.surfaceActions)), true),
    constStatement('postureIds', asConst(expressionFromLiteral(input.postures)), true),
    typeAliasStatement(
      'ScreenPostureId',
      conditionalByScreen('S', screenCases(input, (screen) => postureValuesForScreen(input, screen))),
      { exported: true, parameters: [typeParameterScreenId()] },
    ),
    constStatement('snapshotTemplateIds', asConst(expressionFromLiteral(input.snapshots)), true),
    typeAliasStatement('SnapshotTemplateId', unionOfStringLiterals(input.snapshots), { exported: true }),
    constStatement('fixtureIds', asConst(expressionFromLiteral(input.fixtures)), true),
    typeAliasStatement('FixtureId', unionOfStringLiterals(input.fixtures), { exported: true }),
    constStatement(
      'knowledgeIndex',
      asConst(
        expressionFromLiteral(
          Object.fromEntries(
            input.screens.map((screen) => [
              screen,
              {
                surfaces: input.surfaces[screen] ?? [],
                surfaceActions: input.surfaceActions[screen] ?? {},
                elements: input.elements[screen] ?? [],
                postures: input.postures[screen] ?? {},
              },
            ]),
          ),
        ),
      ),
      true,
    ),
  ];

  return printModule(statements);
}
