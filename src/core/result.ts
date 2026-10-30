import { whenSettled } from '../utils/dispatch'

export class Ok<T> {
  readonly ok = true as const
  readonly value: T

  constructor(value: T) {
    this.value = value
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
  }

  *[Symbol.iterator](): Generator<Err<E>, never> {
    yield this
    throw new TypeError('tryck: yield* an Err only inside gen')
  }
}

export type Result<T, E> = Ok<T> | Err<E>

export type ValueOf<R> = R extends Ok<infer T> ? T : never

export type ErrorOf<R> = R extends Err<infer E> ? E : never

/** Wraps a value in a successful `Result`. */
export function ok(): Ok<void>

export function ok<T>(value: T): Ok<T>

export function ok<T>(value?: T): Ok<T | undefined> {
  return new Ok(value)
}

/** Wraps an error in a failed `Result`. */
export const err = <const E>(error: E): Err<E> => new Err(error)

/** Transforms the error of an `Err`, leaving an `Ok` untouched. */
export function mapErr<T, E, F>(
  result: PromiseLike<Result<T, E>>,
  fn: (error: E) => F
): Promise<Result<T, F>>

export function mapErr<T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => F
): Result<T, F>

export function mapErr<T, E, F>(
  result: Result<T, E> | PromiseLike<Result<T, E>>,
  fn: (error: E) => F
): Result<T, F> | Promise<Result<T, F>> {
  return whenSettled(result, (settled): Result<T, F> =>
    settled.ok ? settled : new Err(fn(settled.error))
  )
}
