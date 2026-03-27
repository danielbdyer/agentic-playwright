/** CompletionsPanel — recent work item completions. Organism. Memo-wrapped. */
import { memo } from 'react';

interface Completion {
  readonly workItemId: string;
  readonly status: string;
  readonly rationale: string;
}

interface CompletionsPanelProps {
  readonly completions: readonly Completion[];
}

export const CompletionsPanel = memo(function CompletionsPanel({ completions }: CompletionsPanelProps) {
  if (completions.length === 0) return null;
  return (
    <div className="card">
      <h2>Completions ({completions.length})</h2>
      {completions.slice(-8).reverse().map((c, i) => (
        <div key={i} className="lineage-entry">{c.status === 'completed' ? '\u2713' : '\u25CB'} {c.workItemId.slice(0, 8)} — {c.rationale.slice(0, 50)}</div>
      ))}
    </div>
  );
});
