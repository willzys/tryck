import { whenSettled } from '../utils/dispatch'

import type { Async, Hint, MaybeAsyncResult, Settled } from '../utils/dispatch'

type SyncCallback<F> = [Async<F>] extends [never]
  ? unknown
  : Hint<'tryck: mapErr takes a synchronous callback; await the result and map it afterwards'>

export class Ok<T> {
  readonly ok = true as const
  readonly value: T

  constructor(value: T) {
    this.value = value
    Object.freeze(this)
  }

  *[Symbol.iterator](): Generator<never, T> {
    return this.value
  }
}

export class Err<E> {
  readonly ok = false as const
  readonly error: E

  constructor(error: E) {
    this.error = error
    Object.freeze(this)
  }

  *[Symbol.iterator](): Generator<Err<E>, never> {
    yield this
    throw new TypeError(
      'tryck: yield* an Err only inside gen; wrap the body in gen'
    )
  }
}

export type Result<T, E> = Ok<T> | Err<E>

export type ValueOf<R> = R extends Ok<infer T> ? T : never

export type ErrorOf<R> = R extends Err<infer E> ? E : never

/**
 * Wraps a value in a successful `Result`.
 *
 * @example
 * const checkAge = (age: number): Result<number, 'underage'> =>
 *   age >= 18 ? ok(age) : err('underage')
 */

export function ok(): Ok<void>

export function ok<T>(value: T): Ok<T>

export function ok<T>(value?: T): Ok<T | undefined> {
  return new Ok(value)
}

/**
 * Wraps an error in a failed `Result`.
 *
 * @example
 * const found = (user: User | undefined) =>
 *   user ? ok(user) : err(new NotFound({ id }))
 */

export const err = <const E>(error: E): Err<E> => new Err(error)

/**
 * Transforms the error of an `Err`, leaving an `Ok` untouched.
 *
 * @example
 * await mapErr(findUser(id), cause => new Unauthorized({ cause })) // Result<User, Unauthorized>
 */

export function mapErr<Input extends MaybeAsyncResult, F>(
  result: Input,
  fn: (error: ErrorOf<Awaited<Input>>) => F & SyncCallback<F>
): Settled<Input, Result<ValueOf<Awaited<Input>>, F>>

export function mapErr<T, E, F>(
  result: Result<T, E> | PromiseLike<Result<T, E>>,
  fn: (error: E) => F
): Result<T, F> | Promise<Result<T, F>> {
  return whenSettled(result, (settled): Result<T, F> =>
    settled.ok === true ? settled : new Err(fn(settled.error))
  )
}
