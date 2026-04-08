/**
 * Application-layer discovery namespace.
 *
 * Per docs/canon-and-derivation.md § 9.1 The discovery engine,
 * this namespace consolidates the previously-scattered discovery
 * code (CLI commands, infrastructure tooling, knowledge
 * discovery domain types) into a typed runner-and-decomposer
 * surface that the lookup chain's slot 5 can invoke.
 *
 * The namespace is intentionally thin in Phase 0d:
 *
 *   - DiscoveryRunner interface (typed contract for one runner)
 *   - DiscoveryRunnerRegistry (per-atom-class routing)
 *   - decomposeDiscoveryRun (pure DiscoveryRun → Atom[] decomposer)
 *   - createScreenDiscoveryRunner (stub adapter for the screen-
 *     scaffold infrastructure tooling)
 *
 * Phase 3 expands this with:
 *
 *   - createRouteHarvestRunner (wraps harvestDeclaredRoutes)
 *   - createPatternPromotionRunner (cross-screen pattern detection)
 *   - createSnapshotCaptureRunner (ARIA snapshot capture)
 *   - createDriftDetectionRunner (drift mode observation)
 *   - The actual runImpl wirings that connect each runner to its
 *     existing infrastructure surface
 *   - Lookup chain slot 5 invocation when cold mode falls through
 */

export * from './discovery-runner';
export * from './decompose-discovery-run';
export * from './screen-discovery-runner';
