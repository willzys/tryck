# Database errors

Database drivers throw one error class for everything, from a duplicate email to a lost connection. Catch only the cases your code expects.

```ts
import { attempt, mapErr, ok, recover, taggedError, when } from 'tryck'

class EmailTaken extends taggedError('EmailTaken') {}
class NotFound extends taggedError('NotFound')<{ id: string }> {}

const duplicate = when(DbError, failure => failure.code === 'unique')

const insertUser = (email: string) =>
  attempt(() => db.insertUser({ email }), [duplicate, EmailTaken])
// Promise<Result<User, EmailTaken>>
```

`when` narrows the class to the duplicate case, and the pair translates it into `EmailTaken`. A timeout or a syntax error in your SQL is not caught: it stays a defect.

## Adding fields to the translated error

A translation pair only passes `cause`. When the error needs more fields, catch with `when` alone and build it with `mapErr`:

```ts
class TakenEmail extends taggedError('TakenEmail')<{ email: string }> {}

const insertUser = (email: string) =>
  mapErr(
    attempt(() => db.insertUser({ email }), duplicate),
    cause => new TakenEmail({ cause, email })
  )
// Promise<Result<User, TakenEmail>>
```

## Turning a missing row into a fallback

```ts
const findOrGuest = (id: string) =>
  recover(findUser(id), { NotFound: () => ok(guest) })
// Promise<Result<User, never>>
```

`recover` removes `NotFound` from the type, so the caller no longer has to handle it.
