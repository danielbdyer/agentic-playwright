import path from 'path';
import type { ScreenId } from '../../domain/identity';
import type { ProjectPaths } from './types';
import { resolvePathWithinRoot } from './shared';

export function elementsPath(paths: ProjectPaths, screen: ScreenId): string {
  return path.join(paths.knowledge.knowledgeDir, 'screens', `${screen}.elements.yaml`);
}

export function posturesPath(paths: ProjectPaths, screen: ScreenId): string {
  return path.join(paths.knowledge.knowledgeDir, 'screens', `${screen}.postures.yaml`);
}

export function hintsPath(paths: ProjectPaths, screen: ScreenId): string {
  return path.join(paths.knowledge.knowledgeDir, 'screens', `${screen}.hints.yaml`);
}

export function behaviorPath(paths: ProjectPaths, screen: ScreenId): string {
  return path.join(paths.knowledge.knowledgeDir, 'screens', `${screen}.behavior.yaml`);
}

export function surfacePath(paths: ProjectPaths, screen: ScreenId): string {
  return path.join(paths.knowledge.surfacesDir, `${screen}.surface.yaml`);
}

export function patternDocumentPath(paths: ProjectPaths, fileName: string): string {
  return path.join(paths.knowledge.patternsDir, fileName);
}

export function knowledgeArtifactPath(paths: ProjectPaths, relativeArtifactPath: string): string {
  const normalized = relativeArtifactPath.replace(/^knowledge[\\/]/, '');
  return resolvePathWithinRoot(paths.knowledge.knowledgeDir, normalized, 'relativeArtifactPath');
}

export function generatedKnowledgePath(paths: ProjectPaths): string {
  return path.join(paths.engine.generatedTypesDir, 'tesseract-knowledge.ts');
}

export function agentDslPath(paths: ProjectPaths): string {
  return path.join(paths.engine.generatedTypesDir, 'agent-dsl.ts');
}
