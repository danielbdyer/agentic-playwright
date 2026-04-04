import type { DiagnosticSeverity } from '../governance/workflow-types';

export interface ValidationDiagnostic {
  readonly code: string;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly path?: string | undefined;
}

export interface ValidationRule<T> {
  readonly validate: (input: T) => readonly ValidationDiagnostic[];
}

export function combineValidationRules<T>(...rules: readonly ValidationRule<T>[]): ValidationRule<T> {
  return { validate: (input) => rules.flatMap((rule) => rule.validate(input)) };
}

export function contramapValidationRule<A, B>(rule: ValidationRule<A>, f: (b: B) => A): ValidationRule<B> {
  return { validate: (input) => rule.validate(f(input)) };
}

export function requiredField<T>(
  key: keyof T & string,
  label?: string,
): ValidationRule<T> {
  return {
    validate: (input) => {
      const value = input[key];
      return value === null || value === undefined || value === ''
        ? [{ code: 'required', severity: 'error' as const, message: `${label ?? key} is required`, path: key }]
        : [];
    },
  };
}

export function enumField<T>(
  key: keyof T & string,
  allowed: readonly string[],
  label?: string,
): ValidationRule<T> {
  return {
    validate: (input) => {
      const value = input[key];
      return typeof value === 'string' && allowed.includes(value)
        ? []
        : [{ code: 'invalid-enum', severity: 'error' as const, message: `${label ?? key} must be one of: ${allowed.join(', ')}`, path: key }];
    },
  };
}

export function arrayNotEmpty<T>(
  key: keyof T & string,
  label?: string,
): ValidationRule<T> {
  return {
    validate: (input) => {
      const value = input[key];
      return Array.isArray(value) && value.length > 0
        ? []
        : [{ code: 'array-empty', severity: 'error' as const, message: `${label ?? key} must not be empty`, path: key }];
    },
  };
}

export function predicate<T>(
  check: (input: T) => boolean,
  diagnostic: Omit<ValidationDiagnostic, 'severity'> & { readonly severity?: DiagnosticSeverity },
): ValidationRule<T> {
  return {
    validate: (input) =>
      check(input)
        ? []
        : [{ severity: 'error' as const, ...diagnostic }],
  };
}
