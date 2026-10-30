# Caching a lookup

A cache that answers sync on a hit and async on a miss gives `attempt` a function that is sometimes one and sometimes the other.

## Before

```ts
import { attempt } from 'tryck'

const cache = new Map<string, User>()

const findCached = (id: string) =>
  attempt(() => cache.get(id) ?? db.findUser(id), ConnectionError)
// Result<User, Error> | Promise<Result<User | undefined, Error>>
```

`attempt` follows the type of `fn`, and this `fn` returns a `User` or a `Promise`. Every caller now has to handle both.

## After

```ts
import { attempt } from 'tryck'

const cache = new Map<string, User>()
const running = new Map<string, Promise<User | undefined>>()

const load = (id: string) => {
  const started = running.get(id) ?? db.findUser(id)
  running.set(id, started)
  started.finally(() => running.delete(id)).catch(() => null)
  return started
}

const findCached = (id: string) =>
  attempt(async () => cache.get(id) ?? (await load(id)), ConnectionError)
// Promise<Result<User | undefined, Error>>
```

- **Always async.** An `async` function returns a promise on a hit too, so the type is one `Promise` of a `Result`.
- **One request per key.** Concurrent misses share the promise in `running`, and it is stored before anything awaits, so no second caller can slip in between.
