import { Err, Ok } from '../core/result'
import { whenSettled } from '../utils/dispatch'
import { isThenable } from '../utils/inspect'

import type { Result } from '../core/result'

export type Catchable = abstract new (...args: never) => Error

export type Translation = new (fields: { readonly cause: Error }) => Error

export interface Guard<E extends Error> {
  readonly [Symbol.hasInstance]: (value: unknown) => value is E
}

export type Catch =
  | Catchable
  | Guard<Error>
  | readonly [Catchable | Guard<Error>, Translation]

export type Catches = readonly [Catch, ...Catch[]]

type Instance<C> =
  C extends Guard<infer E extends Error>
    ? E
    : C extends Catchable
      ? InstanceType<C>
      : never

type CaughtBy<C> = C extends readonly [unknown, infer T extends Translation]
  ? InstanceType<T>
  : Instance<C>

export type Caught<C extends Catches> = CaughtBy<C[number]>

type Async<R> = Extract<R, PromiseLike<unknown>>

type Sync<R> = Exclude<R, PromiseLike<unknown>>

export type Attempted<R, E> = 0 extends 1 & R
  ? Result<R, E>
  : unknown extends R
    ? Result<R, E> | Promise<Result<R, E>>
    : [Async<R>] extends [never]
      ? Result<R, E>
      : [Sync<R>] extends [never]
        ? Promise<Result<Awaited<R>, E>>
        : Result<Sync<R>, E> | Promise<Result<Awaited<Async<R>>, E>>

const isTranslation = (
  entry: Catch
): entry is readonly [Catchable | Guard<Error>, Translation] =>
  Array.isArray(entry)

const isCaught = (
  cause: unknown,
  type: Catchable | Guard<Error>
): cause is Error => cause instanceof type

const translate = (catches: Catches, cause: unknown): Error => {
  for (const entry of catches) {
    const [type, Into] = isTranslation(entry) ? entry : [entry]

    if (isCaught(cause, type)) return Into ? new Into({ cause }) : cause
  }

  throw cause
}

/** Catches a class only when `test` passes. */
export function when<C extends Catchable>(
  type: C,
  test: (error: InstanceType<C>) => boolean
): Guard<InstanceType<C>>
export function when(
  type: Catchable,
  test: (error: Error) => boolean
): Guard<Error> {
  return {
    [Symbol.hasInstance]: (value: unknown): value is Error =>
      value instanceof type && test(value)
  }
}

/** Runs `fn`, turning the listed error classes into an `Err`. */
export function attempt<R, const C extends Catches>(
  fn: () => R,
  ...catches: C
): Attempted<R, Caught<C>>
export function attempt<R>(
  fn: () => R,
  ...catches: Catches
): Result<R, Error> | Promise<Result<Awaited<R>, Error>> {
  const fail = (cause: unknown): Err<Error> =>
    new Err(translate(catches, cause))

  try {
    const value = fn()

    return isThenable(value)
      ? Promise.resolve(value).then(resolved => new Ok(resolved), fail)
      : new Ok(value)
  } catch (error) {
    return fail(error)
  }
}

/** Wraps `fn` once so every call goes through `attempt`. */
export const safe =
  <A extends readonly unknown[], R, const C extends Catches>(
    fn: (...args: A) => R,
    ...catches: C
  ): ((...args: A) => Attempted<R, Caught<C>>) =>
  (...args) =>
    attempt(() => fn(...args), ...catches)

/** Returns the value of an `Ok` or throws the error of an `Err`. */
export function unwrap<T, E>(result: PromiseLike<Result<T, E>>): Promise<T>
/** Returns the value of an `Ok` or throws the error of an `Err`. */
export function unwrap<T, E>(result: Result<T, E>): T
export function unwrap<T, E>(
  result: Result<T, E> | PromiseLike<Result<T, E>>
): T | Promise<T> {
  return whenSettled(result, (settled): T => {
    if (settled.ok) return settled.value
    throw settled.error
  })
}
