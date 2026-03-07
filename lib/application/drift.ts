import path from 'path';
import { Effect } from 'effect';
import { classifySnapshotDrift } from '../domain/drift';
import { sha256, stableStringify } from '../domain/hash';
import { walkFiles } from './artifacts';
import { ProjectPaths, relativeProjectPath } from './paths';
import { FileSystem } from './ports';

interface DriftEvidenceRecord {
  kind: 'drift-evidence';
  baselineSnapshotTemplate: string;
  currentSnapshotPath: string;
  screen: string;
  drift: ReturnType<typeof classifySnapshotDrift>;
  provenance: {
    baselineFingerprint: string;
    currentFingerprint: string;
    reportFingerprint: string;
    generatedAt: string;
  };
}

function inferScreenFromSnapshotTemplate(snapshotTemplate: string): string {
  const normalized = snapshotTemplate.replace(/\\/g, '/');
  const [, screen = 'unknown-screen'] = normalized.split('/');
  return screen;
}

function driftEvidencePath(paths: ProjectPaths, baselineSnapshotTemplate: string): string {
  const normalized = baselineSnapshotTemplate.replace(/\.ya?ml$/i, '').replace(/\\/g, '/');
  return path.join(paths.evidenceDir, 'drift', `${normalized}.json`);
}

export function materializeDriftEvidence(options: { paths: ProjectPaths }) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const baselineRoot = path.join(options.paths.knowledgeDir, 'snapshots');
    const currentRoot = path.join(options.paths.evidenceDir, 'current-snapshots');
    const baselineFiles = (yield* walkFiles(fs, baselineRoot)).filter((filePath) => filePath.endsWith('.yaml'));

    const reports: Array<{ reportPath: string; driftFingerprint: string; classes: string[] }> = [];

    for (const baselinePath of baselineFiles) {
      const relativeBaselinePath = relativeProjectPath(options.paths, baselinePath);
      const snapshotTemplate = relativeBaselinePath.replace(/^knowledge\//, '');
      const currentPath = path.join(currentRoot, path.relative(baselineRoot, baselinePath));
      const currentExists = yield* fs.exists(currentPath);
      if (!currentExists) {
        continue;
      }

      const baselineSnapshot = yield* fs.readText(baselinePath);
      const currentSnapshot = yield* fs.readText(currentPath);
      const drift = classifySnapshotDrift(baselineSnapshot, currentSnapshot);

      const reportPath = driftEvidencePath(options.paths, snapshotTemplate);
      yield* fs.ensureDir(path.dirname(reportPath));

      const report: DriftEvidenceRecord = {
        kind: 'drift-evidence',
        baselineSnapshotTemplate: snapshotTemplate,
        currentSnapshotPath: relativeProjectPath(options.paths, currentPath),
        screen: inferScreenFromSnapshotTemplate(snapshotTemplate),
        drift,
        provenance: {
          baselineFingerprint: drift.baselineFingerprint,
          currentFingerprint: drift.currentFingerprint,
          reportFingerprint: `sha256:${sha256(stableStringify({ snapshotTemplate, currentPath: relativeProjectPath(options.paths, currentPath), drift }))}`,
          generatedAt: new Date().toISOString(),
        },
      };

      yield* fs.writeJson(reportPath, report);
      reports.push({
        reportPath: relativeProjectPath(options.paths, reportPath),
        driftFingerprint: drift.driftFingerprint,
        classes: drift.classes,
      });
    }

    return {
      reportCount: reports.length,
      reports,
      driftDir: relativeProjectPath(options.paths, path.join(options.paths.evidenceDir, 'drift')),
    };
  });
}
