import { PgBoss } from 'pg-boss'

export const connectionString =
  process.env.POSTGRES_URL ??
  'postgres://fastify_pg_boss:fastify_pg_boss@localhost:55432/fastify_pg_boss'

export function createSchemaName(prefix = 'pgboss') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

export async function assertDatabaseAvailable() {
  const boss = new PgBoss({
    connectionString,
    schema: createSchemaName('pgboss_health'),
  })

  try {
    await boss.start()
  } catch (error) {
    throw new Error(
      `Cannot connect to the test Postgres database at ${connectionString}. ` +
        `Run "npm run db:up" before running tests, or set POSTGRES_URL to a reachable database. ` +
        `Original error: ${error instanceof Error ? error.message : String(error)}`,
    )
  } finally {
    try {
      await boss.stop({ close: true })
    } catch {
      // The health check can fail before pg-boss opens a connection.
    }
  }
}

export function waitFor(promise, timeoutMs, message) {
  let timeout

  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs)
  })

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout))
}
