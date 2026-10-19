/**
 * Automation association: marking a Test Case work item as automated by an
 * emitted spec, so the test plan shows it as automated and results line up
 * with the test that produced them.
 *
 * The write bumps the case's System.Rev. Re-authoring is keyed on the content
 * hash (testcase.ts), which excludes the revision, so this write never makes a
 * case look changed.
 */
import { sha256Hex } from '../core/hash.js';

export const AUTOMATED_TEST_TYPE = 'Playwright';

export interface JsonPatchOperation {
  readonly op: 'add' | 'replace' | 'remove' | 'test';
  readonly path: string;
  readonly value?: unknown;
}

/**
 * A stable GUID for a test case: sha256 of a namespaced case id, laid out as
 * an RFC 9562 version-8 (custom) UUID. The same case always gets the same id,
 * on any machine, so re-association is a no-op in substance.
 */
export const automatedTestId = (testCaseId: string): string => {
  const hex = sha256Hex(`tesseract-qa:ado-test-case:${testCaseId}`).slice(0, 32);
  const variant = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  const bits = `${hex.slice(0, 12)}8${hex.slice(13, 16)}${variant}${hex.slice(17, 32)}`;
  return `${bits.slice(0, 8)}-${bits.slice(8, 12)}-${bits.slice(12, 16)}-${bits.slice(16, 20)}-${bits.slice(20, 32)}`;
};

export interface AutomationAssociation {
  readonly testCaseId: string;
  /** The spec's test title, as Playwright reports it. */
  readonly testName: string;
  /** Where the test lives; the spec path relative to the repository root by default. */
  readonly storage: string;
}

/**
 * json-patch for PATCH _apis/wit/workitems/{id} (Content-Type
 * application/json-patch+json). AutomationStatus is not written: Azure DevOps
 * derives "Automated" from AutomatedTestName being set, and on some processes
 * the field is read-only, which would fail the whole patch.
 */
export const automationPatch = (association: AutomationAssociation): readonly JsonPatchOperation[] => [
  { op: 'add', path: '/fields/Microsoft.VSTS.TCM.AutomatedTestName', value: association.testName },
  { op: 'add', path: '/fields/Microsoft.VSTS.TCM.AutomatedTestStorage', value: association.storage },
  { op: 'add', path: '/fields/Microsoft.VSTS.TCM.AutomatedTestId', value: automatedTestId(association.testCaseId) },
  { op: 'add', path: '/fields/Microsoft.VSTS.TCM.AutomatedTestType', value: AUTOMATED_TEST_TYPE },
];
