import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  test,
  vi,
} from 'vitest';

// Playwright's `test` API exposes `test.setTimeout(ms)` as a per-test timeout
// hook callable from inside the test body. Vitest does not implement this
// surface — instead it reads `testTimeout` from config or accepts a third
// `{ timeout }` argument on the `test()` call. To let shared specs target both
// runners, we install a no-op shim. Tests that genuinely need a long timeout
// under vitest should use `test('name', fn, { timeout: 180_000 })` directly;
// the shim's job is to keep the playwright-style call from crashing the suite.
const setTimeoutShim = (_ms: number): void => {
  /* intentional no-op: vitest reads testTimeout from config */
};

const playwrightStyleTest = Object.assign(test, {
  describe,
  setTimeout: setTimeoutShim,
});

export {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  playwrightStyleTest as test,
  vi,
};
