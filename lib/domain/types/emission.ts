export type EmissionTarget = 'playwright' | 'cypress' | 'selenium' | 'puppeteer' | 'custom';

export interface EmissionBackend {
  readonly target: EmissionTarget;
  readonly version: string;
  readonly fileExtension: string;
  readonly importPreamble: string;
  readonly supportsParallelSteps: boolean;
}

export interface EmissionOptions {
  readonly target: EmissionTarget;
  readonly outputDir: string;
  readonly includeTraceJson: boolean;
  readonly includeReviewMd: boolean;
  readonly typeCheckOutput: boolean;
}

export interface EmittedArtifact {
  readonly kind: 'emitted-spec' | 'emitted-trace' | 'emitted-review';
  readonly target: EmissionTarget;
  readonly path: string;
  readonly content: string;
  readonly fingerprint: string;
}

export interface EmissionManifest {
  readonly kind: 'emission-manifest';
  readonly version: 1;
  readonly target: EmissionTarget;
  readonly generatedAt: string;
  readonly artifacts: readonly EmittedArtifact[];
  readonly summary: EmissionSummary;
}

export interface EmissionSummary {
  readonly totalSpecs: number;
  readonly totalSteps: number;
  readonly targetFramework: string;
  readonly averageStepsPerSpec: number;
}
