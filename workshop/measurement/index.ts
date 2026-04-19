/**
 * Application-layer measurement (Loop C).
 *
 * Composes the fitness report producer (workshop/orchestration/
 * fitness.ts) with the L4 visitor projection layer (workshop/metrics/
 * metric/visitors/) and the baseline store. Provides the score and
 * baseline orchestration verbs that the speedrun CLI shell exposes
 * after the commit J reshape.
 *
 * Doctrine: this namespace MUST NOT import from product/runtime/ or
 * product/application/runtime/. Measurement is downstream of execution;
 * the dependency is one-way. Architecture-fitness lint enforced in
 * commit H.
 */
export * from './baseline-store';
export * from './score';
