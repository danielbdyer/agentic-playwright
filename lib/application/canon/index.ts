/**
 * Bounded context — application/canon
 *
 * Pure catamorphic decomposers that turn existing hybrid canonical
 * artifacts (the compound YAML files at `dogfood/knowledge/screens/`,
 * `dogfood/knowledge/routes/`, `dogfood/controls/datasets/`, etc.)
 * into per-atom envelopes addressable by the lookup chain at
 * `lib/domain/pipeline/lookup-chain.ts`.
 *
 * This namespace is the application-layer home for Phase A of
 * `docs/cold-start-convergence-plan.md` (atom decomposition). Each
 * decomposer is a pure function — same input, same output — that
 * mirrors the shape of `decomposeDiscoveryRun` at
 * `lib/application/discovery/decompose-discovery-run.ts`. The two
 * fan-in patterns (cold derivation and existing canon migration)
 * deliberately share one decomposition idiom so future readers see
 * one pattern, not two.
 *
 * Per `docs/canon-and-derivation.md` § 3.6 and
 * `docs/domain-class-decomposition.md`, every atom envelope stores
 * an existing domain type as its `content` field — the decomposers
 * never invent parallel content shapes. The element decomposer
 * uses `ElementSig`; future decomposers will use `Posture`,
 * `RouteVariant`, `SnapshotTemplate`, etc.
 *
 * Read `docs/cold-start-convergence-plan.md` § Phase A before
 * adding a new decomposer to this namespace.
 */

export * from './decompose-screen-elements';
export * from './decompose-screen-hints';
