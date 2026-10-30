import { Err, Ok } from '../core/result'
import { taggedError } from '../errors/tagged'
import { isThenable } from '../utils/inspect'

import type { Result } from '../core/result'
import type { Tagged } from '../errors/tagged'
import type { Hint, Sync } from '../utils/dispatch'

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

type RejectAsync<R> = [Sync<R>] extends [never]
  ? Hint<'tryck: parse takes a schema that validates synchronously'>
  : object

/** The `Err` of `parse`, listing every schema issue. */
export interface ValidationError extends Tagged<'ValidationError'> {
  readonly issues: readonly Issue[]
}

/**
 * The `Err` of `parse`, listing every schema issue.
 *
 * @example
 * match(parse(Signup, body), {
 *   ok: () => 201,
 *   ValidationError: error => error.issues.map(issue => issue.message)
 * })
 */

export const ValidationError: new (fields: {
  readonly issues: readonly Issue[]
  readonly message?: string
}) => ValidationError = /* @__PURE__ */ taggedError('ValidationError')

/**
 * Validates `input` with a Standard Schema (Zod, Valibot, ArkType) into a
 * `Result`.
 *
 * @example
 * const Signup = z.object({ email: z.email(), password: z.string().min(8) })
 * parse(Signup, body) // Result<{ email: string; password: string }, ValidationError>
 */

export function parse<
  I,
  R extends Validation<unknown> | PromiseLike<Validation<unknown>>
>(
  schema: Schema<I, R> & RejectAsync<R>,
  input: I
): Result<Output<R>, ValidationError>

export function parse<I, O>(
  schema: Schema<I, Validation<O> | PromiseLike<Validation<O>>>,
  input: I
): Result<O, ValidationError> {
  const outcome = schema['~standard'].validate(input)

  if (isThenable(outcome)) {
    throw new TypeError(
      'tryck: parse takes a synchronous schema; an async refine or transform makes it asynchronous'
    )
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
