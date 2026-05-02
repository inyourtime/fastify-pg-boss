import Fastify, { type FastifyInstance } from 'fastify'
import { expect, test } from 'tstyche'
import fastifyPgBoss, {
  definePgBossQueues,
  definePgBossWorker,
  fastifyPgBoss as namedFastifyPgBoss,
  queue,
} from '../src/index.js'

type EmailJobData = {
  userId: string
}

type CleanupJobData = {
  olderThanDays: number
}

test('Fastify accepts the default plugin export during registration', () => {
  const app = Fastify()

  expect(app.register).type.toBeCallableWith(fastifyPgBoss, {
    enabled: false,
  })
  expect(app.register(fastifyPgBoss, { enabled: false })).type.toBeAssignableTo<FastifyInstance>()
})

test('Fastify accepts the named plugin export during registration', () => {
  const app = Fastify()

  expect(app.register).type.toBeCallableWith(namedFastifyPgBoss, {
    connectionString: 'postgres://example',
    start: false,
    workers: [
      definePgBossWorker<EmailJobData>({
        name: 'email-worker',
        queue: 'email/send',
        async handler(jobs) {
          expect(jobs[0]?.data.userId).type.toBe<string | undefined>()
        },
      }),
    ],
  })
})

test('Fastify registration accepts workers declared as a readonly tuple', () => {
  const app = Fastify()
  const workers = [
    definePgBossWorker<EmailJobData>()({
      name: 'email-worker',
      queue: 'email/send',
      async handler(jobs) {
        expect(jobs[0]?.data.userId).type.toBe<string | undefined>()
      },
    }),
    definePgBossWorker<CleanupJobData>()({
      name: 'cleanup',
      async handler(jobs) {
        expect(jobs[0]?.data.olderThanDays).type.toBe<number | undefined>()
      },
    }),
  ] as const

  expect(app.register).type.toBeCallableWith(fastifyPgBoss, {
    connectionString: 'postgres://example',
    start: false,
    workers,
  })
})

test('Fastify registration accepts a typed queue registry', () => {
  const app = Fastify()
  const queues = definePgBossQueues({
    'email/send': queue<EmailJobData>({ create: true }),
  })

  expect(app.register).type.toBeCallableWith(fastifyPgBoss, {
    connectionString: 'postgres://example',
    queueRegistry: queues,
    start: false,
    workers: [
      queues.worker('email/send', {
        name: 'email-worker',
        async handler(jobs) {
          expect(jobs[0]?.data.userId).type.toBe<string | undefined>()
        },
      }),
    ],
  })
})

test('Fastify registration rejects invalid plugin options', () => {
  const app = Fastify()

  expect(app.register).type.not.toBeCallableWith(fastifyPgBoss, {
    enabled: false,
    unknownOption: true,
  })
})
