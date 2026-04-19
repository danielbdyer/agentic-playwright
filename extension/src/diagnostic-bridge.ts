/**
 * Diagnostic Bridge — maps domain problem-matcher output to real VSCode diagnostics.
 *
 * The pure domain layer (product/instruments/vscode/problem-matcher.ts) produces
 * VSCodeDiagnostic value objects. This bridge maps them to vscode.Diagnostic
 * instances in a real DiagnosticCollection.
 */

import * as vscode from 'vscode';
import { createProblemMatcher } from '../../product/instruments/vscode/problem-matcher';
import type { VSCodeDiagnostic, VSCodeDiagnosticSeverity } from '../../product/instruments/vscode/types';
import type { ArtifactSnapshot } from './artifact-loader';

const SEVERITY_MAP: Readonly<Record<VSCodeDiagnosticSeverity, vscode.DiagnosticSeverity>> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  information: vscode.DiagnosticSeverity.Information,
  hint: vscode.DiagnosticSeverity.Hint,
};

function toVscodeDiagnostic(d: VSCodeDiagnostic): vscode.Diagnostic {
  const range = new vscode.Range(
    d.range.start.line,
    d.range.start.character,
    d.range.end.line,
    d.range.end.character,
  );

  const diagnostic = new vscode.Diagnostic(range, d.message, SEVERITY_MAP[d.severity]);
  diagnostic.source = d.source;
  diagnostic.code = d.code;

  if (d.relatedInformation.length > 0) {
    diagnostic.relatedInformation = d.relatedInformation.map((info) => {
      const uri = vscode.Uri.file(info.location.uri);
      const loc = new vscode.Location(
        uri,
        new vscode.Range(
          info.location.range.start.line,
          info.location.range.start.character,
          info.location.range.end.line,
          info.location.range.end.character,
        ),
      );
      return new vscode.DiagnosticRelatedInformation(loc, info.message);
    });
  }

  return diagnostic;
}

export class TesseractDiagnosticBridge {
  private readonly collection: vscode.DiagnosticCollection;

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection('tesseract');
  }

  update(snapshot: ArtifactSnapshot): void {
    this.collection.clear();

    const domainDiagnostics = createProblemMatcher(snapshot.proposals);

    // Group diagnostics by target file (code field often contains the proposal ID,
    // but the actual file comes from the related information or we use a workspace-level uri)
    const byFile = new Map<string, vscode.Diagnostic[]>();

    for (const d of domainDiagnostics) {
      // Use the first related information location as the file, or fall back to workspace root
      const filePath = d.relatedInformation.length > 0
        ? d.relatedInformation[0]!.location.uri
        : '.tesseract/inbox/index.json';

      const existing = byFile.get(filePath);
      const vscodeDiag = toVscodeDiagnostic(d);
      if (existing) {
        existing.push(vscodeDiag);
      } else {
        byFile.set(filePath, [vscodeDiag]);
      }
    }

    for (const [filePath, diagnostics] of byFile) {
      const uri = vscode.Uri.file(filePath);
      this.collection.set(uri, diagnostics);
    }
  }

  dispose(): void {
    this.collection.dispose();
  }
}
