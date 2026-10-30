# Transactions

A transfer between two accounts, with every exit path leaving the connection clean. The client follows the `pg` driver, but the shape is the same for any pool.

```ts
import { attempt, err, gen, ok, taggedError, when } from 'tryck'

class InsufficientFunds extends taggedError('InsufficientFunds') {}
class AccountMissing extends taggedError('AccountMissing')<{ id: string }> {}

const overdrawn = when(DbError, failure => failure.code === '23514')

const debit = (client: PoolClient, id: string, amount: number) =>
  gen(async function* debitAccount() {
    const { rows } = yield* await attempt(
      () =>
        client.query<{ balance: number }>(
          'UPDATE accounts SET balance = balance - $1 WHERE id = $2 RETURNING balance',
          [amount, id]
        ),
      [overdrawn, InsufficientFunds]
    )
    const [account] = rows
    return account ? ok(account.balance) : err(new AccountMissing({ id }))
  })

const credit = (client: PoolClient, id: string, amount: number) =>
  gen(async function* creditAccount() {
    const { rows } = yield* await attempt(
      () =>
        client.query(
          'UPDATE accounts SET balance = balance + $1 WHERE id = $2 RETURNING id',
          [amount, id]
        ),
      DbError
    )
    return rows.length > 0 ? ok(id) : err(new AccountMissing({ id }))
  })

const transfer = (from: string, to: string, amount: number) =>
  gen(async function* transferFunds() {
    const client = await pool.connect()
    let committed = false

    try {
      await client.query('BEGIN')
      const balance = yield* await debit(client, from, amount)
      yield* await credit(client, to, amount)
      await client.query('COMMIT')
      committed = true
      return balance
    } finally {
      const clean =
        committed || (await attempt(() => client.query('ROLLBACK'), DbError)).ok
      client.release(!clean)
    }
  })
// Promise<Result<number, InsufficientFunds | AccountMissing | DbError>>
```

## Why the `finally`

`yield*` on an `Err` stops the body right there, so the lines after it never run. Without the `finally`, an `InsufficientFunds` would return the connection to the pool with the transaction still open, and the next request on that connection would run inside it and be rolled back with it.

`gen` runs `finally` blocks before it returns, async ones included. The same goes for anything else that must be released: an advisory lock (`pg_advisory_unlock`), a semaphore slot, a file handle.

When `ROLLBACK` itself fails, the connection is in an unknown state: `release(true)` destroys it instead of returning it to the pool.

## Recovering inside a transaction

In Postgres, a failed statement aborts the whole transaction: every statement after it fails until `ROLLBACK`. Recovering from the error is not enough. Roll back to a savepoint first:

```ts
import { attempt, ok, recover, taggedError, when } from 'tryck'

class EmailTaken extends taggedError('EmailTaken') {}

const unique = when(DbError, failure => failure.code === '23505')

const insertOrKeep = async (client: PoolClient, email: string) => {
  await client.query('SAVEPOINT insert_user')
  const inserted = await attempt(
    () => client.query('INSERT INTO users (email) VALUES ($1)', [email]),
    [unique, EmailTaken]
  )
  if (!inserted.ok) await client.query('ROLLBACK TO SAVEPOINT insert_user')
  return recover(inserted, { EmailTaken: () => ok(null) })
}
// Promise<Result<QueryResult | null, never>>
```

Without the savepoint, the `recover` would hand back a success while the next `COMMIT` silently turns into a rollback.
