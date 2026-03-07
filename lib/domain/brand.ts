export type Brand<T, Name extends string> = T & { readonly __brand: Name };

export function brandString<Name extends string>(value: string): Brand<string, Name> {
  return value as Brand<string, Name>;
}

