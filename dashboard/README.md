# dashboard/

The read-only observer. Projects both `product/` and `workshop/` into a human view through manifest-declared verbs. Writes nothing.

## Single responsibility

`dashboard/` answers "what's the state of the system right now?" — for humans. It renders:

- The proposal queue (pending / approved / rejected).
- The scorecard trend + graduation-curve progress.
- The receipt log (hypothesis vs. actual-delta).
- The drift event log.
- The suggested-action ranking (what's the most useful next move?).

`dashboard/` writes nothing to either `product/` or `workshop/`. Every dashboard-initiated action (approve a proposal, resolve a handoff) routes through a manifest-declared verb that product or workshop owns; the dashboard's role is to surface the action, not to perform it.

## What lives here

- `dashboard/mcp/` — MCP server surface. Tool implementations route through manifest-declared verbs (not direct imports from product).
- `dashboard/bridges/` — file-backed decision-bridge watcher (cross-process transport for agent decisions), plus the WS/CDP/journal transports shared with the web UI.
- `dashboard/projections/` — static read-only views (HTML, CLI tables, etc.).
- The pre-existing web-UI layer (`dashboard/src/`, `dashboard/server/`, `dashboard.js`, `index.html`, `styles.css`, `tailwind.config.ts`, `server.ts`) lives here too. It is the running speedrun observer; a later step may reclassify it into `dashboard/projections/web-ui/` without behavior change.

## What this folder can and cannot do

- Can read `product/manifest/manifest.json` and the shared append-only log set.
- Can read scorecard JSON, receipt logs, drift logs, proposal logs.
- **Cannot import any `product/` or `workshop/` internal type** except those exported via manifest-declared verbs. The seam-enforcement test catches violations.
- Cannot write back to product's catalog, workshop's scorecard, or any append-only log.

## When working here

Every tool handler is a thin projection over a manifest-declared verb. If you need data the manifest doesn't expose, the fix is to declare a new verb in `product/` or `workshop/`, not to reach into their internals. Dashboards are eyes, not hands.
