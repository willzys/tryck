import { Err, Ok } from '../core/result'
import { isResult, isTagged } from '../utils/inspect'

import type { Result } from '../core/result'
import type { Tagged } from '../errors/tagged'
import type { Hint } from '../utils/dispatch'

type Revivable = abstract new (...fields: never) => Tagged<string>

type Table<C> = {
  readonly [K in keyof C]: C[K] extends abstract new (
    ...fields: never
  ) => Tagged<K & string>
    ? C[K]
    : Hint<'tryck: each key must be the _tag of its class'>
}

type Sent<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: unknown }

type Failed = Extract<Sent<unknown>, { readonly ok: false }>

type Classes = Readonly<
  Partial<Record<string, new (fields: Partial<Error>) => Error>>
>

const builtIns = new Set(['_tag', 'name', 'stack'])

const rebuild = ({ error }: Failed, classes: Classes): Error => {
  const Class =
    isTagged(error) && Object.hasOwn(classes, error._tag)
      ? classes[error._tag]
      : undefined

  if (!isTagged(error) || !Class) {
    const tag = isTagged(error) ? `"${error._tag}"` : 'this error'

    throw new TypeError(
      `tryck: revive has no class for ${tag}; add it to the table`
    )
  }

  return new Class(
    Object.fromEntries(
      Object.entries(error).filter(([key]) => !builtIns.has(key))
    )
  )
}

/**
 * Rebuilds a result that came from JSON, with its error as an instance of
 * its class.
 *
 * @example
 * const result = revive(JSON.parse(text), { NotFound, Banned })
 * // Result<unknown, NotFound | Banned>, ready for yield* and match
 */

export function revive<T, const C extends Readonly<Record<string, Revivable>>>(
  sent: Sent<T>,
  classes: C & Table<C>
): Result<T, InstanceType<C[keyof C]>>

export function revive(
  sent: Sent<unknown>,
  classes: Classes
): Result<unknown, Error> {
  if (!isResult(sent)) {
    throw new TypeError('tryck: revive takes a result, such as one from JSON')
  }

  return sent.ok === true ? new Ok(sent.value) : new Err(rebuild(sent, classes))
}
