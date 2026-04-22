/**
 * FormRenderer — stateful <form> wrapper realizing the
 * submitReveal axis.
 *
 * Production SUTs are predominantly forms. The substrate's
 * form surfaces mirror the dimensions that matter for probes:
 *
 *   - required fields (`aria-required`) with empty-check at submit
 *   - invalid state flag (`aria-invalid`) for field-level validation
 *   - aria-describedby linking fields to help/error text
 *   - submit-reveal behavior: success-on-required-filled / always-* /
 *     no-reveal
 *
 * ## Stateful submit
 *
 * When the form's submit button is clicked (or Enter is pressed):
 *   1. preventDefault (no page navigation).
 *   2. Walk the form's children; collect required textboxes.
 *   3. Check DOM values — any empty required → show error.
 *   4. Per submitReveal: render a role=status success message OR
 *      a role=alert error message in addition to the form's
 *      original children.
 *
 * The revealed surfaces have stable accessible names so observe
 * probes can query them via `getByRole('alert', { name: ... })`
 * after the form submits.
 */

import {
  useRef,
  useState,
  type CSSProperties,
  type FC,
  type FormEvent,
  type ReactNode,
} from 'react';
import type { SurfaceSpec } from '../../substrate/surface-spec';

export interface FormRendererProps {
  readonly spec: SurfaceSpec;
  readonly children: ReactNode;
  readonly style?: CSSProperties | undefined;
  readonly commonAttrs: Record<string, string | undefined | CSSProperties>;
}

/** Walk a SurfaceSpec tree and extract the accessible names of all
 *  required textboxes. */
function collectRequiredFieldNames(spec: SurfaceSpec): readonly string[] {
  const out: string[] = [];
  function walk(s: SurfaceSpec): void {
    if (s.role === 'textbox' && s.required === true && s.name !== undefined) {
      out.push(s.name);
    }
    if (s.children !== undefined) {
      for (const c of s.children) walk(c);
    }
  }
  walk(spec);
  return out;
}

type SubmitState = 'idle' | 'success' | 'error';

export const FormRenderer: FC<FormRendererProps> = ({ spec, children, commonAttrs }) => {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const requiredNames = collectRequiredFieldNames(spec);
  const reveal = spec.submitReveal ?? 'no-reveal';

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (reveal === 'no-reveal') return;
    if (reveal === 'always-success') {
      setSubmitState('success');
      return;
    }
    if (reveal === 'always-error') {
      setSubmitState('error');
      return;
    }
    // 'success-on-required-filled' — check DOM values
    const form = formRef.current;
    if (form === null) {
      setSubmitState('error');
      return;
    }
    let allFilled = true;
    for (const name of requiredNames) {
      const el = form.querySelector<HTMLInputElement>(
        `[data-surface-role="textbox"][data-surface-name="${CSS.escape(name)}"]`,
      );
      const value = el !== null ? el.value.trim() : '';
      if (value.length === 0) {
        allFilled = false;
        break;
      }
    }
    setSubmitState(allFilled ? 'success' : 'error');
  };

  const successLabel = spec.successMessage ?? 'Form submitted';
  const errorLabel = spec.errorMessage ?? 'Form has errors';

  // Cast style off the common attrs (may contain CSSProperties)
  const { style, ...restAttrs } = commonAttrs as unknown as {
    style?: CSSProperties;
  } & Record<string, string | undefined>;

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      {...(style !== undefined ? { style } : {})}
      {...restAttrs}
    >
      {children}
      {submitState === 'success' && (
        <div
          role="status"
          aria-label={successLabel}
          data-surface-role="status"
          data-surface-name={successLabel}
          data-submit-reveal="success"
        >
          {successLabel}
        </div>
      )}
      {submitState === 'error' && (
        <div
          role="alert"
          aria-label={errorLabel}
          data-surface-role="alert"
          data-surface-name={errorLabel}
          data-submit-reveal="error"
        >
          {errorLabel}
        </div>
      )}
    </form>
  );
};
