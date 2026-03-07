import YAML from 'yaml';
import { Effect } from 'effect';
import { expandScenarioPostures } from '../domain/posture-expansion';
import { AdoId } from '../domain/identity';
import { validateScenario, validateScenarioTemplateArtifact, validateScreenElements, validateScreenPostures, validateTemplateExpansionContext } from '../domain/validation';
import { walkFiles } from './artifacts';
import { trySync } from './effect';
import { FileSystem } from './ports';
import { elementsPath, expandedScenarioPath, posturesPath, ProjectPaths, relativeProjectPath } from './paths';

function findScenarioPath(adoId: AdoId, files: string[]): string | undefined {
  return files.find((filePath) => filePath.endsWith(`${adoId}.scenario.yaml`));
}

function emptyExpansion(adoId: AdoId, sourceScenarioPath: string) {
  return {
    kind: 'expanded-scenario-set' as const,
    sourceAdoId: adoId,
    sourceScenarioPath,
    generatedAt: new Date().toISOString(),
    variants: [],
    diagnostics: [],
  };
}

export function expandScenarioTemplates(options: { adoId: AdoId; paths: ProjectPaths }) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const scenarioFiles = yield* walkFiles(fs, options.paths.scenariosDir);
    const scenarioFile = findScenarioPath(options.adoId, scenarioFiles);
    const targetPath = expandedScenarioPath(options.paths, options.adoId);

    if (!scenarioFile) {
      const empty = emptyExpansion(options.adoId, '');
      yield* fs.writeJson(targetPath, empty);
      return { expandedPath: targetPath, expandedSet: empty };
    }

    const rawScenario = yield* fs.readText(scenarioFile);
    const scenario = yield* trySync(
      () => validateScenario(YAML.parse(rawScenario)),
      'scenario-validation-failed',
      `Scenario ${options.adoId} failed validation`,
    );

    const templateFiles = (yield* walkFiles(fs, options.paths.scenarioTemplatesDir)).filter((filePath) => filePath.endsWith('.yaml'));
    const matchingTemplates: Array<{ templatePath: string; template: ReturnType<typeof validateScenarioTemplateArtifact> }> = [];

    for (const templateFile of templateFiles) {
      const rawTemplate = yield* fs.readText(templateFile);
      const template = yield* trySync(
        () => validateScenarioTemplateArtifact(YAML.parse(rawTemplate)),
        'scenario-template-validation-failed',
        `Template ${templateFile} failed validation`,
      );
      if (template.scenarioAdoIds.includes(options.adoId)) {
        matchingTemplates.push({ templatePath: templateFile, template });
      }
    }

    if (matchingTemplates.length === 0) {
      const empty = emptyExpansion(options.adoId, relativeProjectPath(options.paths, scenarioFile));
      yield* fs.writeJson(targetPath, empty);
      return { expandedPath: targetPath, expandedSet: empty };
    }

    const targetScreen = scenario.steps.find((step) => step.screen)?.screen;
    if (!targetScreen) {
      const empty = emptyExpansion(options.adoId, relativeProjectPath(options.paths, scenarioFile));
      yield* fs.writeJson(targetPath, empty);
      return { expandedPath: targetPath, expandedSet: empty };
    }

    const rawElements = yield* fs.readText(elementsPath(options.paths, targetScreen));
    const elements = yield* trySync(
      () => validateScreenElements(YAML.parse(rawElements)),
      'elements-validation-failed',
      `Elements for ${targetScreen} failed validation`,
    );

    const rawPostures = yield* fs.readText(posturesPath(options.paths, targetScreen));
    const postures = yield* trySync(
      () => validateScreenPostures(YAML.parse(rawPostures)),
      'postures-validation-failed',
      `Postures for ${targetScreen} failed validation`,
    );

    const generatedAt = new Date().toISOString();
    const expandedSets = matchingTemplates.map((entry) => {
      const scenarioPath = relativeProjectPath(options.paths, scenarioFile);
      const templatePath = relativeProjectPath(options.paths, entry.templatePath);
      const expanded = expandScenarioPostures({
        scenario,
        scenarioPath,
        template: entry.template,
        templatePath,
        screenElements: elements,
        screenPostures: postures,
        generatedAt,
      });
      const diagnostics = validateTemplateExpansionContext({
        template: entry.template,
        scenario,
        scenarioPath,
        templatePath,
        elements,
        postures,
      });
      return {
        ...expanded,
        diagnostics: [...expanded.diagnostics, ...diagnostics],
      };
    });

    const merged = {
      kind: 'expanded-scenario-set' as const,
      sourceAdoId: scenario.source.ado_id,
      sourceScenarioPath: relativeProjectPath(options.paths, scenarioFile),
      generatedAt,
      variants: expandedSets.flatMap((set) => set.variants).sort((left, right) => left.id.localeCompare(right.id)),
      diagnostics: expandedSets.flatMap((set) => set.diagnostics),
    };

    yield* fs.writeJson(targetPath, merged);
    return { expandedPath: targetPath, expandedSet: merged };
  });
}
