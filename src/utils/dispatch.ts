import { isTagged, isThenable } from './inspect'

import type { Result } from '../core/result'

// Fails any assignment, and the compiler error shows the fix.
export type Hint<Fix extends string> = { readonly [K in Fix]: true }

export type TagOf<E> = E extends { readonly _tag: infer K extends string }
  ? K
  : never

export type NoExtraKeys<H, K> = {
  readonly [Key in keyof H]: Key extends K
    ? H[Key]
    : Hint<'tryck: a handler key must be ok, err or a _tag of the error'>
}

export type HandlerReturn<H> = {
  [K in keyof H]: H[K] extends (...args: never) => infer R ? R : never
}[keyof H]

export type Async<R> = Extract<R, PromiseLike<unknown>>

export type Sync<R> = Exclude<R, PromiseLike<unknown>>

export type MaybeAsyncResult =
  | Result<unknown, unknown>
  | PromiseLike<Result<unknown, unknown>>

export type IsAny<R> = 0 extends 1 & R ? true : false

export type Settled<I, V> =
  IsAny<I> extends true
    ? Promise<Awaited<V>>
    : I extends PromiseLike<unknown>
      ? Promise<Awaited<V>>
      : V

export const whenSettled = <A, B>(
  value: A | PromiseLike<A>,
  fn: (settled: A) => B
): B | Promise<B> =>
  isThenable(value) ? Promise.resolve(value).then(fn) : fn(value)

// Inherited handlers count, except Object.prototype members.
const taggedHandler = <F>(
  handlers: Readonly<Partial<Record<string, F>>>,
  tag: string
): F | undefined =>
  Object.hasOwn(handlers, tag) || !Object.hasOwn(Object.prototype, tag)
    ? handlers[tag]
    : undefined

export const handlerFor = <F, E>(
  handlers: Readonly<Partial<Record<string, F>>> & { readonly err?: F },
  error: E
): F | undefined =>
  (isTagged(error) && error._tag !== 'ok'
    ? taggedHandler(handlers, error._tag)
    : undefined) ?? handlers.err
