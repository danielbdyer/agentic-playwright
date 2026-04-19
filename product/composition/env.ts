/**
 * Environment variable reads centralized at the composition boundary.
 *
 * The lint rule `no-restricted-properties` forbids `process.env` outside
 * `product/composition/` and `product/instruments/tooling/`. This module is
 * the canonical place for all env reads that feed into application-layer
 * configuration.
 */

/** Read `TESSERACT_CONCURRENCY` — optional override for parallel Effect concurrency. */
export function readEnvConcurrency(): number | undefined {
  const raw = parseInt(process.env.TESSERACT_CONCURRENCY ?? '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : undefined;
}

/** Read `TESSERACT_AGENT_PROVIDER` — optional override for agent interpreter kind. */
export function readEnvAgentProvider(): string | undefined {
  return process.env.TESSERACT_AGENT_PROVIDER?.trim() || undefined;
}

/** Read `CI` — truthy when running in a CI environment. */
export function readEnvIsCI(): boolean {
  return Boolean(process.env.CI);
}
