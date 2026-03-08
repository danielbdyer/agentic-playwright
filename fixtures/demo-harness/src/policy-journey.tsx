import type { ReactNode } from 'react';
import { useReducer } from 'react';
import { createRoot } from 'react-dom/client';
import { contractId, contractProps } from './policy-journey-contracts';
import { createFuzzProfile } from './policy-journey-fuzz';

type StepId = 'eligibility' | 'coverage' | 'review';
type CoverageTier = 'standard' | 'premium';

interface PolicyRecord {
  number: string;
  carrier: string;
  status: string;
  market: string;
}

interface TierDescriptor {
  id: CoverageTier;
  label: string;
  guidance: string;
}

interface JourneyValues {
  policyNumber: string;
  coverageTier: string;
  effectiveDate: string;
}

interface JourneyState {
  step: StepId;
  values: JourneyValues;
  eligibilityError: string | null;
  coverageError: string | null;
  returnNotice: string | null;
  submitted: boolean;
}

type JourneyAction =
  | { type: 'policy-number-changed'; value: string }
  | { type: 'coverage-tier-changed'; value: string }
  | { type: 'effective-date-changed'; value: string }
  | { type: 'continue-to-coverage' }
  | { type: 'continue-to-review' }
  | { type: 'back-to-eligibility' }
  | { type: 'back-to-coverage' }
  | { type: 'submit' };

const policies: Record<string, PolicyRecord> = {
  'POL-001': {
    number: 'POL-001',
    carrier: 'Harbor Mutual',
    status: 'Active',
    market: 'Commercial Inland',
  },
  'POL-777': {
    number: 'POL-777',
    carrier: 'Cinder Transit',
    status: 'Pending Renewal',
    market: 'Regional Fleet',
  },
};

const tierDescriptors: Record<CoverageTier, TierDescriptor> = {
  standard: {
    id: 'standard',
    label: 'Standard',
    guidance: 'Balanced coverage for repeatable dogfood runs.',
  },
  premium: {
    id: 'premium',
    label: 'Premium',
    guidance: 'Broader coverage for drift and reversal scenarios.',
  },
};

const calloutDefinitions = [
  {
    eyebrow: 'Contract layer',
    title: 'Persistent semantics',
    body: 'Critical controls keep stable contracts while surrounding chrome drifts by seed.',
  },
  {
    eyebrow: 'Flow layer',
    title: 'Finite-state journey',
    body: 'Validation, progression, and reversal all stay inspectable from the DOM alone.',
  },
  {
    eyebrow: 'Benchmark layer',
    title: 'Fuzz with evidence',
    body: 'Wrapper depth, badge order, and callout placement vary without breaking agent legibility.',
  },
] as const;

function isCalloutDefinition(
  value: (typeof calloutDefinitions)[number] | undefined,
): value is (typeof calloutDefinitions)[number] {
  return value !== undefined;
}

function normalizePolicyNumber(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeTier(value: string): string {
  return value.trim().toLowerCase();
}

function validateEligibility(policyNumber: string): string | null {
  const normalized = normalizePolicyNumber(policyNumber);
  if (!normalized) {
    return 'Enter a policy number before continuing.';
  }
  if (!policies[normalized]) {
    return 'Policy number must resolve to an approved journey policy.';
  }
  return null;
}

function validateCoverage(values: JourneyValues): string | null {
  const tier = normalizeTier(values.coverageTier);
  if (!tier) {
    return 'Enter a coverage tier before continuing.';
  }
  if (!(tier in tierDescriptors)) {
    return 'Coverage tier must be Standard or Premium.';
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.effectiveDate.trim())) {
    return 'Effective date must use YYYY-MM-DD format.';
  }
  return null;
}

function resolveInitialStep(values: JourneyValues, requestedStep: string | null): StepId {
  const requested = requestedStep === 'review' || requestedStep === 'coverage' ? requestedStep : 'eligibility';
  const eligibilityError = validateEligibility(values.policyNumber);
  if (requested === 'eligibility' || eligibilityError) {
    return 'eligibility';
  }
  const coverageError = validateCoverage(values);
  if (requested === 'review' && !coverageError) {
    return 'review';
  }
  return 'coverage';
}

