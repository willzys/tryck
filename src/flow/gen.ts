import { Ok } from '../core/result'
import { isResult } from '../utils/inspect'

import type { Err, ErrorOf, Result } from '../core/result'

type Unwrapped<T> =
  T extends Ok<infer V> ? V : T extends Err<unknown> ? never : T

type Outcome<Y, T> = Result<Unwrapped<T>, ErrorOf<Y> | ErrorOf<T>>

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
export function gen<Y extends Err<unknown>, T>(
  body: () => AsyncGenerator<Y, T>
): Promise<Outcome<Y, T>>

export function gen<Y extends Err<unknown>, T>(
  body: () => Generator<Y, T>
): Outcome<Y, T>

export function gen<Y, T>(
  body: () => Generator<Y, T | undefined> | AsyncGenerator<Y, T | undefined>
): ReturnType<typeof run<Y, T>> | ReturnType<typeof runAsync<Y, T>> {
  const steps = body()

  return Symbol.asyncIterator in steps ? runAsync(steps) : run(steps)
}
