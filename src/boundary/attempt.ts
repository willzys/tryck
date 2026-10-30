import { Err, Ok } from '../core/result'
import { whenSettled } from '../utils/dispatch'
import { isThenable } from '../utils/inspect'

import type { Result, ValueOf } from '../core/result'
import type {
  Async,
  IsAny,
  MaybeAsyncResult,
  Settled,
  Sync
} from '../utils/dispatch'

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

type IsUnknown<R> = unknown extends R ? true : false

export type Attempted<R, E> =
  IsAny<R> extends true
    ? Result<R, E>
    : IsUnknown<R> extends true
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

const chain = (error: Error, cause: Error): Error => {
  if (!('cause' in error)) {
    Object.defineProperty(error, 'cause', {
      configurable: true,
      value: cause,
      writable: true
    })
  }

  return error
}

/**
 * Catches a class only when `test` passes.
 *
 * @example
 * const taken = when(DbError, failure => failure.code === 'unique')
 * await attempt(() => insertUser(fields), [taken, EmailTaken]) // Result<User, EmailTaken>
 */

export function when<C extends Catchable>(
  type: C,
  test: (error: InstanceType<C>) => boolean
): Guard<InstanceType<C>>

export function when(
  type: Catchable,
  test: (error: Error) => boolean
): Guard<Error> {
  return {
    [Symbol.hasInstance]: (value: unknown): value is Error => {
      if (!(value instanceof type)) return false

      // A throwing check is a defect; keep the inspected error as cause.
      try {
        return test(value)
      } catch (error) {
        throw error instanceof Error ? chain(error, value) : error
      }
    }
  }
}

/**
 * Runs `fn`, turning the listed error classes into an `Err`.
 * Anything else keeps throwing.
 *
 * @example
 * attempt(() => JSON.parse(text), [SyntaxError, InvalidJson]) // Result<any, InvalidJson>
 * // JSON.parse returns any: pass the value through parse(schema, value) to type it
 */

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

/**
 * Wraps `fn` once so every call goes through `attempt`.
 *
 * @example
 * const parseJson = safe(JSON.parse, [SyntaxError, InvalidJson])
 * parseJson('{') // Err<InvalidJson>
 */

export const safe = <
  A extends readonly unknown[],
  R,
  const C extends Catches,
  This = void
>(
  fn: (this: This, ...args: A) => R,
  ...catches: C
): ((this: This, ...args: A) => Attempted<R, Caught<C>>) =>
  // A function, not an arrow, so methods keep their this.
  function guarded(this: This, ...args) {
    return attempt(() => fn.call(this, ...args), ...catches)
  }

/**
 * Returns the value of an `Ok` or throws the error of an `Err`.
 *
 * @example
 * const user = await unwrap(findUser(id)) // User, or throws NotFound
 */

export function unwrap<Input extends MaybeAsyncResult>(
  result: Input
): Settled<Input, ValueOf<Awaited<Input>>>

export function unwrap<T, E>(
  result: Result<T, E> | PromiseLike<Result<T, E>>
): T | Promise<T> {
  return whenSettled(result, (settled): T => {
    if (settled.ok === true) return settled.value
    throw settled.error
  })
}
