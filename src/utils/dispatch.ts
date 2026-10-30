import { isTagged, isThenable } from './inspect'

import type { Result } from '../core/result'

export type TagOf<E> = E extends { readonly _tag: infer K extends string }
  ? K
  : never

export type NoExtraKeys<H, K> = {
  readonly [Key in keyof H]: Key extends K ? H[Key] : never
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

export const handlerFor = <F, E>(
  handlers: Readonly<Partial<Record<string, F>>> & { readonly err?: F },
  error: E
): F | undefined =>
  (isTagged(error) && error._tag !== 'ok' && Object.hasOwn(handlers, error._tag)
    ? handlers[error._tag]
    : undefined) ?? handlers.err
