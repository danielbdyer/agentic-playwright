#!/usr/bin/env tsx
/**
 * Static view-bundle channel (docs/v2-reactive-discovery-handoff.md
 * §3.3 / N6): manifest → screen → `<Module>.<Flow>.<Screen>.mvc.js`
 * → composed blocks + `prompt:` literals. Page source only; nothing
 * is rendered.
 *
 *   npx tsx scripts/harvest-screen-bundle.ts --aut outsystems-ui-website --screen Productcatalog
 *     [--record <snapshot.json>]   # N6 law: static literals ⊆ rendered names
 *
 * The partition guard applies: only a `study` screen may be read.
 * Exit 0 on success (and law holds when --record is given); 1 when
 * the law fails; 30 when the screen is refused or not found.
 */

import * as fs from 'node:fs';
import { loadStudyPartition, assertHarvestAllowed, HeldOutRouteContactAttempt } from '../workshop/substrate-study/application/study-partition';
import { extractViewBundleFacts, viewBundlePath } from '../workshop/substrate-study/domain/view-bundle';
import type { SnapshotRecord } from '../workshop/substrate-study/domain/snapshot-record';

interface ManifestJson {
  readonly manifest: { readonly versionToken: string; readonly urlVersions: Record<string, string> };
  readonly data: { readonly modules: Record<string, { readonly moduleName: string; readonly screens: readonly { readonly screenUrl: string; readonly viewModuleName: string }[] }> };
}

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1]! : null;
}

async function main(): Promise<number> {
  const aut = arg('--aut');
  const screen = arg('--screen');
  if (!aut || !screen) throw new Error('usage: harvest-screen-bundle --aut <partition> --screen <ScreenUrl> [--record snapshot.json]');
  const partition = loadStudyPartition(process.cwd(), aut);
  const base = partition.baseUrl.replace(/\/+$/, '');
  assertHarvestAllowed(partition, `${base}/${screen}`);

  const manifest = (await (await fetch(`${base}/${partition.moduleInfoEndpoint}`)).json()) as ManifestJson;
  const entry = Object.values(manifest.data.modules)
    .flatMap((m) => m.screens.map((s) => ({ ...s, moduleName: m.moduleName })))
    .find((s) => s.screenUrl.toLowerCase() === screen.toLowerCase());
  if (entry === undefined) {
    process.stderr.write(`screen '${screen}' not in manifest (version ${manifest.manifest.versionToken})\n`);
    return 30;
  }
  const basePath = new URL(partition.baseUrl).pathname;
  const bundle = viewBundlePath(basePath, entry.viewModuleName, manifest.manifest.urlVersions);
  if (bundle === null) {
    process.stderr.write(`no view bundle for ${entry.viewModuleName}\n`);
    return 30;
  }
  const source = await (await fetch(`${new URL(partition.baseUrl).origin}${bundle}`)).text();
  const facts = extractViewBundleFacts(source);
  process.stdout.write(
    `${screen} (${entry.moduleName}) version=${manifest.manifest.versionToken}\n` +
      `  bundle=${bundle.split('?')[0]} bytes=${facts.bytes} createElement=${facts.createElementCount} onClick=${facts.onClickCount}\n` +
      `  blocks (${facts.blockRefs.length}): ${facts.blockRefs.join(', ')}\n` +
      `  prompts (${facts.prompts.length}): ${facts.prompts.map((p) => JSON.stringify(p)).join(', ')}\n`,
  );

  const recordPath = arg('--record');
  if (recordPath === null) return 0;
  const record = JSON.parse(fs.readFileSync(recordPath, 'utf8')) as SnapshotRecord;
  const rendered = new Set(
    record.payload.nodes.flatMap((n) => [n.ariaNaming.accessibleName, n.interaction.placeholder, n.labelText].filter((v): v is string => v !== null)),
  );
  const missing = facts.prompts.filter((p) => !rendered.has(p));
  process.stdout.write(`  N6 law: ${facts.prompts.length - missing.length}/${facts.prompts.length} static prompts found among rendered names${missing.length > 0 ? ` — missing ${JSON.stringify(missing)}` : ''}\n`);
  return missing.length === 0 ? 0 : 1;
}

main()
  .then((code) => { process.exitCode = code; })
  .catch((err: unknown) => {
    process.stderr.write(`${err instanceof HeldOutRouteContactAttempt ? 'refused' : 'hard failure'}: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 30;
  });
