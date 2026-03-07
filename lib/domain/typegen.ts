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
  screens: string[];
  surfaces: Record<string, string[]>;
  elements: Record<string, string[]>;
  postures: Record<string, Record<string, string[]>>;
  snapshots: string[];
  fixtures: string[];
}

function typeParameterScreenId(): ts.TypeParameterDeclaration {
  return ts.factory.createTypeParameterDeclaration(
    undefined,
    'S',
    ts.factory.createTypeReferenceNode('ScreenId'),
    ts.factory.createTypeReferenceNode('ScreenId'),
  );
}

function screenCases(input: GeneratedKnowledgeInput, selector: (screen: string) => string[]): Array<{ screen: string; values: string[] }> {
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
