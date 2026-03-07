import path from 'path';
import { Effect } from 'effect';
import { AdoId } from '../domain/identity';
import { renderGeneratedSpecModule } from '../domain/spec-codegen';
import { validateBoundScenario } from '../domain/validation';
import { FileSystem } from './ports';
import { boundPath, generatedSpecPath, ProjectPaths } from './paths';
import { trySync } from './effect';

function toPosix(value: string): string {
  return value.replace(/\\/g, '/');
}

function relativeModule(fromFile: string, toFile: string): string {
  const relative = toPosix(path.relative(path.dirname(fromFile), toFile));
  return relative.startsWith('.') ? relative : `./${relative}`;
}

export function emitScenario(options: { adoId: AdoId; paths: ProjectPaths }) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const rawBound = yield* fs.readJson(boundPath(options.paths, options.adoId));
    const boundScenario = yield* trySync(
      () => validateBoundScenario(rawBound),
      'bound-scenario-validation-failed',
      `Bound scenario ${options.adoId} failed validation`,
    );

    const outputPath = generatedSpecPath(options.paths, boundScenario.metadata.suite, boundScenario.source.ado_id);
    const rendered = renderGeneratedSpecModule(boundScenario, {
      imports: {
        fixtures: relativeModule(outputPath, path.join(options.paths.rootDir, 'fixtures', 'index.ts')).replace(/\.ts$/, ''),
        program: relativeModule(outputPath, path.join(options.paths.rootDir, 'lib', 'runtime', 'program.ts')).replace(/\.ts$/, ''),
      },
    });

    yield* fs.writeText(outputPath, rendered.code);
    return {
      outputPath,
      lifecycle: rendered.lifecycle,
    };
  });
}

