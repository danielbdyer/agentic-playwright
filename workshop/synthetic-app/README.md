# Synthetic Substrate

Rung-3 substrate per `docs/v2-probe-ir-spike.md` §§6.2, 8.3. This
directory is the concrete React instantiation of the substrate
equation `(WorldConfig, FacetRendererRegistry) → DOM`.

## Shape

```
src/
  bootstrap.tsx           # Entry: parses URL → mounts SubstrateRenderer
  SubstrateRenderer.tsx   # Reads WorldConfig → maps facets → renders
  renderers/
    registry.ts           # Default FacetRendererRegistry
    *.tsx                 # One file per registered facet renderer
index.html                # Shell — references ./synthetic-app.js bundle
server.ts                 # In-process Node http server (Slice 6.2)
```

The substrate has no router, no screens-as-pages, no stateful
navigation. Every URL is a serialized WorldConfig; the bundle
parses and renders. Two URLs with identical `world` params produce
byte-identical DOM.

## Wire format

See `workshop/substrate/world-config.ts`. Single query parameter
`world` carrying URI-encoded JSON. The harness mints URLs; the
substrate decodes them.

## Substrate-version discipline

The `renderers/registry.ts` instance IS the substrate version
surface. Per memo §8.6, changing a renderer's behavior is
substrate drift — the rung-3 parity law catches it by comparing
fixture-replay and playwright-live receipts.

## Not a website

Don't add a landing page. Don't add navigation. The substrate's
reason for existing is that classifiers have a rendered DOM to
inspect. Everything else is out of scope.
