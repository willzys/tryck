import {
  taggedError,
  all,
  attempt,
  err,
  gen,
  mapErr,
  match,
  ok,
  parse,
  recover,
  revive,
  safe,
  when
} from 'tryck'

import type { Result } from 'tryck'

class NotFound extends taggedError('NotFound')<{ id: string }> {}

class Invalid extends taggedError('Invalid') {}

interface Input {
  readonly id: string
}

const find = async (id: string): Promise<Result<{ id: string }, NotFound>> =>
  id ? ok({ id }) : err(new NotFound({ id }))

export const run = async (raw: string): Promise<string | number> => {
  const result = await gen(async function* () {
    const input: Input = yield* attempt(
      () => JSON.parse(raw),
      [SyntaxError, Invalid]
    )

    const [first, second] = yield* await all([find(input.id), find('2')])

    return yield* mapErr(ok(first.id + second.id), () => new Invalid())
  })

  return match(result, {
    Invalid: () => 400,
    NotFound: error => error.id,
    ok: value => value
  })
}

const age = {
  '~standard': {
    validate: (value: number) =>
      value >= 0 ? { value } : { issues: [{ message: 'negative' }] }
  }
}

export const contracts = async (): Promise<number> => {
  const parsed = recover(parse(age, -1), { ValidationError: () => ok(0) })
  const pending = Promise.resolve(parsed)

  return match(pending, { ok: value => value })
}

const empty = when(SyntaxError, failure => failure.message.length > 0)

export const guarded = (raw: string): string | number => {
  const parsed = attempt((): number => JSON.parse(raw), [empty, Invalid])

  return parsed.ok ? parsed.value : parsed.error._tag
}

const TimedOut = taggedError('TimedOut')

export const timedOut: Result<never, InstanceType<typeof TimedOut>> = err(
  new TimedOut()
)

const counter = {
  count: 1,
  read(this: { count: number }) {
    return this.count
  }
}

const wrapped = { count: 2, read: safe(counter.read, RangeError) }

export const readCount = () => wrapped.read()

// @ts-expect-error: a method that declares this cannot be called bare
export const bare = () => safe(counter.read, RangeError)()

export const forgotAsync = () =>
  // @ts-expect-error: a sync body must not return a promise
  gen(function* () {
    return Promise.resolve(1)
  })

// @ts-expect-error: mapErr takes a synchronous callback
export const asyncMap = () => mapErr(err('late'), async () => 'mapped')

export const extraKey = () =>
  // @ts-expect-error: a handler key must be ok, err or a _tag of the error
  match(err(new Invalid()), { Gone: () => 3, err: () => 2, ok: () => 1 })

export const revived = (text: string): Result<unknown, NotFound | Invalid> =>
  revive(JSON.parse(text), { Invalid, NotFound })

// @ts-expect-error: each key must be the _tag of its class
export const swapped = () => revive(JSON.parse('{}'), { NotFound: Invalid })
