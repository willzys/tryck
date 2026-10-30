import { Ok } from '../core/result'
import { isResult } from '../utils/inspect'

import type { Err, ErrorOf, Result } from '../core/result'
import type { IsAny } from '../utils/dispatch'

type Unwrapped<T> =
  T extends Ok<infer V> ? V : T extends Err<unknown> ? never : T

type Outcome<Y, T> = Result<Unwrapped<T>, ErrorOf<Y> | ErrorOf<T>>

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

const stopped = <Y>(value: Y): Y => {
  if (isResult(value) && !value.ok) return value

  throw new TypeError('tryck: use yield* inside gen, not yield')
}

const run = <Y, T>(steps: Generator<Y, T | undefined>) => {
  const step = steps.next()

  if (step.done) return finish(step.value)

  steps.return(undefined)

  return stopped(step.value)
}

const runAsync = async <Y, T>(steps: AsyncGenerator<Y, T | undefined>) => {
  const step = await steps.next()

  if (step.done) return finish(step.value)

  await steps.return(undefined)

  return stopped(step.value)
}

/** Runs a generator where `yield*` unwraps results, like Rust's `?`. */
export function gen<
  Body extends Generator<Err<unknown>> | AsyncGenerator<Err<unknown>>
>(body: () => Body): Ran<Body>

export function gen<Y, T>(
  body: () => Generator<Y, T | undefined> | AsyncGenerator<Y, T | undefined>
): ReturnType<typeof run<Y, T>> | ReturnType<typeof runAsync<Y, T>> {
  const steps = body()

  return Symbol.asyncIterator in steps ? runAsync(steps) : run(steps)
}
