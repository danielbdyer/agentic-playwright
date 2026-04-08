/**
 * L4 measurement primitives — phantom-branded, hierarchical metric trees.
 *
 * The runtime never imports this namespace. Every L4 metric is derived
 * strictly downstream of receipt emission via a `MetricVisitor`.
 *
 * Visitor implementations live in `./visitors/` (added in later commits)
 * and the runtime registry that binds them to receipt sources lives in
 * `lib/application/measurement/`.
 */
export * from './value';
export * from './tree';
export * from './catalogue';
export * from './visitor';
export * from './baseline';
export * from './delta';
export * from './visitors';
