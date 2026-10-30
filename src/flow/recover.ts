import { handlerFor, whenSettled } from '../utils/dispatch'

import type { ErrorOf, Result, ValueOf } from '../core/result'
import type { HandlerReturn, NoExtraKeys, TagOf } from '../utils/dispatch'

type Recovery<E> = {
  readonly [K in TagOf<E>]?: (
    error: Extract<E, { readonly _tag: K }>
  ) => Result<unknown, unknown>
} & { readonly err?: (error: E) => Result<unknown, unknown> }

type Left<E, H> = 'err' extends keyof H
  ? never
  : Exclude<E, { readonly _tag: keyof H }>

type Recovered<T, E, H> = Result<
  T | ValueOf<HandlerReturn<H>>,
  Left<E, H> | ErrorOf<HandlerReturn<H>>
>

type RecoveryTable<E, U, F> = Readonly<
  Partial<Record<string, (error: E) => Result<U, F>>>
>

const recoverSettled = <T, E, U, F>(
  result: Result<T, E>,
  handlers: RecoveryTable<E, U, F>
): Result<T | U, E | F> => {
  if (result.ok) return result

  const handle = handlerFor(handlers, result.error)

  return handle ? handle(result.error) : result
}

/** Handles errors by `_tag` and removes them from the error type. */
export function recover<
  T,
  H extends NoExtraKeys<H, 'err' | TagOf<E>>,
  E = never
>(
  result: PromiseLike<Result<T, E>>,
  handlers: Recovery<E> & H
): Promise<Recovered<T, E, H>>

export function recover<
  T,
  H extends NoExtraKeys<H, 'err' | TagOf<E>>,
  E = never
>(result: Result<T, E>, handlers: Recovery<E> & H): Recovered<T, E, H>

export function recover<T, E, U, F>(
  result: Result<T, E> | PromiseLike<Result<T, E>>,
  handlers: RecoveryTable<E, U, F>
): Result<T | U, E | F> | Promise<Result<T | U, E | F>> {
  return whenSettled(result, settled => recoverSettled(settled, handlers))
}
