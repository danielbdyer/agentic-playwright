/**
 * Problem Matcher — maps Tesseract proposal bundles to VSCode diagnostics.
 *
 * Pure transformation: ProposalBundle[] → VSCodeDiagnostic[].
 * Each proposal entry becomes a diagnostic positioned at the target file.
 */

import type { ProposalBundle, ProposalEntry } from '../../domain/types/execution-context';
import type {
  VSCodeDiagnostic,
  VSCodeDiagnosticSeverity,
  VSCodeRange,
  VSCodeRelatedInformation,
} from './types';

// ─── Governance → Severity ───

function governanceToSeverity(governance: string): VSCodeDiagnosticSeverity {
  switch (governance) {
    case 'approved':
      return 'information';
    case 'review-required':
      return 'warning';
    case 'blocked':
      return 'error';
    default:
      return 'hint';
  }
}

// ─── Certification → Severity ───

function certificationToSeverity(
  certification: string,
): VSCodeDiagnosticSeverity {
  switch (certification) {
    case 'certified':
      return 'information';
    case 'pending':
      return 'warning';
    case 'rejected':
      return 'error';
    default:
      return 'hint';
  }
}

// ─── Choose the more severe of governance and certification ───

const SEVERITY_ORDER: Readonly<Record<VSCodeDiagnosticSeverity, number>> = {
  error: 0,
  warning: 1,
  information: 2,
  hint: 3,
};

function maxSeverity(
  a: VSCodeDiagnosticSeverity,
  b: VSCodeDiagnosticSeverity,
): VSCodeDiagnosticSeverity {
  return (SEVERITY_ORDER[a] ?? 3) <= (SEVERITY_ORDER[b] ?? 3) ? a : b;
}

// ─── Default range (file-level diagnostic) ───

function fileRange(): VSCodeRange {
  return {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 0 },
  };
}

// ─── Step index → range hint ───

function stepRange(stepIndex: number): VSCodeRange {
  return {
    start: { line: stepIndex, character: 0 },
    end: { line: stepIndex, character: 0 },
  };
}

// ─── Single proposal entry → diagnostic ───

function proposalEntryToDiagnostic(
  entry: ProposalEntry,
  bundle: ProposalBundle,
): VSCodeDiagnostic {
  const govSeverity = governanceToSeverity(bundle.governance);
  const certSeverity = certificationToSeverity(entry.certification);
  const severity = maxSeverity(govSeverity, certSeverity);

  const relatedInformation: readonly VSCodeRelatedInformation[] =
    entry.evidenceIds.map((evidenceId) => ({
      message: `Evidence: ${evidenceId}`,
      location: {
        uri: entry.targetPath,
        range: fileRange(),
      },
    }));

  return {
    message: `[${entry.artifactType}] ${entry.title}`,
    severity,
    range: stepRange(entry.stepIndex),
    source: 'tesseract',
    code: entry.proposalId,
    relatedInformation,
  };
}

// ─── Public API ───

/**
 * Map a single proposal bundle to diagnostics, one per entry.
 * Pure function — no side effects.
 */
export function createDiagnosticsFromBundle(
  bundle: ProposalBundle,
): readonly VSCodeDiagnostic[] {
  return bundle.payload.proposals.map((entry) =>
    proposalEntryToDiagnostic(entry, bundle),
  );
}

/**
 * Map a readonly array of proposal bundles to VSCode diagnostics.
 * Pure function — deterministic output order (bundle order × entry order).
 */
export function createProblemMatcher(
  proposals: readonly ProposalBundle[],
): readonly VSCodeDiagnostic[] {
  return proposals.flatMap(createDiagnosticsFromBundle);
}
