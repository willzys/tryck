<p align="center">
  <img src=".github/banner.png" alt="tryck" width="640">
</p>

The trick to never writing `try/catch` again.

Typed results, `yield*` as Rust's `?`, and defects that stay exceptions. Under 2 kB gzipped, zero dependencies.

```sh
bun add tryck
```

ESM only. Requires TypeScript 5.0 or newer and an ES2022 runtime. Tested on Node 22+ and Bun.

## Quick start

Learn it in three steps; each one is useful on its own.

### 1. Replace a `try/catch`

```ts
import { attempt, match } from 'tryck'

const config = attempt(() => JSON.parse(text), SyntaxError)

const settings = match(config, {
  ok: value => value,
  err: () => defaults
})
```

Only `SyntaxError` is caught: any other error, such as a bug in your own code, still throws and reaches your error tracker instead of silently becoming `defaults`.

### 2. Chain steps that can fail

```ts
import { gen } from 'tryck'

const loadAccount = (id: string) =>
  gen(async function* loadUserAndPlan() {
    const user = yield* await findUser(id)
    const plan = yield* await findPlan(user.planId)
    return { plan, user }
  }) // Promise<Result<{ plan: Plan; user: User }, NotFound>>
```

`yield*` gives back the value of an `Ok` or stops at the first `Err`, like Rust's `?`. No `if` after each step, and the errors of every step end up in the type.

### 3. Name your errors

```ts
import { err, match, taggedError } from 'tryck'

class NotFound extends taggedError('NotFound')<{ id: string }> {}
class Banned extends taggedError('Banned') {}

const findActiveUser = (id: string) =>
  gen(async function* findActive() {
    const user = yield* await findUser(id)
    if (user.banned) return yield* err(new Banned())
    return user
  })

const status = await match(findActiveUser(id), {
  ok: () => 200,
  NotFound: () => 404,
  Banned: () => 403
})
```

`match` needs a handler for every error. Add a new one to `findActiveUser` and this code stops compiling until it has a status.

## Common mistakes

- **`yield` instead of `yield*`.** Only `yield*` unwraps a result; a plain `yield` is a type error.
- **A missing `await`.** In an `async function*`, write `yield* await findUser(id)`: `yield*` cannot take a promise.
- **A guard without `return`.** `if (!user) yield* err(e)` does not narrow `user`; write `return yield* err(e)`.
- **Mixing native and tagged errors.** `SyntaxError` adds nothing to `Error`, so a union with tagged errors collapses into `Error`. Translate it first: `[SyntaxError, InvalidJson]`.
- **Catching `TypeError`.** It is what a typo or a lost `this` throws; catching it turns bugs into expected failures.

## API

Every function that takes a `Result` also takes a `Promise` of one.

| Function | Does |
| --- | --- |
| `ok(value)`, `err(error)` | Build a result |
| `attempt(fn, ...catches)` | Run `fn`, turning the listed errors into an `Err` |
| `safe(fn, ...catches)` | Wrap a function once with `attempt` |
| `when(Class, test)` | Catch a class only when a check passes |
| `parse(schema, input)` | Validate input with any Standard Schema |
| `gen(function* name() {})` | Chain results with `yield*` |
| `all(results)` | Collect several results into one |
| `mapErr(result, fn)` | Translate an error |
| `recover(result, handlers)` | Handle errors by tag and drop them from the type |
| `match(result, handlers)` | Turn a result into a value, handling every error |
| `unwrap(result)` | Get the value or throw the error |
| `taggedError(tag)` | Define an error class with a `_tag` |

Every function with examples: [docs/api.md](docs/api.md).

## Examples

- [A simple example](examples/basic.md): parse, look up and answer.
- [From try/catch](examples/from-try-catch.md): the same code, before and after.
- [An HTTP handler](examples/http-handler.md): validate a request and map every error to a status.
- [Database errors](examples/database.md): catch only the failures you expect.

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
