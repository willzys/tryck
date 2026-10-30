import { isBigint } from '../utils/inspect'

import type { Hint } from '../utils/dispatch'

interface SerializedError {
  cause?: unknown
  errors?: unknown[]
  message: string
  name: string
}

// Error keeps message, name, cause and errors non-enumerable.
const depthLimit = 32

// JSON.stringify throws on a bigint.
const jsonSafe = ([key, value]: [string, unknown]) =>
  [key, isBigint(value) ? value.toString() : value] as const

const serializeError = (
  error: Error,
  seen: Set<Error>,
  depth = 0
): SerializedError => {
  seen.add(error)

  const nested = (value: Error['cause']) => {
    if (!(value instanceof Error)) return value

    if (seen.has(value)) return '[Circular]'

    return depth < depthLimit
      ? serializeError(value, seen, depth + 1)
      : '[Truncated]'
  }

  const fields: SerializedError = {
    ...Object.fromEntries(Object.entries(error).map(jsonSafe)),
    message: error.message,
    name: error.name
  }

  if ('cause' in error) fields.cause = nested(error.cause)

  if (error instanceof AggregateError) fields.errors = error.errors.map(nested)

  return fields
}

type Fields = Readonly<Partial<Pick<Error, 'cause' | 'message'>>>

// Object.assign would run the __proto__ setter.
const defineFields = (target: Error, fields: Fields) => {
  for (const [key, value] of Object.entries(fields)) {
    if (key === '__proto__') continue

    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: true,
      value,
      writable: true
    })
  }
}

type Reserved = 'ok' | 'err'

const reserved = ['_tag', 'name', 'stack', 'toJSON'] as const

type WithoutBuiltIns<P> = {
  readonly [K in keyof P]: K extends '_tag' | 'name' | 'stack' | 'toJSON'
    ? Hint<'tryck: _tag, name, stack and toJSON are set by taggedError; rename the field'>
    : P[K]
}

// NoInfer for TypeScript 5.0, which lacks the built-in one.
type NoInference<T> = [T][T extends unknown ? 0 : never]

export interface Tagged<Tag extends string> extends Error {
  readonly _tag: Tag
  readonly toJSON: () => object
}

export interface TaggedErrorClass<Tag extends string> {
  new <P extends WithoutBuiltIns<P> = Record<never, never>>(
    ...fields: keyof P extends never ? [fields?: Fields] : [fields: P & Fields]
  ): Tagged<Tag> & Readonly<NoInference<P>>
  readonly prototype: Tagged<Tag>
}

/**
 * Creates an `Error` class with a literal `_tag` and typed fields.
 *
 * @example
 * class RateLimited extends taggedError('RateLimited')<{ retryIn: number }> {}
 * new RateLimited({ retryIn: 30 })._tag // 'RateLimited'
 */

export function taggedError<const Tag extends string>(
  tag: Exclude<Tag, Reserved>
): TaggedErrorClass<Tag>

export function taggedError(tag: string): new (...fields: never) => Error {
  if (tag === 'ok' || tag === 'err') {
    throw new TypeError(
      `tryck: "${tag}" is reserved for match handlers; choose another tag`
    )
  }

  return class extends Error {
    readonly _tag = tag
    override readonly name = tag

    constructor(fields: Fields = {}) {
      // Own keys only, as defineFields copies.
      if (reserved.some(key => Object.hasOwn(fields, key))) {
        throw new TypeError(
          'tryck: _tag, name, stack and toJSON are set by taggedError; rename the field'
        )
      }

      super(
        fields.message ?? tag,
        'cause' in fields ? { cause: fields.cause } : undefined
      )
      defineFields(this, fields)
    }

    toJSON() {
      return serializeError(this, new Set())
    }
  }
}
