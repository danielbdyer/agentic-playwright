import { Effect } from 'effect';
import { loadWorkspaceCatalog } from './catalog';
import { renderOperatorInboxMarkdown, buildOperatorInboxItems } from './operator';
import type { ProjectPaths } from './paths';
import { relativeProjectPath } from './paths';
import { FileSystem } from './ports';

export function emitOperatorInbox(options: {
  paths: ProjectPaths;
  filter?: {
    adoId?: string | null | undefined;
    kind?: string | null | undefined;
    status?: string | null | undefined;
  } | undefined;
}) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const catalog = yield* loadWorkspaceCatalog({ paths: options.paths });
    const filteredItems = buildOperatorInboxItems(catalog)
      .filter((item) => !options.filter?.adoId || item.adoId === options.filter.adoId)
      .filter((item) => !options.filter?.kind || item.kind === options.filter.kind)
      .filter((item) => !options.filter?.status || item.status === options.filter.status);
    const rerunPlans = catalog.rerunPlans.map((entry) => entry.artifact);
    const markdown = renderOperatorInboxMarkdown(filteredItems, rerunPlans);
    yield* fs.writeJson(options.paths.inboxIndexPath, {
      kind: 'operator-inbox',
      version: 1,
      generatedAt: new Date().toISOString(),
      items: filteredItems,
      rerunPlans,
    });
    yield* fs.writeText(options.paths.inboxReportPath, markdown);

    return {
      itemCount: filteredItems.length,
      items: filteredItems,
      rerunPlans,
      inboxIndexPath: options.paths.inboxIndexPath,
      inboxReportPath: options.paths.inboxReportPath,
      rewritten: [
        relativeProjectPath(options.paths, options.paths.inboxIndexPath),
        relativeProjectPath(options.paths, options.paths.inboxReportPath),
      ],
    };
  });
}
