import type { FastifyInstance } from 'fastify'
import type { PgBoss, SendOptions } from 'pg-boss'
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

const globalWorkers = [
  definePgBossWorker<EmailJob>()({
    name: 'global-email-worker',
    queue: 'global/email',
    async handler(jobs) {
      expect(jobs[0]?.data.userId).type.toBe<string | undefined>()
    },
  }),
] as const

declare module '../src/index.js' {
  interface PgBossQueues extends PgBossQueuesFromWorkers<typeof globalWorkers> {}
}

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
    definePgBossWorker<EmailJob>()((workerApp) => {
      expect(workerApp).type.toBe<FastifyInstance>()

      return {
        name: 'welcome-email-worker',
        queue: 'email/welcome',
        async handler(jobs) {
          expect(jobs[0]?.data.userId).type.toBe<string | undefined>()
        },
      }
    }),
  ] as const

  type Queues = PgBossQueuesFromWorkers<typeof workers>

  expect<Queues>().type.toBe<{
    'email/send': EmailJob
    cleanup: CleanupJob
    'email/welcome': EmailJob
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

test('typed send accepts pg-boss SendOptions', () => {
  type Queues = {
    'email/send': EmailJob
  }

  const boss = getPgBoss<Queues>(app)
  const options = {
    priority: 3,
    retryLimit: 5,
    retryDelay: 30,
    retryBackoff: true,
    singletonKey: 'email:user_123',
    expireInSeconds: 60,
  } satisfies SendOptions

  expect(boss.send('email/send', { userId: 'user_123' }, options)).type.toBe<
    Promise<string | null>
  >()
  expect(
    boss.send({
      name: 'email/send',
      data: { userId: 'user_123' },
      options,
    }),
  ).type.toBe<Promise<string | null>>()
  expect(app.pgBoss?.send('global/email', { userId: 'user_123' }, options)).type.toBe<
    Promise<string | null> | undefined
  >()
  expect(
    app.pgBoss?.send({ name: 'global/email', data: { userId: 'user_123' }, options }),
  ).type.toBe<Promise<string | null> | undefined>()
})

test('getPgBoss stays compatible with the untyped pg-boss API by default', () => {
  const boss = getPgBoss(app)

  expect(boss).type.toBe<PgBoss>()
  expect(boss.send('anything')).type.toBe<Promise<string | null>>()
})

test('PgBossQueues module augmentation narrows the fastify pgBoss decorator globally', () => {
  expect(app.pgBoss).type.toBe<TypedPgBoss<{ 'global/email': EmailJob }> | null>()
  expect(app.pgBoss?.send('global/email', { userId: 'user_123' })).type.toBe<
    Promise<string | null> | undefined
  >()
  expect(app.pgBoss?.send({ name: 'global/email', data: { userId: 'user_123' } })).type.toBe<
    Promise<string | null> | undefined
  >()

  // @ts-expect-error  Argument of type '"email/send"' is not assignable to parameter
  app.pgBoss?.send('email/send', { userId: 'user_123' })

  // @ts-expect-error  Type 'number' is not assignable to type 'string'.
  app.pgBoss?.send('global/email', { userId: 123 })

  // @ts-expect-error  Object literal may only specify known properties
  app.pgBoss?.send({ name: 'global/email', data: { olderThanDays: 30 } })
})
