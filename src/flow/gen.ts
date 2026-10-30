import { Ok } from '../core/result'
import { isResult, isThenable } from '../utils/inspect'

import type { Err, ErrorOf, Result } from '../core/result'
import type { Hint, IsAny } from '../utils/dispatch'

type Unwrapped<T> =
  T extends Ok<infer V> ? V : T extends Err<unknown> ? never : T

type Outcome<Y, T> = Result<Unwrapped<T>, ErrorOf<Y> | ErrorOf<T>>

// A sync body returning a promise means a missing async.
type RejectPromise<Body> =
  Body extends Generator<unknown, infer T>
    ? [Extract<T, PromiseLike<unknown>>] extends [never]
      ? object
      : Hint<'tryck: use async function* to return a promise'>
    : object

type Ran<Body> =
  IsAny<Body> extends true
    ? Promise<Outcome<Body, Body>>
    : Body extends AsyncGenerator<infer Y, infer T>
      ? Promise<Outcome<Y, T>>
      : Body extends Generator<infer Y, infer T>
        ? Outcome<Y, T>
        : never

const finish = <T>(value: T): T | Ok<T> =>
  isResult(value) ? value : new Ok(value)

const finishSync = <T>(value: T): T | Ok<T> => {
  if (isThenable(value)) {
    throw new TypeError('tryck: use async function* to return a promise')
  }

  return finish(value)
}

const stopped = <Y>(value: Y): Y => {
  if (isResult(value) && !value.ok) return value

  throw new TypeError('tryck: use yield* inside gen, not yield')
}

// An Err yielded in finally replaces the first one.
const drain = <Y>(steps: Generator<Y, unknown>, failure: Y): Y => {
  const step = steps.return(undefined)

  return step.done ? failure : drain(steps, stopped(step.value))
}

const drainAsync = async <Y>(
  steps: AsyncGenerator<Y, unknown>,
  failure: Y
): Promise<Y> => {
  const step = await steps.return(undefined)

  return step.done ? failure : drainAsync(steps, stopped(step.value))
}

const run = <Y, T>(steps: Generator<Y, T | undefined>) => {
  const step = steps.next()

  return step.done ? finishSync(step.value) : drain(steps, stopped(step.value))
}

const runAsync = async <Y, T>(steps: AsyncGenerator<Y, T | undefined>) => {
  const step = await steps.next()

  return step.done ? finish(step.value) : drainAsync(steps, stopped(step.value))
}

/**
 * Runs a generator where `yield*` unwraps results, like Rust's `?`.
 * Use `async function*` with `yield* await` for promises.
 *
 * @example
 * const signUp = (body: unknown) =>
 *   gen(async function* signUpUser() {
 *     const fields = yield* parse(Signup, body)
 *     return yield* await attempt(() => insertUser(fields), [taken, EmailTaken])
 *   }) // Promise<Result<User, ValidationError | EmailTaken>>
 */

export function gen<
  Body extends Generator<Err<unknown>> | AsyncGenerator<Err<unknown>>
>(body: (() => Body) & RejectPromise<Body>): Ran<Body>

export function gen<Y, T>(
  body: () => Generator<Y, T | undefined> | AsyncGenerator<Y, T | undefined>
): ReturnType<typeof run<Y, T>> | ReturnType<typeof runAsync<Y, T>> {
  const steps = body()

  return Symbol.asyncIterator in steps ? runAsync(steps) : run(steps)
}
