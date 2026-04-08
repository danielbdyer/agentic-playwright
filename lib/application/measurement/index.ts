/**
 * Application-layer measurement (Loop C).
 *
 * Composes the fitness report producer (lib/application/improvement/
 * fitness.ts) with the L4 visitor projection layer (lib/domain/fitness/
 * metric/visitors/) and the baseline store. Provides the score and
 * baseline orchestration verbs that the speedrun CLI shell exposes
 * after the commit J reshape.
 *
 * Doctrine: this namespace MUST NOT import from lib/runtime/ or
 * lib/application/runtime/. Measurement is downstream of execution;
 * the dependency is one-way. Architecture-fitness lint enforced in
 * commit H.
 */
export * from './baseline-store';
export * from './score';
