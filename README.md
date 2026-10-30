<p align="center">
  <img src=".github/banner.png" alt="tryck" width="640">
</p>

The trick to never writing `try/catch` again.

Typed results, `yield*` as Rust's `?`, and defects that stay exceptions. Under 2.5 kB minified and gzipped, zero dependencies.

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
import { err, gen, match, taggedError } from 'tryck'

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
- **A floating promise in `gen`.** A call you neither `await` nor `yield*` runs on its own, and its rejection reaches nobody. Await it, or collect it with `all`.
- **Promises started too early.** `const user = findUser(id)` followed by another `await` leaves `user` unobserved: if it rejects meanwhile, nothing is listening. Start the promises inside the `all` call.
- **Throwing from a callback.** `attempt` catches what `fn` throws while it runs. A throw inside `setTimeout` or an event handler happens later, outside it: wrap the callback itself.
- **A guard without `return`.** `if (!user) yield* err(e)` does not narrow `user`; write `return yield* err(e)`.
- **Mixing native and tagged errors.** `SyntaxError` adds nothing to `Error`, so a union with tagged errors collapses into `Error`. Translate it first: `[SyntaxError, InvalidJson]`.
- **`yield*` on a result from JSON.** `yield*` needs an iterator, so rebuild it first: `yield* revive(r, { NotFound })`. Every other function takes plain results as they are.
- **Catching `TypeError`.** It is what a typo or a lost `this` throws; catching it turns bugs into expected failures.
- **A field called `name`.** `_tag`, `name`, `stack` and `toJSON` belong to `taggedError`. Pick another name, such as `flag` in `FlagUnknown({ flag })`.
- **Required fields on a translated error.** In `[Caught, Into]`, `Into` receives only `{ cause }`. Make its other fields optional, or catch the class alone and build the error with `mapErr`.
- **Sending errors to a worker.** `structuredClone` and `postMessage` drop `_tag` and the fields, so `match` falls to `err`. Send `JSON.stringify(result)` and rebuild it with `revive`.
- **Secrets in fields.** Every field goes into the error's JSON, and from there into your logs. Keep passwords and tokens out of fields, or redact them in a `toJSON` override.

## API

Every function that takes a `Result` also takes a `Promise` of one.

| Function | Does |
| --- | --- |
| `ok(value)`, `err(error)` | Build a result |
| `attempt(fn, ...catches)` | Run `fn`, turning the listed errors into an `Err` |
| `safe(fn, ...catches)` | Wrap a function once with `attempt` |
| `when(Class, test)` | Catch a class only when a check passes |
| `parse(schema, input)` | Validate input with any Standard Schema |
| `revive(sent, classes)` | Rebuild a result that came from JSON |
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
- [Transactions](examples/transactions.md): release the connection on every exit path, and recover with a savepoint.
- [Timeouts and retries](examples/timeouts-and-retries.md): cancel a slow call, and retry only what is safe to retry.
- [Caching a lookup](examples/cache.md): keep a cached function always async.

## Design

- **Defects are not errors.** Only the classes you name are caught, so bugs keep their stack trace.
- **Eager, with no runtime.** `gen` runs when called. Retries, cancellation and dependency injection belong to an effect system such as [Effect].
- **Functions, not methods.** Results are plain data, so bundles ship only what they import, and every function takes a result that came from JSON or another copy of tryck.
- **Sync or async, never a union.** `function*` gives a `Result`, `async function*` a `Promise` of one. `attempt` follows the type of `fn` the same way, and falls back to a union only when that type is `unknown`.

## Compared to

|  | tryck | [neverthrow] | [better-result] | [typescript-result] | [Effect] |
| --- | --- | --- | --- | --- | --- |
| Generator composition | `gen` | `safeTry` | `Result.gen` | `Result.gen` | `Effect.gen` |
| What `try` catches | named classes | everything | everything | everything | everything |
| Async results | `Promise<Result>` | `ResultAsync` | `*Async` functions | `AsyncResult` | `Effect` |
| Method chaining | no | yes | yes | yes | pipe |
| Tagged errors | yes | no | yes | no | yes |
| Scope | Result | Result | Result | Result | runtime |

## License

Apache-2.0

[neverthrow]: https://github.com/supermacro/neverthrow
[better-result]: https://github.com/dmmulroy/better-result
[typescript-result]: https://github.com/everweij/typescript-result
[Effect]: https://effect.website
