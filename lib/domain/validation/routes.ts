import { createRouteId, createRouteVariantId, createScreenId } from '../identity';
import type { HarvestManifest } from '../types';
import { expectArray, expectId, expectOptionalString, expectRecord, expectString } from './primitives';

export function validateHarvestManifest(value: unknown): HarvestManifest {
  const manifest = expectRecord(value, 'harvestManifest');
  return {
    kind: manifest.kind === undefined ? 'harvest-manifest' : expectString(manifest.kind, 'harvestManifest.kind') as 'harvest-manifest',
    version: 1,
    app: expectString(manifest.app, 'harvestManifest.app'),
    baseUrl: expectOptionalString(manifest.baseUrl, 'harvestManifest.baseUrl') ?? null,
    routes: expectArray(manifest.routes ?? [], 'harvestManifest.routes').map((entry, index) => {
      const route = expectRecord(entry, `harvestManifest.routes[${index}]`);
      return {
        id: expectId(route.id, `harvestManifest.routes[${index}].id`, createRouteId),
        screen: expectId(route.screen, `harvestManifest.routes[${index}].screen`, createScreenId),
        entryUrl: expectString(route.entryUrl, `harvestManifest.routes[${index}].entryUrl`),
        rootSelector: expectOptionalString(route.rootSelector, `harvestManifest.routes[${index}].rootSelector`) ?? null,
        variants: expectArray(route.variants ?? [], `harvestManifest.routes[${index}].variants`).map((variantEntry, variantIndex) => {
          const variant = expectRecord(variantEntry, `harvestManifest.routes[${index}].variants[${variantIndex}]`);
          return {
            id: expectId(variant.id, `harvestManifest.routes[${index}].variants[${variantIndex}].id`, createRouteVariantId),
            url: expectString(variant.url, `harvestManifest.routes[${index}].variants[${variantIndex}].url`),
            screen: expectId(variant.screen, `harvestManifest.routes[${index}].variants[${variantIndex}].screen`, createScreenId),
            rootSelector: expectOptionalString(variant.rootSelector, `harvestManifest.routes[${index}].variants[${variantIndex}].rootSelector`) ?? null,
          };
        }),
      };
    }),
  };
}
