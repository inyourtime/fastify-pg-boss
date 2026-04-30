import type { FastifyInstance } from 'fastify'
import type { Job, JobWithMetadata, WorkHandler } from 'pg-boss'
import { expect, test } from 'tstyche'
import {
  definePgBossWorker,
  type PgBossWorkerDefinition,
  type PgBossWorkerDefinitionFactory,
  type PgBossWorkerRegistration,
} from '../src/index.js'

type OnThisDayJobData = {
  date?: string
  urlTemplate?: string
}

test('definePgBossWorker accepts a plain worker handler', () => {
  const worker = definePgBossWorker<OnThisDayJobData>({
    name: 'on-this-day',
    async handler(jobs) {
      expect(jobs).type.toBe<Job<OnThisDayJobData>[]>()
      expect(jobs[0]?.data).type.toBe<OnThisDayJobData | undefined>()
    },
  })

  expect(worker).type.toBeAssignableTo<PgBossWorkerDefinition<OnThisDayJobData>>()
})

test('definePgBossWorker rejects handlers that require the Fastify instance', () => {
  expect<PgBossWorkerDefinition<OnThisDayJobData>>().type.not.toBeAssignableFrom({
    name: 'on-this-day',
    async handler(_jobs: Job<OnThisDayJobData>[], _app: FastifyInstance) {},
  })
})

test('definePgBossWorker accepts a Fastify-aware worker factory', () => {
  function createOnThisDayWorker(app: FastifyInstance): WorkHandler<OnThisDayJobData> {
    expect(app).type.toBe<FastifyInstance>()

    return async (jobs) => {
      expect(jobs).type.toBe<Job<OnThisDayJobData>[]>()
    }
  }

  const worker = definePgBossWorker<OnThisDayJobData>((app) => ({
    name: 'on-this-day',
    queue: 'notifications/on-this-day/daily',
    createQueue: true,
    handler: createOnThisDayWorker(app),
  }))

  expect(worker).type.toBeAssignableTo<PgBossWorkerDefinitionFactory<OnThisDayJobData>>()
  expect(worker).type.toBeAssignableTo<PgBossWorkerRegistration<OnThisDayJobData>>()
})

test('definePgBossWorker preserves metadata job handler types', () => {
  const worker = definePgBossWorker<OnThisDayJobData>({
    name: 'on-this-day-metadata',
    includeMetadata: true,
    options: {
      includeMetadata: true,
    },
    async handler(jobs) {
      expect(jobs).type.toBe<JobWithMetadata<OnThisDayJobData>[]>()
      expect(jobs[0]?.state).type.toBe<
        'created' | 'retry' | 'active' | 'completed' | 'cancelled' | 'failed' | undefined
      >()
    },
  })

  expect(worker).type.toBeAssignableTo<PgBossWorkerDefinition<OnThisDayJobData>>()
})
