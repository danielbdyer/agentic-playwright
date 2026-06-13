# Cold-start cohort regression baselines (Cycle 11 / G2)

Committed, substrate-version-keyed honest summaries per AUT. The
ratchet comparator (`workshop/customer-backlog/application/cohort-baseline.ts`)
fails a run that regresses recall (`domTargetMatched`), verified
correctness (`verifiedMatches`), or precision (`falsePositives`)
against the committed baseline at the same `substrateVersion`.

These are the empirical wing's regression gate. Receipts are
gitignored and `.tesseract/` baselines are machine-local; these
files are the only in-repo record of "how well does the system do
on real sites", so a silent regression is detectable.

## Discipline

- **Improving runs update the baseline explicitly** (snapshot-test
  semantics): if recall/verified rise or false positives fall,
  promote by committing a new baseline with an updated `note` and
  `capturedAt`. The comparator never silently absorbs an
  improvement.
- **A substrate-version bump resets the ratchet**: a MAJOR/MINOR
  substrate change can legitimately disagree, so the comparator
  treats a version mismatch as informational and the operator
  re-baselines at the new version.
- **Only reliably-measurable AUTs are baselined here.** httpbin-form
  is unreachable from some egress environments and is therefore not
  baselined (a missing baseline cannot regress).
- **Held-out AUTs are baselined only AFTER promotion to training.**
  Baselining a held-out AUT before its clean evaluation would
  contaminate it.

## Checking a run

```bash
node dist/bin/tesseract.js compile-public-aut --aut todomvc --check-baseline
```

Exits non-zero and prints the regressed axes when the run falls
below the committed baseline.
