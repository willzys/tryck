import { Ok } from '../core/result'
import type { ErrorOf, Result, ValueOf } from '../core/result'
import { isSettled } from '../utils/inspect'

type Item = Result<unknown, unknown> | PromiseLike<Result<unknown, unknown>>

type Collected<Rs extends readonly Item[]> = Result<
  { -readonly [K in keyof Rs]: ValueOf<Awaited<Rs[K]>> },
  ErrorOf<Awaited<Rs[number]>>
>

export type All<Rs extends readonly Item[]> = [
  Extract<Rs[number], PromiseLike<unknown>>
] extends [never]
  ? Collected<Rs>
  : Promise<Collected<Rs>>

const collect = <T, E>(results: readonly Result<T, E>[]): Result<T[], E> => {
  const values: T[] = []

  for (const result of results) {
    if (!result.ok) return result
    values.push(result.value)
  }

  return new Ok(values)
}

/** Collects results into one; the first `Err` in input order wins. */
export function all<const Rs extends readonly Item[]>(results: Rs): All<Rs>
export function all<T, E>(
  results: readonly (Result<T, E> | PromiseLike<Result<T, E>>)[]
): Result<T[], E> | Promise<Result<T[], E>> {
  return isSettled(results)
    ? collect(results)
    : Promise.all(results).then(collect)
}
