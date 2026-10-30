// Names the documentation snippets take from the reader's own code.

import type { Issue, Result, Schema, Tagged } from 'tryck'

type Translated<Tag extends string> = Tagged<Tag>

type TranslatedClass<Tag extends string> = new (fields?: {
  readonly cause?: unknown
}) => Translated<Tag>

interface DbFailure extends Error {
  readonly code: string
}

interface Columns {
  readonly [column: string]: string | number | boolean | null
}

declare global {
  interface User {
    readonly banned: boolean
    readonly planId: string
    readonly profile: { readonly name: string }
  }

  interface Plan {
    readonly id: string
  }

  type NotFoundError = Translated<'NotFound'> & { readonly id: string }

  const text: string
  const body: unknown
  const id: string
  const fields: { readonly email: string; readonly password: string }
  const defaults: object
  const guest: User

  interface QueryResult<Row> {
    readonly rows: readonly Row[]
  }

  interface PoolClient {
    query: <Row = Columns>(
      sql: string,
      values?: readonly unknown[]
    ) => Promise<QueryResult<Row>>
    release: (destroy?: boolean) => void
  }

  const pool: { connect: () => Promise<PoolClient> }

  const db: {
    findUser: (id: string) => Promise<User | undefined>
    insertUser: (fields: { readonly email: string }) => Promise<User>
  }

  const DbError: new (message?: string) => DbFailure
  const ConnectionError: new (message?: string) => Error

  const NotFound: new (fields: { readonly id: string }) => NotFoundError
  const Banned: TranslatedClass<'Banned'>
  const InvalidJson: TranslatedClass<'InvalidJson'>
  const EmailTaken: TranslatedClass<'EmailTaken'>
  const Unauthorized: TranslatedClass<'Unauthorized'>

  const Signup: Schema<
    unknown,
    | { readonly value: { email: string; password: string } }
    | { readonly issues: readonly Issue[] }
  >

  const findUser: (id: string) => Promise<Result<User, NotFoundError>>
  const findPlan: (id: string) => Promise<Result<Plan, NotFoundError>>
  const insertUser: (fields: { readonly email: string }) => Promise<User>
}