function createInitialState(search: string): JourneyState {
  const params = new URLSearchParams(search);
  const values: JourneyValues = {
    policyNumber: params.get('policy') ?? '',
    coverageTier: params.get('tier') ?? '',
    effectiveDate: params.get('effective') ?? '',
  };
  const requestedStep = params.get('start');
  const step = resolveInitialStep(values, requestedStep);
  const seededBeyondEligibility = requestedStep === 'coverage' || requestedStep === 'review';
  const seededCoverageValues = values.coverageTier.trim().length > 0 || values.effectiveDate.trim().length > 0;
  const returnNotice = params.get('resume') === 'coverage-return'
    ? 'Returned from review without losing the selected coverage.'
    : null;

  return {
    step,
    values,
    eligibilityError: seededBeyondEligibility || values.policyNumber.trim().length > 0
      ? validateEligibility(values.policyNumber)
      : null,
    coverageError: seededBeyondEligibility || seededCoverageValues
      ? validateCoverage(values)
      : null,
    returnNotice,
    submitted: false,
  };
}

function reducer(state: JourneyState, action: JourneyAction): JourneyState {
  switch (action.type) {
    case 'policy-number-changed': {
      const values = { ...state.values, policyNumber: action.value };
      return {
        ...state,
        values,
        eligibilityError: validateEligibility(values.policyNumber),
        submitted: false,
      };
    }
    case 'coverage-tier-changed': {
      const values = { ...state.values, coverageTier: action.value };
      return {
        ...state,
        values,
        coverageError: state.step === 'coverage' || state.step === 'review' ? validateCoverage(values) : null,
        submitted: false,
      };
    }
    case 'effective-date-changed': {
      const values = { ...state.values, effectiveDate: action.value };
      return {
        ...state,
        values,
        coverageError: state.step === 'coverage' || state.step === 'review' ? validateCoverage(values) : null,
        submitted: false,
      };
    }
    case 'continue-to-coverage': {
      const eligibilityError = validateEligibility(state.values.policyNumber);
      if (eligibilityError) {
        return {
          ...state,
          step: 'eligibility',
          eligibilityError,
          submitted: false,
        };
      }
      return {
        ...state,
        step: 'coverage',
        eligibilityError: null,
        coverageError: validateCoverage(state.values),
        returnNotice: null,
        submitted: false,
      };
    }
    case 'continue-to-review': {
      const coverageError = validateCoverage(state.values);
      if (coverageError) {
        return {
          ...state,
          step: 'coverage',
          coverageError,
          submitted: false,
        };
      }
      return {
        ...state,
        step: 'review',
        coverageError: null,
        submitted: false,
      };
    }
    case 'back-to-eligibility':
      return {
        ...state,
        step: 'eligibility',
        eligibilityError: validateEligibility(state.values.policyNumber),
        returnNotice: 'Returned to eligibility with the selected policy still staged.',
        submitted: false,
      };
    case 'back-to-coverage':
      return {
        ...state,
        step: 'coverage',
        coverageError: validateCoverage(state.values),
        returnNotice: 'Returned from review without losing the selected coverage.',
        submitted: false,
      };
    case 'submit':
      return {
        ...state,
        step: 'review',
        submitted: true,
      };
  }
}

function wrapperize(children: ReactNode, depth: number): ReactNode {
  let current = children;
  for (let index = 0; index < depth; index += 1) {
    current = (
      <div className={`fuzz-shell fuzz-shell-${index + 1}`} data-fuzz-layer={String(index + 1)}>
        {current}
      </div>
    );
  }
  return current;
}

