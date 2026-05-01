# Public-AUT Cohort

> Status: nascent (2026-05-01). First entry: TodoMVC. See
> `docs/v2-cold-start-cohort-spike.md` for the cohort's design,
> `docs/v2-cold-start-todomvc-journal.md` for the experiment that
> seeded it.

## Purpose

Cohort of publicly accessible web applications used as
cold-start training and held-out evaluation surfaces, separate
from the synthetic-app substrate the resolvable + needs-human
corpora target. Provides real-world DOM entropy as a forcing
function for the product's discovery instruments.

## The clean-room rule

Every AUT in this cohort sits on one side of an irrevocable
partition: `training` or `held-out`. Per
`docs/v2-cold-start-cohort-spike.md §4.4`:

- Partition is declared in `cohort.json` before any agent contact
  with the AUT (C1).
- Held-out AUTs MUST NOT feed canon graduation. The trust-policy
  gate consults `loadPublicAutManifest` at runtime and refuses
  catalog writes when the active context is `held-out` (C2).
- Held-out evaluation is single-use per canon fingerprint (C3).
- Promotion held-out → training is allowed and irreversible.
  Training → held-out is forbidden — once the canon has been
  allowed to graduate against an AUT's surfaces, that AUT's
  signal is forever contaminated for generalization measurement
  (C4).

## Layout

```
public-aut/
├── cohort.json          ← manifest (partition + URL + provenance)
├── README.md            ← this file
└── <aut-name>/          ← per-AUT directory; name matches manifest entry
    └── 9xxxx-*.ado.json ← ADO-shaped fixtures (id range 91000–91999)
```

The fixtures' `targetAut` field carries the AUT's URL
explicitly. The directory layout is convention; `targetAut` is
authoritative when the two disagree.

## Authoring a new entry

1. Add an entry to `cohort.json` with `partition`, `url`,
   `fixturesDir`, `authoringOperator`, `addedAt`. Set
   `snapshotFingerprint: null` until the first capture lands.
2. Create `public-aut/<fixturesDir>/`.
3. Author 3+ ADO snapshots in the cohort's reserved ID range
   (`91000–91999`). Set `targetAut` to the AUT's URL.
4. If the AUT is `held-out`, **do not run any agent pipeline
   against it**. Author the fixtures under operator inspection
   only; the agent never sees the AUT until evaluation time
   (C5).
