import { isTagged, isThenable } from './inspect'

export type TagOf<E> = E extends { readonly _tag: infer K extends string }
  ? K
  : never

export type Only<H, K> = {
  readonly [Key in keyof H]: Key extends K ? H[Key] : never
}

export const whenSettled = <A, B>(
  value: A | PromiseLike<A>,
  fn: (settled: A) => B
): B | Promise<B> =>
  isThenable(value) ? Promise.resolve(value).then(fn) : fn(value)

export const handlerFor = <F, E>(
  handlers: Readonly<Partial<Record<string, F>>> & { readonly err?: F },
  error: E
): F | undefined =>
  (isTagged(error) && error._tag !== 'ok' && Object.hasOwn(handlers, error._tag)
    ? handlers[error._tag]
    : undefined) ?? handlers.err
