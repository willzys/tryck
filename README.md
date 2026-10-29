<p align="center">
  <img src=".github/banner.png" alt="tryck" width="640">
</p>

The trick to never writing `try/catch` again.

Typed results, `yield*` as Rust's `?`, and defects that stay exceptions. Under 2 kB gzipped, zero dependencies.

```sh
bun add tryck
```

ESM only. Requires TypeScript 5.0 or newer and an ES2022 runtime. Tested on Node 22+ and Bun.

```ts
import { attempt, err, gen, mapErr, match, parse, taggedError } from 'tryck'
import { z } from 'zod'

class NotFound extends taggedError('NotFound')<{ id: string }> {}
class Banned extends taggedError('Banned') {}
class InvalidToken extends taggedError('InvalidToken') {}

const Token = z.object({ userId: z.string() })

const profile = (header: string) =>
  gen(async function* loadProfile() {
    const decoded = yield* attempt(
      () => JSON.parse(atob(header)),
      [DOMException, InvalidToken],
      [SyntaxError, InvalidToken]
    )
    const token = yield* mapErr(
      parse(Token, decoded),
      cause => new InvalidToken({ cause })
    )
    const user = yield* await findUser(token.userId)
    if (user.banned) return yield* err(new Banned())
    return user.profile
  })

const response = match(await profile(header), {
  ok: profile => json(profile),
  NotFound: error => status(404, `no user ${error.id}`),
  Banned: () => status(403),
  InvalidToken: () => status(400)
})
```

Every failure is in the type and every handler is checked. A bug like `user.profile.nmae.length` still throws to your error tracker instead of being caught by accident.

## API

Every function that takes a `Result` also takes a `Promise` of one and gives a `Promise` back.

### `ok(value)` and `err(error)`

```ts
const half = (n: number): Result<number, 'odd'> =>
  n % 2 === 0 ? ok(n / 2) : err('odd')

const result = half(3)
if (result.ok) result.value
else result.error // 'odd'
```

### `attempt(fn, ...catches)`

Runs `fn` and turns instances of the listed `Error` classes into an `Err`; anything else is rethrown. Async functions give a `Promise<Result>`.

```ts
attempt(() => JSON.parse(text), SyntaxError) // Result<any, SyntaxError>
attempt(() => JSON.parse(text), [SyntaxError, InvalidJson]) // translated, original kept as `cause`
attempt(
  () => insert(row),
  when(SQLiteError, e => e.code === 'SQLITE_CONSTRAINT_UNIQUE')
)
```

A `[Caught, Into]` pair translates a foreign error into one of yours. `when` catches a class only when a check passes. Translate native errors such as `SyntaxError` before mixing them with tagged ones: they add nothing to `Error`, so TypeScript would fold the union into plain `Error`.

### `safe(fn, ...catches)`

Wraps a function once so every call goes through `attempt`.

```ts
const parseJson = safe(JSON.parse, SyntaxError)
parseJson('{') // Err<SyntaxError>
```

### `parse(schema, input)`

Validates `input` with any [Standard Schema](https://standardschema.dev) (Zod, Valibot, ArkType) and returns the output or a `ValidationError` listing every issue.

```ts
parse(z.object({ name: z.string() }), body) // Result<{ name: string }, ValidationError>
```

### `gen(function* name() {})`

`yield*` on an `Ok` gives back its value; on an `Err` it stops the body with that error. Errors from every step are unioned, a returned `Result` passes through as is, and `finally` blocks run on the way out. Use `async function*` with `yield* await` for promises, and `return yield* err(e)` as a guard.

```ts
const quarter = (n: number) =>
  gen(function* quarterOf() {
    const once = yield* half(n)
    return yield* half(once)
  }) // Result<number, 'odd'>
```

### `all(results)`

Collects a tuple of results, or promises of them, into one. The first `Err` in input order wins; nothing is cancelled.

```ts
await all([findUser(id), findPlan(id)]) // Result<[User, Plan], NotFound>
```

### `mapErr(result, fn)` and `recover(result, handlers)`

`mapErr` translates an error between layers. `recover` handles errors by `_tag`, or all of them with `err`, and removes them from the type.

```ts
mapErr(result, cause => new Unauthorized({ cause }))
await recover(findUser(id), { NotFound: () => ok(guest) }) // Result<User, Banned>
```

### `match(result, handlers)`

Folds a `Result` into one value. Tagged errors need a handler per `_tag`, checked for exhaustiveness; `err` handles whatever is left.

```ts
match(result, {
  ok: user => user.name,
  NotFound: error => `missing ${error.id}`,
  err: () => 'unavailable'
})
```

### `unwrap(result)`

Returns the value or throws the error as is, so `unwrap(attempt(fn, E))` behaves like `fn()`. Meant for scripts, tests and framework edges.

### `taggedError(tag)`

```ts
class RateLimited extends taggedError('RateLimited')<{ retryIn: number }> {}

new RateLimited({ retryIn: 30 })._tag // 'RateLimited'
```

A real `Error` with typed fields; `message` and `cause` are forwarded to `Error`. Its JSON is meant for logs: map tags to public messages instead of sending errors to clients.

## Design

- **Defects are not errors.** Only the classes you name are caught, so bugs keep their stack trace.
- **Eager, with no runtime.** `gen` runs when called. Retries, cancellation and dependency injection belong to an effect system such as [Effect].
- **Functions, not methods.** Results are plain data, so bundles ship only what they import and results from JSON or another copy of tryck still work.
- **Sync or async, never a union.** `function*` gives a `Result`, `async function*` a `Promise` of one.

## Compared to

|  | tryck | [neverthrow] | [better-result] | [typescript-result] | [Effect] |
| --- | --- | --- | --- | --- | --- |
| Generator composition | `gen` | `safeTry` | `Result.gen` | `Result.gen` | `Effect.gen` |
| Method chaining | no | yes | yes | yes | pipe |
| Tagged errors | yes | no | yes | no | yes |
| Scope | Result | Result | Result | Result | runtime |

## License

Apache-2.0

[neverthrow]: https://github.com/supermacro/neverthrow
[better-result]: https://github.com/dmmulroy/better-result
[typescript-result]: https://github.com/everweij/typescript-result
[Effect]: https://effect.website
