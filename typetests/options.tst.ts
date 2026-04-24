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
    async handler(jobs, app) {
      expect(jobs[0]?.data.olderThanDays).type.toBe<number | undefined>()
      expect(app).type.toBe<FastifyInstance>()
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
    PgBossWorkerDefinition<CleanupJobData> | PgBossWorkerDefinitionFactory<CleanupJobData> | undefined
  >()
  expect(options.workers[1]).type.toBeAssignableTo<
    PgBossWorkerDefinition<CleanupJobData> | PgBossWorkerDefinitionFactory<CleanupJobData> | undefined
  >()
})

test('FastifyPgBossOptions rejects unknown option keys', () => {
  expect<FastifyPgBossOptions>().type.not.toBeAssignableFrom({
    connectionString: 'postgres://example',
    unknownOption: true,
  })
})
