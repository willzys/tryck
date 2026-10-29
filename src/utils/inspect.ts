export const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof value === 'object' &&
  value !== null &&
  'then' in value &&
  typeof value.then === 'function'

export const isTagged = <V>(value: V): value is V & { readonly _tag: string } =>
  typeof value === 'object' &&
  value !== null &&
  '_tag' in value &&
  typeof value._tag === 'string'

export const isSettled = <T>(
  items: readonly (T | PromiseLike<T>)[]
): items is readonly T[] => !items.some(isThenable)

export const isResult = <V>(value: V): value is V & { readonly ok: boolean } =>
  typeof value === 'object' &&
  value !== null &&
  Symbol.iterator in value &&
  'ok' in value &&
  (value.ok === true
    ? 'value' in value
    : value.ok === false && 'error' in value)
