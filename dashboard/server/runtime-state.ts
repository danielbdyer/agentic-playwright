export interface RuntimeSnapshot {
  readonly fixtureUrl: string | null;
  readonly screencastActive: boolean;
}

export interface RuntimeState {
  readonly getSnapshot: () => RuntimeSnapshot;
  readonly setFixtureUrl: (value: string | null) => RuntimeSnapshot;
  readonly setScreencastActive: (value: boolean) => RuntimeSnapshot;
}

const INITIAL_RUNTIME_SNAPSHOT: RuntimeSnapshot = {
  fixtureUrl: null,
  screencastActive: false,
};

const withFixtureUrl = (snapshot: RuntimeSnapshot, fixtureUrl: string | null): RuntimeSnapshot => ({
  ...snapshot,
  fixtureUrl,
});

const withScreencastActive = (snapshot: RuntimeSnapshot, screencastActive: boolean): RuntimeSnapshot => ({
  ...snapshot,
  screencastActive,
});

export const createRuntimeState = (): RuntimeState => {
  let snapshot: RuntimeSnapshot = INITIAL_RUNTIME_SNAPSHOT;

  return {
    getSnapshot: () => snapshot,
    setFixtureUrl: (value) => {
      snapshot = withFixtureUrl(snapshot, value);
      return snapshot;
    },
    setScreencastActive: (value) => {
      snapshot = withScreencastActive(snapshot, value);
      return snapshot;
    },
  };
};
