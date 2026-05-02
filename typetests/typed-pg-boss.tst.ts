import type { FastifyInstance } from 'fastify'
import type { PgBoss, SendOptions } from 'pg-boss'
import { expect, test } from 'tstyche'
import {
  definePgBossQueues,
  getPgBoss,
  type PgBossQueuesFromRegistry,
  queue,
  type TypedPgBoss,
} from '../src/index.js'

type EmailJob = {
  userId: string
}

type CleanupJob = {
  olderThanDays: number
}

declare const app: FastifyInstance

const globalQueues = definePgBossQueues({
  'global/email': queue<EmailJob>({ create: true }),
})

declare module '../src/index.js' {
  interface PgBossQueues extends PgBossQueuesFromRegistry<typeof globalQueues> {}
}

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

test('PgBossQueuesFromRegistry derives queue names and payloads from a queue registry', () => {
  const queues = definePgBossQueues({
    'email/send': queue<EmailJob>({ create: true }),
    cleanup: queue<CleanupJob>({ create: false }),
  })

  const workers = [
    queues.worker('email/send', {
      name: 'email-worker',
      async handler(jobs) {
        expect(jobs[0]?.data.userId).type.toBe<string | undefined>()
      },
    }),
    queues.worker('cleanup', (workerApp) => {
      expect(workerApp).type.toBe<FastifyInstance>()

      return {
        name: 'cleanup-worker',
        async handler(jobs) {
          expect(jobs[0]?.data.olderThanDays).type.toBe<number | undefined>()
        },
      }
    }),
  ] as const

  type Queues = PgBossQueuesFromRegistry<typeof queues>

  expect<Queues>().type.toBe<{
    'email/send': EmailJob
    cleanup: CleanupJob
  }>()
  expect(workers[0].queue).type.toBe<'email/send'>()
  expect(workers[1](app).queue).type.toBe<'cleanup'>()

  expect(queues.worker).type.not.toBeCallableWith('email/missing', {
    name: 'missing-worker',
    async handler() {},
  })

  queues.worker('email/send', {
    name: 'invalid-email-worker',
    async handler(jobs) {
      // @ts-expect-error  Property 'olderThanDays' does not exist on type 'EmailJob'.
      jobs[0]?.data.olderThanDays
    },
  })

  expect(queues.worker).type.not.toBeCallableWith('email/send', {
    name: 'queue-override-worker',
    queue: 'other',
    async handler() {},
  })

  expect(queues.worker).type.not.toBeCallableWith('email/send', {
    name: 'create-queue-override-worker',
    createQueue: true,
    async handler() {},
  })

  expect(queues.worker).type.not.toBeCallableWith('email/send', {
    name: 'queue-options-override-worker',
    queueOptions: {
      retryLimit: 9,
    },
    async handler() {},
  })

  expect(queues.worker).type.not.toBeCallableWith('email/send', () => ({
    name: 'factory-queue-override-worker',
    queue: 'other',
    async handler() {},
  }))

  expect(queues.worker).type.not.toBeCallableWith('email/send', () => ({
    name: 'factory-create-queue-override-worker',
    createQueue: true,
    async handler() {},
  }))

  expect(queues.worker).type.not.toBeCallableWith('email/send', () => ({
    name: 'factory-queue-options-override-worker',
    queueOptions: {
      retryLimit: 9,
    },
    async handler() {},
  }))
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
