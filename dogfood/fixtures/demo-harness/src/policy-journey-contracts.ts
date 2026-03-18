import type { AriaRole } from 'react';

export type JourneyContractName =
  | 'journeyShell'
  | 'eligibilityStep'
  | 'policyNumberInput'
  | 'eligibilityValidation'
  | 'continueToCoverageButton'
  | 'coverageStep'
  | 'coverageTierInput'
  | 'effectiveDateInput'
  | 'coverageStateCard'
  | 'backToEligibilityButton'
  | 'continueToReviewButton'
  | 'coverageValidation'
  | 'reviewStep'
  | 'reviewSummary'
  | 'backToCoverageButton'
  | 'submitJourneyButton';

interface ContractDefinition {
  key: JourneyContractName;
  testId: string;
  role?: AriaRole;
  ariaLabel?: string;
}

const definitions: Record<JourneyContractName, ContractDefinition> = {
  journeyShell: {
    key: 'journeyShell',
    testId: 'policy-journey-shell',
    role: 'region',
    ariaLabel: 'Policy Journey Shell',
  },
  eligibilityStep: {
    key: 'eligibilityStep',
    testId: 'eligibility-step',
    role: 'region',
    ariaLabel: 'Eligibility Step',
  },
  policyNumberInput: {
    key: 'policyNumberInput',
    testId: 'journey-policy-number-input',
  },
  eligibilityValidation: {
    key: 'eligibilityValidation',
    testId: 'eligibility-validation',
    role: 'alert',
  },
  continueToCoverageButton: {
    key: 'continueToCoverageButton',
    testId: 'continue-to-coverage-button',
  },
  coverageStep: {
    key: 'coverageStep',
    testId: 'coverage-step',
    role: 'region',
    ariaLabel: 'Coverage Details Step',
  },
  coverageTierInput: {
    key: 'coverageTierInput',
    testId: 'coverage-tier-input',
  },
  effectiveDateInput: {
    key: 'effectiveDateInput',
    testId: 'effective-date-input',
  },
  coverageStateCard: {
    key: 'coverageStateCard',
    testId: 'coverage-state-card',
    role: 'region',
    ariaLabel: 'Coverage Details Status',
  },
  backToEligibilityButton: {
    key: 'backToEligibilityButton',
    testId: 'back-to-eligibility-button',
  },
  continueToReviewButton: {
    key: 'continueToReviewButton',
    testId: 'continue-to-review-button',
  },
  coverageValidation: {
    key: 'coverageValidation',
    testId: 'coverage-validation',
    role: 'alert',
  },
  reviewStep: {
    key: 'reviewStep',
    testId: 'review-step',
    role: 'region',
    ariaLabel: 'Review Summary Step',
  },
  reviewSummary: {
    key: 'reviewSummary',
    testId: 'review-summary',
    role: 'region',
    ariaLabel: 'Review Summary',
  },
  backToCoverageButton: {
    key: 'backToCoverageButton',
    testId: 'back-to-coverage-button',
  },
  submitJourneyButton: {
    key: 'submitJourneyButton',
    testId: 'submit-journey-button',
  },
};

export function contractProps(name: JourneyContractName): Record<string, string> {
  const definition = definitions[name];
  return {
    id: definition.testId,
    'data-testid': definition.testId,
    'data-contract': definition.key,
    'data-contract-screen': 'policy-journey',
    'data-contract-version': 'v1',
    'data-contract-stability': 'persistent',
    ...(definition.role ? { role: definition.role } : {}),
    ...(definition.ariaLabel ? { 'aria-label': definition.ariaLabel } : {}),
  };
}

export function contractId(name: JourneyContractName): string {
  return definitions[name].testId;
}
