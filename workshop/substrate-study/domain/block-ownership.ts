/**
 * Block ownership from the app's own module manifest
 * (docs/v2-reactive-discovery-handoff.md §3.3, N5).
 *
 * Every OutSystems Reactive app serves
 * `/<Module>/moduleservices/moduleinfo`. Its `manifest.urlVersions`
 * lists every bundle the app can load, and a block's compiled
 * bundle is named `<Module>.<Folder>.<Block>.mvc.js`. A
 * `data-block="Folder.Block"` value on the page therefore belongs to
 * the module whose bundle exists — no crawl, no guessing. Platform
 * blocks (`OutSystemsUI.*`) are shared by every customer app that
 * uses OutSystems UI; app blocks are per-catalog.
 *
 * Pure. Manifest shape is narrowed to the one key this needs.
 */

import type { BlockOwnership } from './snapshot-record';

/** `/OutSystemsUIWebsite/scripts/OutSystemsUI.Interaction.Search.mvc.js`
 *  → module `OutSystemsUI`, block `Interaction.Search`. Only `.mvc.js`
 *  bundles name blocks (and screens); CSS and other assets are
 *  ignored. Returns null for paths that do not fit. */
export function parseBundlePath(path: string): { readonly module: string; readonly block: string } | null {
  const file = path.split('/').pop() ?? '';
  const m = /^([A-Za-z0-9_]+)\.([A-Za-z0-9_]+(?:\.[A-Za-z0-9_$]+)+)\.mvc\.js(?:\?.*)?$/.exec(file);
  if (m === null) return null;
  return { module: m[1]!, block: m[2]! };
}

/** Index of block name → owning module, from the manifest's bundle
 *  list. A block name claimed by two modules keeps the first (stable
 *  under the manifest's own ordering). */
export function bundleOwnership(bundlePaths: readonly string[]): ReadonlyMap<string, string> {
  return bundlePaths.reduce((acc, p) => {
    const parsed = parseBundlePath(p);
    return parsed === null || acc.has(parsed.block) ? acc : new Map(acc).set(parsed.block, parsed.module);
  }, new Map<string, string>());
}

/** Partition the page's `data-block` values by owning module. The
 *  input is the per-block node count the walker observed. Blocks the
 *  manifest does not list land in `unresolved` — a signal, not an
 *  error (a customer module the manifest omits, or a block name that
 *  is not `Folder.Block`). Output arrays are sorted by block name so
 *  the record is deterministic. */
export function partitionBlocksByOwner(
  bundlePaths: readonly string[],
  observed: ReadonlyMap<string, number>,
): BlockOwnership {
  const owners = bundleOwnership(bundlePaths);
  const entries = [...observed.entries()]
    .map(([block, nodes]) => ({ block, nodes, module: owners.get(block) ?? null }))
    .sort((a, b) => (a.block < b.block ? -1 : a.block > b.block ? 1 : 0));
  const byModule = entries
    .filter((e): e is typeof e & { module: string } => e.module !== null)
    .reduce<Record<string, readonly { block: string; nodes: number }[]>>(
      (acc, e) => ({ ...acc, [e.module]: [...(acc[e.module] ?? []), { block: e.block, nodes: e.nodes }] }),
      {},
    );
  const unresolved = entries.filter((e) => e.module === null).map(({ block, nodes }) => ({ block, nodes }));
  return { byModule, unresolved };
}

/** Count `data-block` values over walker nodes. */
export function observedBlocks(
  nodes: readonly { readonly dataAttrValues: Readonly<Record<string, string>> }[],
): ReadonlyMap<string, number> {
  return nodes.reduce((acc, n) => {
    const block = n.dataAttrValues['data-block'];
    return block === undefined || block.length === 0 ? acc : new Map(acc).set(block, (acc.get(block) ?? 0) + 1);
  }, new Map<string, number>());
}