function JourneyApp() {
  const search = typeof window === 'undefined' ? '' : window.location.search;
  const seed = typeof window === 'undefined'
    ? 'policy-journey'
    : new URLSearchParams(search).get('seed') ?? 'policy-journey';
  const fuzz = createFuzzProfile(seed);
  const [state, dispatch] = useReducer(reducer, search, createInitialState);
  const policy = policies[normalizePolicyNumber(state.values.policyNumber)] ?? null;
  const normalizedTier = normalizeTier(state.values.coverageTier);
  const coverageTier = (normalizedTier in tierDescriptors
    ? tierDescriptors[normalizedTier as CoverageTier]
    : null);
  const orderedCallouts = fuzz.calloutOrder.map((index) => calloutDefinitions[index]).filter(isCalloutDefinition);
  const shellClassName = [
    'journey-shell',
    `tone-${fuzz.chromeTone}`,
    `density-${fuzz.density}`,
  ].join(' ');

  return (
    <main className="journey-page" data-fuzz-seed={seed}>
      <header className="hero-panel">
        <p className="hero-kicker">Dogfood Harness</p>
        <h1>Policy Journey</h1>
        <p className="hero-copy">
          React-powered journey screen with stable semantic contracts, seeded DOM drift,
          and reversible state transitions.
        </p>
        <div className="badge-row" aria-label="Harness traits">
          {fuzz.badgeLabels.map((label) => (
            <span key={label} className="badge-chip">
              {label}
            </span>
          ))}
        </div>
      </header>

      <div className="callout-grid" aria-label="Journey capabilities">
        {orderedCallouts.map((callout) => (
          <article key={callout.title} className="callout-card">
            <p className="callout-eyebrow">{callout.eyebrow}</p>
            <h2>{callout.title}</h2>
            <p>{callout.body}</p>
          </article>
        ))}
      </div>

      {wrapperize(
        <section className={shellClassName} {...contractProps('journeyShell')}>
          <div className="progress-rail" aria-label="Journey progress">
            <span className={state.step === 'eligibility' ? 'progress-pill is-active' : 'progress-pill'}>Eligibility</span>
            <span className={state.step === 'coverage' ? 'progress-pill is-active' : 'progress-pill'}>Coverage</span>
            <span className={state.step === 'review' ? 'progress-pill is-active' : 'progress-pill'}>Review</span>
          </div>

          <div className="step-layout">
            <section
              className={state.step === 'eligibility' ? 'step-card is-active' : 'step-card is-hidden'}
              hidden={state.step !== 'eligibility'}
              aria-hidden={state.step !== 'eligibility'}
              {...contractProps('eligibilityStep')}
            >
              <div className="step-copy">
                <p className="step-label">Step 1</p>
                <h2>Confirm the policy context</h2>
                <p>Stable controls stay fixed even when wrapper depth and peripheral chrome change.</p>
              </div>

              <label className="field-stack" htmlFor={contractId('policyNumberInput')}>
                <span>Policy Number</span>
                <input
                  {...contractProps('policyNumberInput')}
                  aria-invalid={state.eligibilityError ? 'true' : 'false'}
                  autoComplete="off"
                  className="text-field"
                  onChange={(event) => dispatch({ type: 'policy-number-changed', value: event.target.value })}
                  type="text"
                  value={state.values.policyNumber}
                />
              </label>

              <div
                className={state.eligibilityError ? 'validation-panel is-visible' : 'validation-panel'}
                hidden={!state.eligibilityError}
                {...contractProps('eligibilityValidation')}
              >
                {state.eligibilityError}
              </div>

              {state.returnNotice ? <p className="return-note">{state.returnNotice}</p> : null}

              <div className="action-row">
                <button
                  {...contractProps('continueToCoverageButton')}
                  className="primary-button"
                  onClick={() => dispatch({ type: 'continue-to-coverage' })}
                  type="button"
                >
                  Continue to Coverage
                </button>
              </div>
            </section>

            <section
              className={state.step === 'coverage' ? 'step-card is-active' : 'step-card is-hidden'}
              hidden={state.step !== 'coverage'}
              aria-hidden={state.step !== 'coverage'}
              {...contractProps('coverageStep')}
            >
              <div className="step-copy">
                <p className="step-label">Step 2</p>
                <h2>Set coverage details</h2>
                <p>Coverage remains legible after backtracking so generated tests can verify retention.</p>
              </div>

              <div className="field-grid">
                <label className="field-stack" htmlFor={contractId('coverageTierInput')}>
                  <span>Coverage Tier</span>
                  <input
                    {...contractProps('coverageTierInput')}
                    aria-invalid={state.coverageError ? 'true' : 'false'}
                    autoComplete="off"
                    className="text-field"
                    onChange={(event) => dispatch({ type: 'coverage-tier-changed', value: event.target.value })}
                    placeholder="Standard or Premium"
                    type="text"
                    value={state.values.coverageTier}
                  />
                </label>

                <label className="field-stack" htmlFor={contractId('effectiveDateInput')}>
                  <span>Effective Date</span>
                  <input
                    {...contractProps('effectiveDateInput')}
                    aria-invalid={state.coverageError ? 'true' : 'false'}
                    className="text-field"
                    onChange={(event) => dispatch({ type: 'effective-date-changed', value: event.target.value })}
                    placeholder="YYYY-MM-DD"
                    type="text"
                    value={state.values.effectiveDate}
                  />
                </label>
              </div>

              <div className="status-card" {...contractProps('coverageStateCard')}>
                <p className="status-kicker">Coverage Details Status</p>
                <dl className="summary-grid">
                  <div>
                    <dt>Policy</dt>
                    <dd>{policy ? `${policy.number} / ${policy.carrier}` : 'Awaiting valid policy'}</dd>
                  </div>
                  <div>
                    <dt>Tier</dt>
                    <dd>{coverageTier ? coverageTier.label : 'Awaiting tier'}</dd>
                  </div>
                  <div>
                    <dt>Effective Date</dt>
                    <dd>{state.values.effectiveDate.trim() || 'Awaiting effective date'}</dd>
                  </div>
                  <div>
                    <dt>Journey Posture</dt>
                    <dd>{state.returnNotice ? 'Reversed with retention' : 'Forward progression'}</dd>
                  </div>
                </dl>
                <p className="status-guidance">
                  {coverageTier?.guidance ?? 'Coverage state becomes review-ready once the tier and date validate.'}
                </p>
                {state.returnNotice ? <p className="return-note">{state.returnNotice}</p> : null}
              </div>

              <div
                className={state.coverageError ? 'validation-panel is-visible' : 'validation-panel'}
                hidden={!state.coverageError}
                {...contractProps('coverageValidation')}
              >
                {state.coverageError}
              </div>

              <div className="action-row">
                <button
                  {...contractProps('backToEligibilityButton')}
                  className="secondary-button"
                  onClick={() => dispatch({ type: 'back-to-eligibility' })}
                  type="button"
                >
                  Back to Eligibility
                </button>
                <button
                  {...contractProps('continueToReviewButton')}
                  className="primary-button"
                  onClick={() => dispatch({ type: 'continue-to-review' })}
                  type="button"
                >
                  Continue to Review
                </button>
              </div>
            </section>

            <section
              className={state.step === 'review' ? 'step-card is-active' : 'step-card is-hidden'}
              hidden={state.step !== 'review'}
              aria-hidden={state.step !== 'review'}
              {...contractProps('reviewStep')}
            >
              <div className="step-copy">
                <p className="step-label">Step 3</p>
                <h2>Review the journey slice</h2>
                <p>The review region provides a compact assertion target for large-suite prioritization.</p>
              </div>

              <div className="review-summary" {...contractProps('reviewSummary')}>
                <p className="status-kicker">Review Summary</p>
                <ul className="review-list">
                  <li>
                    <strong>Policy:</strong> {policy ? `${policy.number} / ${policy.carrier}` : 'Unresolved'}
                  </li>
                  <li>
                    <strong>Status:</strong> {policy ? `${policy.status} / ${policy.market}` : 'Awaiting eligibility'}
                  </li>
                  <li>
                    <strong>Coverage tier:</strong> {coverageTier ? coverageTier.label : 'Awaiting coverage'}
                  </li>
                  <li>
                    <strong>Effective date:</strong> {state.values.effectiveDate.trim() || 'Awaiting date'}
                  </li>
                  <li>
                    <strong>Submission:</strong> {state.submitted ? 'Ready for downstream orchestration' : 'Pending final confirmation'}
                  </li>
                </ul>
              </div>

              <div className="action-row">
                <button
                  {...contractProps('backToCoverageButton')}
                  className="secondary-button"
                  onClick={() => dispatch({ type: 'back-to-coverage' })}
                  type="button"
                >
                  Back to Coverage
                </button>
                <button
                  {...contractProps('submitJourneyButton')}
                  className="primary-button"
                  onClick={() => dispatch({ type: 'submit' })}
                  type="button"
                >
                  Submit Journey
                </button>
              </div>
            </section>
          </div>
        </section>,
        fuzz.wrapperDepth,
      )}
    </main>
  );
}

const mountNode = document.getElementById('app');

if (!mountNode) {
  throw new Error('Missing #app mount node for policy journey harness');
}

createRoot(mountNode).render(<JourneyApp />);
