import { Ok } from '../core/result'
import { isSettled } from '../utils/inspect'

import type { ErrorOf, Result, ValueOf } from '../core/result'
import type { Async } from '../utils/dispatch'

type Item = Result<unknown, unknown> | PromiseLike<Result<unknown, unknown>>

type Collected<Rs extends readonly Item[]> = Result<
  { -readonly [K in keyof Rs]: ValueOf<Awaited<Rs[K]>> },
  ErrorOf<Awaited<Rs[number]>>
>

export type All<Rs extends readonly Item[]> = [Async<Rs[number]>] extends [
  never
]
  ? Collected<Rs>
  : Promise<Collected<Rs>>

const collect = <T, E>(results: readonly Result<T, E>[]): Result<T[], E> => {
  const values: T[] = []

  for (const result of results) {
    if (result.ok !== true) return result
    values.push(result.value)
  }

  return new Ok(values)
}

const decided = Symbol('decided')

const failureOf = async <O>(outcome: Promise<O>) => {
  try {
    await outcome

    return decided
  } catch (error) {
    return error
  }
}

const reraise = async <R>(item: Promise<R>, reported: Promise<unknown>) => {
  try {
    await item
  } catch (error) {
    if ((await reported) !== error) throw error
  }
}

// Re-raises the defects the outcome did not report.
const surfaceLate = <R, O>(
  pending: readonly Promise<R>[],
  outcome: Promise<O>
) => {
  const reported = failureOf(outcome)

  for (const item of pending) reraise(item, reported)
}

// Awaits in input order, so an Err returns without waiting for later items.
const collectAsync = <T, E>(
  items: readonly (Result<T, E> | PromiseLike<Result<T, E>>)[]
): Promise<Result<T[], E>> => {
  const pending = items.map(item => Promise.resolve(item))
  const defects = Promise.all(pending)
  const values: T[] = []

  const from = async (index: number): Promise<Result<T[], E>> => {
    const item = pending[index]

    if (!item) return new Ok(values)

    const result = await Promise.race([item, defects.then(() => item)])

    if (result.ok !== true) return result

    values.push(result.value)

    return from(index + 1)
  }

  const outcome = from(0)

  surfaceLate(pending, outcome)

  return outcome
}

/**
 * Collects results into one; the first `Err` in input order wins, without
 * waiting for the items after it.
 *
 * @example
 * await all([findUser(id), findPlan(id)]) // Result<[User, Plan], NotFound>
 */

export function all<const Rs extends readonly Item[]>(results: Rs): All<Rs>

export function all<T, E>(
  results: readonly (Result<T, E> | PromiseLike<Result<T, E>>)[]
): Result<T[], E> | Promise<Result<T[], E>> {
  return isSettled(results) ? collect(results) : collectAsync(results)
}
