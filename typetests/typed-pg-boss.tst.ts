import type { FastifyInstance } from 'fastify'
import type { PgBoss } from 'pg-boss'
import { expect, test } from 'tstyche'
import {
  definePgBossWorker,
  getPgBoss,
  type PgBossQueuesFromWorkers,
  type TypedPgBoss,
} from '../src/index.js'

type EmailJob = {
  userId: string
}

type CleanupJob = {
  olderThanDays: number
}

declare const app: FastifyInstance

test('PgBossQueuesFromWorkers derives queue names and payloads from workers', () => {
  const workers = [
    definePgBossWorker<EmailJob>()({
      name: 'email-worker',
      queue: 'email/send',
      async handler(jobs) {
        expect(jobs[0]?.data.userId).type.toBe<string | undefined>()
      },
    }),
    definePgBossWorker<CleanupJob>()({
      name: 'cleanup',
      async handler(jobs) {
        expect(jobs[0]?.data.olderThanDays).type.toBe<number | undefined>()
      },
    }),
  ] as const

  type Queues = PgBossQueuesFromWorkers<typeof workers>

  expect<Queues>().type.toBe<{
    'email/send': EmailJob
    cleanup: CleanupJob
  }>()
})

test('typed getPgBoss narrows send queue names and payloads', () => {
  type Queues = {
    'email/send': EmailJob
    cleanup: CleanupJob
  }

  const boss = getPgBoss<Queues>(app)

  expect(boss).type.toBeAssignableTo<TypedPgBoss<Queues>>()
  expect(boss.send('email/send', { userId: 'user_123' })).type.toBe<Promise<string | null>>()
  expect(boss.send('cleanup', { olderThanDays: 30 })).type.toBe<Promise<string | null>>()
  expect(boss.send({ name: 'email/send', data: { userId: 'user_123' } })).type.toBe<
    Promise<string | null>
  >()

  // @ts-expect-error  Argument of type '"unknown/queue"' is not assignable to parameter
  boss.send('unknown/queue', { userId: 'user_123' })

  // @ts-expect-error  Type 'number' is not assignable to type 'string'.
  boss.send('email/send', { userId: 123 })

  // @ts-expect-error  Object literal may only specify known properties
  boss.send('cleanup', { userId: 'user_123' })

  // @ts-expect-error  Object literal may only specify known properties
  boss.send({ name: 'email/send', data: { olderThanDays: 30 } })
})

test('getPgBoss stays compatible with the untyped pg-boss API by default', () => {
  const boss = getPgBoss(app)

  expect(boss).type.toBe<PgBoss>()
  expect(boss.send('anything')).type.toBe<Promise<string | null>>()
})
