# Semantic Dictionary

> Canonical — rung 6 technical reference

The semantic dictionary is a learning flywheel that accumulates successful resolution decisions and replays them for semantically similar future intents — without an LLM call.

It lives at **rung 6** of the resolution ladder, between prior-evidence (rung 5) and approved-equivalent overlays (rung 7). This positioning means it only gets traffic when approved screen knowledge (rung 3) and shared patterns (rung 4) don't already cover the intent.

## How it works

### Accrual

After any successful resolution (at any rung), the decision is accrued into the dictionary:

```
intent: "Click Search button"
→ target: { action: click, screen: policy-search, element: search-button }
→ provenance: structured-translation
→ confidence: 0.5 (initial)
```

The normalized intent text becomes the lookup key. The target, provenance, and metadata become the stored value.

### Lookup

When a new step reaches rung 6, the dictionary is queried:

1. **Shingle extraction** — the intent is tokenized into character n-grams (shingles)
2. **Inverted index lookup** — each shingle maps to candidate entry IDs via `O(Q)` posting list intersection (not `O(N)` full scan)
3. **TF-IDF scoring** — candidate entries are ranked by cosine similarity using pre-computed IDF weights
4. **Multi-dimensional scoring** — top candidates are scored on three axes:
   - Text similarity (weight 0.45): blended Jaccard + TF-IDF cosine
   - Structural compatibility (weight 0.25): action feasibility, screen proximity, route overlap
   - Confidence history (weight 0.30): the entry's accumulated confidence score
5. **Threshold gate** — combined score must exceed 0.35 to reuse the entry

### Confidence dynamics

| Event | Effect |
|-------|--------|
| New entry created | confidence = 0.5 |
| Successful reuse | +0.12 × (1 - current), diminishing returns toward 1.0 |
| Failed execution | −0.3 penalty (aggressive; 2 failures from 0.5 → ~0) |
| 2+ consecutive failures | Entry suppressed from future lookups |

### Promotion

Dictionary entries that reach high confidence graduate to approved screen knowledge:

- **Criteria:** confidence ≥ 0.8, successCount ≥ 3, not already promoted
- **Effect:** entry written to `knowledge/screens/{screen}.hints.yaml` as a durable alias
- **Result:** future lookups resolve at rung 3 (approved knowledge) instead of rung 6

This is the learning flywheel: structured-translation (rung 8, expensive LLM call) → dictionary (rung 6, cheap local lookup) → approved knowledge (rung 3, zero-cost compile-time binding).

## Data model

```typescript
interface SemanticDictionaryEntry {
  id: string;                    // Unique entry ID
  normalizedIntent: string;      // Lookup key (normalized intent text)
  target: {
    action: StepAction;          // click, fill, navigate, etc.
    screen: ScreenId;
    element: ElementId | null;
    posture: PostureId | null;
    snapshotTemplate: SnapshotTemplateId | null;
  };
  provenance: 'translation' | 'dom-exploration' | 'agent-interpreted';
  winningSource: StepWinningSource;
  confidence: number;            // [0, 1]
  successCount: number;
  failureCount: number;
  consecutiveFailures: number;
  promoted: boolean;
  createdAt: string;             // ISO timestamp
  lastUsedAt: string;
  taskFingerprints: string[];    // Capped at 10 per entry
  knowledgeFingerprint: string;  // Hash of knowledge state at creation
}
```

## Shingle index

The shingle index provides fast fuzzy text matching without external dependencies.

### Structure

```typescript
interface ShingleIndex {
  shingleSize: number;           // Character n-gram size (default 3)
  idf: Map<string, number>;     // Inverse document frequency per shingle
  entries: Map<string, {         // Per-entry shingle vectors
    id: string;
    shingles: Map<string, number>;  // shingle → TF-IDF weight
  }>;
  invertedIndex: Map<string, Set<string>>;  // shingle → entry IDs
  stats: {
    totalEntries: number;
    totalShingles: number;
  };
}
```

### IDF computation

IDF weights use standard inverse document frequency:

```
idf(shingle) = log(1 + N / df(shingle))
```

where `N` = total entries and `df` = number of entries containing the shingle.

The index is incrementally maintained: adding an entry updates only affected shingle postings and IDF weights without full rebuild.

### Inverted index

Each shingle maps to the set of entry IDs that contain it. Query time:

1. Extract query shingles → `O(|query|)`
2. Union posting lists → candidate set `O(Q × avg_posting_size)`
3. Score only candidates → `O(|candidates| × |query_shingles|)`

For a 4096-entry dictionary, this typically evaluates <100 candidates instead of scanning all 4096.

## Persistence

- **Location:** `.tesseract/semantic-dictionary/index.json`
- **Format:** JSON with Maps serialized as `[key, value]` arrays
- **Locking:** Advisory file lock (`.lock` sidecar) with 30-second stale timeout
- **Capacity:** 4096 entries max; pruning evicts lowest-confidence entries first
- **TTL:** Promoted entries older than 90 days lose pruning priority

## Configuration

The dictionary is controlled by CLI flags and environment:

| Flag | Effect |
|------|--------|
| `--disable-translation-cache` | Skip dictionary lookup (rung 6) entirely |
| `--disable-translation` | Skip structured translation (rung 8) — dictionary still active |
| `--posture cold-start` | Dictionary starts empty; no prior knowledge loaded |
| `--posture warm-start` | Dictionary loaded from persisted state (default) |

## Governance

Dictionary entries carry governance metadata:

- **`uncertified`** — runtime-acquired, not yet reviewed by operator
- **`certified`** — operator-approved via `tesseract approve`
- **Pre-filter:** governance filter applied before top-N candidate selection ensures certified entries aren't crowded out by uncertified volume

## Observability

Dictionary state is visible in:

- `.tesseract/semantic-dictionary/index.json` — raw persisted state
- `generated/{suite}/{ado_id}.trace.json` — which rung won, dictionary hit/miss
- `generated/{suite}/{ado_id}.review.md` — human-readable resolution trace
- `.tesseract/inbox/index.json` — proposals from dictionary promotion candidates
- MCP `get_knowledge_state` tool — graph including dictionary nodes

## Hardening (production-scale)

The following hardening measures protect the dictionary at scale:

| Concern | Mitigation |
|---------|------------|
| IDF numerical stability | Corrected formula: `log(1 + N/df)` with round-trip verification |
| Candidate explosion | Inverted index pre-filter → top-N selection (default 50) |
| Governance ordering | Filter-then-topN (not topN-then-filter) preserves certified entries |
| Concurrent writes | Advisory file locking with 30s stale timeout |
| Memory pressure | 4096-entry cap with confidence-weighted pruning |
| Stale entries | 90-day TTL for promoted entries that have been superseded |
| Index drift | Shingle index rebuilt from corpus on prune operations |
| Catalog dirty tracking | O(1) dirty flag instead of O(N) equality check |

These invariants are codified in `tests/hardening-invariants.laws.spec.ts`.

## Source files

| File | Purpose |
|------|---------|
| `lib/domain/types/semantic-dictionary.ts` | Domain types and entry structure |
| `lib/domain/shingles.ts` | Shingle index, IDF, inverted index |
| `lib/application/semantic-translation-dictionary.ts` | Orchestration: lookup, accrual, pruning, locking |
| `lib/runtime/agent/index.ts` | Resolution ladder integration (rung 6) |
| `tests/hardening-invariants.laws.spec.ts` | Law tests for correctness invariants |
