import type { FastifyInstance } from 'fastify'
import { PgBoss } from 'pg-boss'
import { expect, test } from 'tstyche'
import {
  definePgBossWorker,
  type FastifyPgBossOptions,
  type PgBossWorkerDefinition,
  type PgBossWorkerDefinitionFactory,
} from '../src/index.js'

type CleanupJobData = {
  olderThanDays: number
}

test('FastifyPgBossOptions accepts the complete plugin option surface', () => {
  const options = {
    enabled: true,
    boss: 'postgres://example',
    connectionString: 'postgres://example',
    constructorOptions: {
      connectionString: 'postgres://example',
      schema: 'jobs',
      schedule: false,
      supervise: false,
      migrate: false,
      createSchema: false,
      warningSlowQuerySeconds: 30,
      warningQueueSize: 100,
      __test__enableSpies: true,
    },
    start: false,
    stopOnClose: false,
    stopOptions: {
      close: true,
      graceful: true,
      timeout: 1000,
    },
    queues: [
      'email/send',
      {
        name: 'reports/daily',
        retryLimit: 3,
        retryDelay: 30,
        retryBackoff: true,
        retryDelayMax: 120,
        expireInSeconds: 900,
        retentionSeconds: 1209600,
        deleteAfterSeconds: 604800,
        policy: 'singleton',
        partition: true,
        deadLetter: 'reports/dead-letter',
        warningQueueSize: 100,
        heartbeatSeconds: 30,
      },
    ],
    schedules: [
      {
        name: 'reports/daily',
        cron: '0 8 * * *',
        data: {
          source: 'schedule',
        },
        enabled: false,
        key: 'daily-report',
        options: {
          tz: 'UTC',
          priority: 1,
          retryLimit: 1,
          singletonKey: 'daily-report',
        },
      },
    ],
    workers: [
      definePgBossWorker<CleanupJobData>({
        name: 'cleanup',
        async handler(jobs) {
          expect(jobs[0]?.data.olderThanDays).type.toBe<number | undefined>()
        },
      }),
    ],
    events: {
      stopped(app) {
        expect(app).type.toBe<FastifyInstance>()
      },
    },
    logErrors: false,
  } satisfies FastifyPgBossOptions

  expect(options).type.toBeAssignableTo<FastifyPgBossOptions>()
})

test('FastifyPgBossOptions accepts every boss construction path', () => {
  const boss = new PgBoss('postgres://example')

  expect<FastifyPgBossOptions>().type.toBeAssignableFrom({
    boss,
  })
  expect<FastifyPgBossOptions>().type.toBeAssignableFrom({
    boss: 'postgres://example',
  })
  expect<FastifyPgBossOptions>().type.toBeAssignableFrom({
    boss: {
      connectionString: 'postgres://example',
      schema: 'jobs',
    },
  })
  expect<FastifyPgBossOptions>().type.toBeAssignableFrom({
    boss(app: FastifyInstance) {
      expect(app).type.toBe<FastifyInstance>()

      return boss
    },
  })
  expect<FastifyPgBossOptions>().type.toBeAssignableFrom({
    async boss(app: FastifyInstance) {
      expect(app).type.toBe<FastifyInstance>()

      return boss
    },
  })
})

test('FastifyPgBossOptions accepts typed worker objects and factories', () => {
  const worker = definePgBossWorker<CleanupJobData>({
    name: 'cleanup',
    async handler(jobs) {
      expect(jobs[0]?.data.olderThanDays).type.toBe<number | undefined>()
    },
  })

  const workerFactory = definePgBossWorker<CleanupJobData>((app) => {
    expect(app).type.toBe<FastifyInstance>()

    return {
      name: 'cleanup-factory',
      async handler(jobs) {
        expect(jobs[0]?.data.olderThanDays).type.toBe<number | undefined>()
      },
    }
  })

  const options = {
    connectionString: 'postgres://example',
    workers: [worker, workerFactory],
  } satisfies FastifyPgBossOptions

  expect(options.workers[0]).type.toBeAssignableTo<
    | PgBossWorkerDefinition<CleanupJobData>
    | PgBossWorkerDefinitionFactory<CleanupJobData>
    | undefined
  >()
  expect(options.workers[1]).type.toBeAssignableTo<
    | PgBossWorkerDefinition<CleanupJobData>
    | PgBossWorkerDefinitionFactory<CleanupJobData>
    | undefined
  >()
})

test('FastifyPgBossOptions accepts readonly option arrays', () => {
  const queues = ['cleanup', { name: 'reports/daily', retryLimit: 3 }] as const
  const schedules = [
    {
      name: 'cleanup',
      cron: '0 0 * * *',
      data: {
        olderThanDays: 30,
      },
    },
  ] as const
  const workers = [
    definePgBossWorker<CleanupJobData>()({
      name: 'cleanup',
      async handler(jobs) {
        expect(jobs[0]?.data.olderThanDays).type.toBe<number | undefined>()
      },
    }),
  ] as const

  expect<FastifyPgBossOptions>().type.toBeAssignableFrom({
    connectionString: 'postgres://example',
    queues,
    schedules,
    workers,
  })
})

test('FastifyPgBossOptions rejects unknown option keys', () => {
  expect<FastifyPgBossOptions>().type.not.toBeAssignableFrom({
    connectionString: 'postgres://example',
    unknownOption: true,
  })
})

test('FastifyPgBossOptions rejects invalid nested option keys', () => {
  expect<FastifyPgBossOptions>().type.not.toBeAssignableFrom({
    queues: [
      {
        name: 'cleanup',
        unknownQueueOption: true,
      },
    ],
  })

  expect<FastifyPgBossOptions>().type.not.toBeAssignableFrom({
    schedules: [
      {
        name: 'cleanup',
        cron: '0 0 * * *',
        unknownScheduleOption: true,
      },
    ],
  })

  expect<FastifyPgBossOptions>().type.not.toBeAssignableFrom({
    stopOptions: {
      graceful: true,
      unknownStopOption: true,
    },
  })

  expect<FastifyPgBossOptions>().type.not.toBeAssignableFrom({
    events: {
      completed() {},
    },
  })
})
