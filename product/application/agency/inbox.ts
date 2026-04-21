import { Effect, Either, Schema } from 'effect';
import { loadWorkspaceCatalog, type WorkspaceCatalog } from '../catalog';
import { renderOperatorInboxMarkdown, buildOperatorInboxItems } from '../agency/operator';
import { buildWorkflowHotspots } from '../projections/hotspots';
import type { ProjectPaths } from '../paths';
import { relativeProjectPath } from '../paths';
import { FileSystem, Dashboard } from '../ports';
import { dashboardEvent } from '../../domain/observation/dashboard';
import { mintReviewRequired } from '../../domain/governance/workflow-types';
import { decodeUnknownEither } from '../../domain/schemas/decode';
import { TesseractError } from '../../domain/kernel/errors';

const OperatorInboxDashboardEventDataSchema = Schema.Struct({
  element: Schema.optionalWith(Schema.NullOr(Schema.String), { default: () => null }),
  screen: Schema.optionalWith(Schema.NullOr(Schema.String), { default: () => null }),
});

const decodeOperatorInboxDashboardEventData = decodeUnknownEither(OperatorInboxDashboardEventDataSchema);

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
    // Cap rendered markdown to 2MB to prevent OOM on huge catalogs
    const MAX_MARKDOWN_LENGTH = 2 * 1024 * 1024;
    let markdown = renderOperatorInboxMarkdown(filteredItems, rerunPlans, hotspots, filteredImprovementRuns);
    if (markdown.length > MAX_MARKDOWN_LENGTH) {
      markdown = markdown.slice(0, MAX_MARKDOWN_LENGTH) + '\n\n---\n*Truncated: report exceeded 2MB. Filter by adoId/kind/status for focused results.*\n';
    }
    // Parallelize independent file writes
    const generatedAt = new Date().toISOString();
    yield* Effect.all([
      fs.writeJson(options.paths.inboxIndexPath, {
        kind: 'operator-inbox',
        version: 1,
        generatedAt,
        items: filteredItems,
        improvementRuns: filteredImprovementRuns,
        rerunPlans,
        hotspots,
      }),
      fs.writeText(options.paths.inboxReportPath, markdown),
      fs.writeJson(options.paths.hotspotIndexPath, {
        kind: 'workflow-hotspot-index',
        version: 1,
        generatedAt,
        hotspots,
      }),
    ]);

    // Emit inbox-item-arrived for each actionable item
    const dashboard = yield* Dashboard;
    const actionableItems = filteredItems.filter((item) => item.status === 'actionable');
    if (actionableItems.length > 0) {
      yield* Effect.forEach(
        actionableItems,
        (item) => {
          const decoded = decodeOperatorInboxDashboardEventData(item);
          // Skip items that fail decode instead of stopping the entire broadcast
          if (Either.isLeft(decoded)) {
            return Effect.void;
          }
          const eventData = decoded.right;
          return dashboard.emit(dashboardEvent('inbox-item-arrived', {
            id: item.id,
            element: eventData.element ?? item.id,
            screen: eventData.screen ?? 'unknown',
            urgency: 'queued',
            reason: item.summary,
            governance: mintReviewRequired(),
            relatedWorkItemId: null,
          }));
        },
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
