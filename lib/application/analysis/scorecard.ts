import { projectBenchmarkScorecard } from './benchmark';
import type { ProjectPaths } from '../paths';

export function renderBenchmarkScorecard(options: {
  paths: ProjectPaths;
  benchmarkName: string;
}) {
  return projectBenchmarkScorecard({
    paths: options.paths,
    benchmarkName: options.benchmarkName,
    includeExecution: false,
  });
}
