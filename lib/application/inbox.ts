import { Effect } from 'effect';
import { loadWorkspaceCatalog, type WorkspaceCatalog } from './catalog';
import { renderOperatorInboxMarkdown, buildOperatorInboxItems } from './operator';
import { buildWorkflowHotspots } from './hotspots';
import type { ProjectPaths } from './paths';
import { relativeProjectPath } from './paths';
import { FileSystem, Dashboard } from './ports';
import { dashboardEvent } from '../domain/types/dashboard';
import { mintReviewRequired } from '../domain/types/workflow';

export function emitOperatorInbox(options: {
  paths: ProjectPaths;
  catalog?: WorkspaceCatalog;
  filter?: {
    adoId?: string | null | undefined;
    kind?: string | null | undefined;
    status?: string | null | undefined;
  } | undefined;
}) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const catalog = options.catalog ?? (yield* loadWorkspaceCatalog({ paths: options.paths }));
    const filteredItems = buildOperatorInboxItems(catalog)
      .filter((item) => !options.filter?.adoId || item.adoId === options.filter.adoId)
      .filter((item) => !options.filter?.kind || item.kind === options.filter.kind)
      .filter((item) => !options.filter?.status || item.status === options.filter.status);
    const filteredImprovementRuns = catalog.improvementRuns
      .flatMap((entry) =>
        !options.filter?.adoId || entry.artifact.iterations.some((iteration) => iteration.scenarioIds.some((scenarioId) => String(scenarioId) === options.filter!.adoId))
          ? [entry.artifact] : [],
      )
      .sort((left, right) => (right.completedAt ?? right.startedAt).localeCompare(left.completedAt ?? left.startedAt));
    const rerunPlans = catalog.rerunPlans.map((entry) => entry.artifact);
    const hotspots = buildWorkflowHotspots(
      catalog.runRecords.map((entry) => entry.artifact),
      catalog.interpretationDriftRecords.map((entry) => entry.artifact),
      catalog.resolutionGraphRecords.map((entry) => entry.artifact),
    );
    const markdown = renderOperatorInboxMarkdown(filteredItems, rerunPlans, hotspots, filteredImprovementRuns);
    yield* fs.writeJson(options.paths.inboxIndexPath, {
      kind: 'operator-inbox',
      version: 1,
      generatedAt: new Date().toISOString(),
      items: filteredItems,
      improvementRuns: filteredImprovementRuns,
      rerunPlans,
      hotspots,
    });
    yield* fs.writeText(options.paths.inboxReportPath, markdown);
    yield* fs.writeJson(options.paths.hotspotIndexPath, {
      kind: 'workflow-hotspot-index',
      version: 1,
      generatedAt: new Date().toISOString(),
      hotspots,
    });

    // Emit inbox-item-arrived for each actionable item
    const dashboard = yield* Dashboard;
    const actionableItems = filteredItems.filter((item) => item.status === 'actionable');
    if (actionableItems.length > 0) {
      yield* Effect.forEach(
        actionableItems,
        (item) => dashboard.emit(dashboardEvent('inbox-item-arrived', {
          id: item.id,
          element: (item as unknown as Record<string, unknown>).element as string ?? item.id,
          screen: (item as unknown as Record<string, unknown>).screen as string ?? 'unknown',
          urgency: 'queued',
          reason: item.summary,
          governance: mintReviewRequired(),
          relatedWorkItemId: null,
        })),
        { concurrency: 1 },
      );
    }

    return {
      itemCount: filteredItems.length,
      items: filteredItems,
      improvementRuns: filteredImprovementRuns,
      rerunPlans,
      hotspots,
      inboxIndexPath: options.paths.inboxIndexPath,
      inboxReportPath: options.paths.inboxReportPath,
      rewritten: [
        relativeProjectPath(options.paths, options.paths.inboxIndexPath),
        relativeProjectPath(options.paths, options.paths.inboxReportPath),
        relativeProjectPath(options.paths, options.paths.hotspotIndexPath),
      ],
    };
  });
}
