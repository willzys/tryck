import { Err, Ok } from '../core/result'
import type { Result } from '../core/result'
import type { Tagged } from '../errors/tagged'
import { taggedError } from '../errors/tagged'
import { isThenable } from '../utils/inspect'

export interface Issue {
  readonly message: string
  readonly path?:
    | readonly (PropertyKey | { readonly key: PropertyKey })[]
    | undefined
}

type Validation<O> =
  | { readonly value: O; readonly issues?: undefined }
  | { readonly issues: readonly Issue[] }

export interface Schema<I, R> {
  readonly '~standard': { readonly validate: (value: I) => R }
}

type Output<R> = Extract<Awaited<R>, { readonly value: unknown }>['value']

type Synchronous<R> = [Exclude<R, PromiseLike<unknown>>] extends [never]
  ? never
  : object

/** The `Err` of `parse`, listing every schema issue. */
export interface ValidationError extends Tagged<'ValidationError'> {
  readonly issues: readonly Issue[]
}

/** The `Err` of `parse`, listing every schema issue. */
export const ValidationError: new (fields: {
  readonly issues: readonly Issue[]
  readonly message?: string
}) => ValidationError = /* @__PURE__ */ taggedError('ValidationError')

/** Validates `input` with a Standard Schema into a `Result`. */
export function parse<
  I,
  R extends Validation<unknown> | PromiseLike<Validation<unknown>>
>(
  schema: Schema<I, R> & Synchronous<R>,
  input: I
): Result<Output<R>, ValidationError>
export function parse<I, O>(
  schema: Schema<I, Validation<O> | PromiseLike<Validation<O>>>,
  input: I
): Result<O, ValidationError> {
  const outcome = schema['~standard'].validate(input)

  if (isThenable(outcome)) {
    throw new TypeError('tryck: parse takes a synchronous schema')
  }

  return outcome.issues
    ? new Err(
        new ValidationError({
          issues: outcome.issues,
          message: outcome.issues.map(issue => issue.message).join('; ')
        })
      )
    : new Ok(outcome.value)
}
