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
