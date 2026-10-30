# Timeouts and retries

Give up on a slow call, and try again only when trying again is safe.

## A timeout that cancels

```ts
import { attempt, taggedError, when } from 'tryck'

class TimedOut extends taggedError('TimedOut') {}

const timeout = when(DOMException, failure => failure.name === 'TimeoutError')

const fetchJson = (url: string, ms: number) =>
  attempt(async (): Promise<unknown> => {
    const response = await fetch(url, { signal: AbortSignal.timeout(ms) })
    return response.json()
  }, [timeout, TimedOut])
// Promise<Result<unknown, TimedOut>>
```

The signal aborts the request itself. `Promise.race` with a timer would only stop waiting: the request, or a database query, keeps running and holding its connection. For Postgres, set `statement_timeout` so the server stops the query too.

## Retrying only transient errors

```ts
import { attempt, taggedError, type Result } from 'tryck'

class Unavailable extends taggedError('Unavailable') {}

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const retry = async <T, E>(
  run: () => Promise<Result<T, E>>,
  transient: (error: E) => boolean,
  tries = 3,
  delay = 100
): Promise<Result<T, E>> => {
  const result = await run()
  if (result.ok || tries <= 1 || !transient(result.error)) return result
  await pause(delay)
  return retry(run, transient, tries - 1, Math.min(delay * 2, 2000))
}

const loadProfile = (id: string) =>
  retry(
    () => attempt(() => db.findUser(id), [ConnectionError, Unavailable]),
    error => error._tag === 'Unavailable'
  )
// Promise<Result<User | undefined, Unavailable>>
```

- **Only transient errors.** A `NotFound` or a validation error will fail the same way every time. The `transient` check keeps retries to the errors that can change, and every other error returns at once.
- **A capped delay.** Doubling without a cap reaches `Infinity` after about a thousand tries, and `setTimeout` treats that as zero.
- **Only idempotent operations.** A timeout does not tell whether the server finished. Retrying a payment after a timeout that came after the commit charges twice. Retry reads freely; retry writes only with an idempotency key the server checks.
- **Retried deletes.** If the first `DELETE` succeeded and only the answer was lost, the retry finds nothing. Treat its `NotFound` as success.
