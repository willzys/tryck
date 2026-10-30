import { handlerFor, whenSettled } from '../utils/dispatch'

import type { Result } from '../core/result'
import type { Only, TagOf } from '../utils/dispatch'

type Handler<V, R> = (value: V) => R

type ByTag<E, R> = {
  readonly [K in TagOf<E>]: Handler<Extract<E, { readonly _tag: K }>, R>
}

type Exhaustive<E, R> = ByTag<E, R> & { readonly err?: never }

type Fallback<E, R> = Partial<ByTag<E, R>> & { readonly err: Handler<E, R> }

type ErrHandlers<E, R> = [E] extends [{ readonly _tag: string }]
  ? Exhaustive<E, R> | Fallback<E, R>
  : Fallback<E, R>

interface OkHandler<T, R> {
  readonly ok: Handler<T, R>
}

export type Handlers<T, E, R> = OkHandler<T, R> & ErrHandlers<E, R>

type Returned<H> = {
  [K in keyof H]: H[K] extends Handler<never, infer R> ? R : never
}[keyof H]

interface MatchTable<V, R> {
  readonly ok: Handler<V, R>
  readonly err?: Handler<V, R>
  readonly [tag: string]: Handler<V, R> | undefined
}

const matchSettled = <T, E, R>(
  result: Result<T, E>,
  handlers: MatchTable<T | E, R>
): R => {
  if (result.ok) return handlers.ok(result.value)

  const handle = handlerFor(handlers, result.error)

  if (!handle) throw new TypeError('tryck: unhandled error')

  return handle(result.error)
}

/** Folds a `Result` into one value, with a handler per outcome. */
export function match<T, H extends Only<H, 'ok' | 'err' | TagOf<E>>, E = never>(
  result: PromiseLike<Result<T, E>>,
  handlers: Handlers<T, E, unknown> & H
): Promise<Awaited<Returned<H>>>
/** Folds a `Result` into one value, with a handler per outcome. */
export function match<T, H extends Only<H, 'ok' | 'err' | TagOf<E>>, E = never>(
  result: Result<T, E>,
  handlers: Handlers<T, E, unknown> & H
): Returned<H>
export function match<T, E, R>(
  result: Result<T, E> | PromiseLike<Result<T, E>>,
  handlers: MatchTable<T | E, R>
): R | Promise<R> {
  return whenSettled(result, settled => matchSettled(settled, handlers))
}
