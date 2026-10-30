import { isTagged } from '../utils/inspect'

const serialize = (cause: unknown) =>
  cause instanceof Error && !isTagged(cause)
    ? { message: cause.message, name: cause.name }
    : cause

type Fields = Readonly<Partial<Pick<Error, 'cause' | 'message'>>>

type Reserved = 'ok' | 'err'

type WithoutBuiltIns<P> = {
  readonly [K in keyof P]: K extends '_tag' | 'name' | 'stack' ? never : P[K]
}

export interface Tagged<Tag extends string> extends Error {
  readonly _tag: Tag
  readonly toJSON: () => object
}

export interface TaggedErrorClass<Tag extends string> {
  new <P extends WithoutBuiltIns<P> = Record<never, never>>(
    ...fields: keyof P extends never ? [fields?: Fields] : [fields: P & Fields]
  ): Tagged<Tag> & Readonly<P>
  readonly prototype: Tagged<Tag>
}

/** Creates an `Error` class with a literal `_tag` and typed fields. */
export function taggedError<const Tag extends string>(
  tag: Exclude<Tag, Reserved>
): TaggedErrorClass<Tag>

export function taggedError(tag: string): new (...fields: never) => Error {
  if (tag === 'ok' || tag === 'err') {
    throw new TypeError(`tryck: "${tag}" is reserved for match handlers`)
  }

  return class extends Error {
    readonly _tag = tag
    override readonly name = tag

    constructor(fields: Fields = {}) {
      if ('_tag' in fields || 'name' in fields || 'stack' in fields) {
        throw new TypeError(
          'tryck: _tag, name and stack are set by taggedError'
        )
      }

      super(
        fields.message ?? tag,
        'cause' in fields ? { cause: fields.cause } : undefined
      )
      Object.assign(this, fields)
    }

    toJSON() {
      return { ...this, cause: serialize(this.cause), message: this.message }
    }
  }
}
