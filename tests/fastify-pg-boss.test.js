import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import Fastify from 'fastify'
import fastifyPgBoss, { definePgBossWorker, getPgBoss } from '../dist/index.js'
import {
  assertDatabaseAvailable,
  connectionString,
  createSchemaName,
  waitFor,
} from './helpers/database.js'

before(assertDatabaseAvailable)

test('decorates pgBoss as null when disabled', async (t) => {
  const app = Fastify({ logger: false })
  t.after(() => app.close())

  await app.register(fastifyPgBoss, {
    enabled: false,
  })

  assert.equal(app.pgBoss, null)
  assert.throws(() => getPgBoss(app), /pg-boss is not available/)
})

test('registers explicit queues and schedules and can fetch jobs from postgres', async (t) => {
  const app = Fastify({ logger: false })
  t.after(() => app.close())
  const schema = createSchemaName()
  const queue = `${schema}/explicit`

  await app.register(fastifyPgBoss, {
    constructorOptions: {
      connectionString,
      schema,
    },
    queues: [
      {
        name: queue,
        retryDelay: 2,
        retryLimit: 7,
      },
    ],
    schedules: [
      {
        cron: '15 9 * * *',
        data: {
          source: 'explicit-schedule',
        },
        key: 'explicit-daily',
        name: queue,
        options: {
          retryLimit: 1,
          tz: 'UTC',
        },
      },
    ],
  })

  const boss = getPgBoss(app)
  const registeredQueue = await boss.getQueue(queue)
  const schedules = await boss.getSchedules(queue, 'explicit-daily')

  assert.equal(registeredQueue?.name, queue)
  assert.equal(registeredQueue?.retryDelay, 2)
  assert.equal(registeredQueue?.retryLimit, 7)
  assert.equal(schedules.length, 1)
  assert.equal(schedules[0]?.cron, '15 9 * * *')
  assert.equal(schedules[0]?.timezone, 'UTC')
  assert.deepEqual(schedules[0]?.data, { source: 'explicit-schedule' })
  assert.equal(schedules[0]?.options?.retryLimit, 1)

  const jobId = await boss.send(queue, { source: 'send' }, { priority: 3 })
  assert.equal(typeof jobId, 'string')

  const jobs = await boss.fetch(queue, {
    batchSize: 1,
    includeMetadata: true,
  })

  assert.equal(jobs.length, 1)
  assert.equal(jobs[0]?.id, jobId)
  assert.equal(jobs[0]?.name, queue)
  assert.equal(jobs[0]?.priority, 3)
  assert.equal(jobs[0]?.state, 'active')
  assert.deepEqual(jobs[0]?.data, { source: 'send' })

  await boss.complete(queue, jobId, { processed: true })

  const completedJobs = await boss.findJobs(queue, { id: jobId })
  assert.equal(completedJobs.length, 1)
  assert.equal(completedJobs[0]?.state, 'completed')
  assert.deepEqual(completedJobs[0]?.output, { processed: true })
})

test('registers worker queues, worker schedules, and processes jobs', async (t) => {
  const app = Fastify({ logger: false })
  t.after(() => app.close())
  const schema = createSchemaName()
  const queue = `${schema}/daily`

  let resolveProcessed
  const processed = new Promise((resolve) => {
    resolveProcessed = resolve
  })

  await app.register(fastifyPgBoss, {
    constructorOptions: {
      connectionString,
      schema,
    },
    workers: [
      definePgBossWorker({
        name: 'daily-worker',
        queue,
        createQueue: true,
        queueOptions: {
          retryBackoff: true,
          retryLimit: 3,
        },
        schedule: {
          cron: '0 8 * * *',
          data: {
            source: 'schedule',
          },
          key: 'daily',
          tz: 'UTC',
        },
        options: {
          pollingIntervalSeconds: 0.5,
        },
        async handler(jobs) {
          resolveProcessed(jobs)
        },
      }),
    ],
  })

  const boss = getPgBoss(app)
  const registeredQueue = await boss.getQueue(queue)
  const schedules = await boss.getSchedules(queue, 'daily')

  assert.equal(registeredQueue?.name, queue)
  assert.equal(registeredQueue?.retryLimit, 3)
  assert.equal(registeredQueue?.retryBackoff, true)
  assert.equal(schedules.length, 1)
  assert.equal(schedules[0]?.cron, '0 8 * * *')
  assert.equal(schedules[0]?.timezone, 'UTC')
  assert.deepEqual(schedules[0]?.data, { source: 'schedule' })

  const jobId = await boss.send(queue, { hello: 'world' })
  const jobs = await waitFor(processed, 10_000, 'worker did not process the sent job')

  assert.equal(typeof jobId, 'string')
  assert.equal(jobs.length, 1)
  assert.equal(jobs[0].name, queue)
  assert.deepEqual(jobs[0].data, { hello: 'world' })
})

test('worker factories can access the fastify instance during registration', async (t) => {
  const app = Fastify({ logger: false })
  t.after(() => app.close())
  const schema = createSchemaName()
  const queue = `${schema}/fastify-aware`

  let resolveProcessed
  const processed = new Promise((resolve) => {
    resolveProcessed = resolve
  })

  await app.register(fastifyPgBoss, {
    constructorOptions: {
      connectionString,
      schema,
    },
    workers: [
      definePgBossWorker((workerApp) => {
        assert.equal(workerApp, app)

        return {
          name: 'fastify-aware-worker',
          queue,
          createQueue: true,
          options: {
            pollingIntervalSeconds: 0.5,
          },
          async handler(jobs) {
            resolveProcessed(jobs)
          },
        }
      }),
    ],
  })

  const jobId = await getPgBoss(app).send(queue, { hello: 'fastify' })
  const jobs = await waitFor(processed, 10_000, 'worker did not process job')

  assert.equal(typeof jobId, 'string')
  assert.equal(jobs.length, 1)
  assert.equal(jobs[0].name, queue)
  assert.deepEqual(jobs[0].data, { hello: 'fastify' })
})

test('worker object handlers receive only jobs', async (t) => {
  const app = Fastify({ logger: false })
  t.after(() => app.close())
  const schema = createSchemaName()
  const queue = `${schema}/direct-worker`

  let resolveProcessed
  const processed = new Promise((resolve) => {
    resolveProcessed = resolve
  })

  await app.register(fastifyPgBoss, {
    constructorOptions: {
      connectionString,
      schema,
    },
    workers: [
      definePgBossWorker({
        name: 'direct-worker',
        queue,
        createQueue: true,
        options: {
          pollingIntervalSeconds: 0.5,
        },
        async handler(...args) {
          resolveProcessed(args)
        },
      }),
    ],
  })

  const jobId = await getPgBoss(app).send(queue, { source: 'direct-handler' })
  const args = await waitFor(processed, 10_000, 'worker object handler did not process job')
  const [jobs] = args

  assert.equal(typeof jobId, 'string')
  assert.equal(args.length, 1)
  assert.equal(jobs.length, 1)
  assert.equal(jobs[0].name, queue)
  assert.deepEqual(jobs[0].data, { source: 'direct-handler' })
})

test('plugin skips disabled workers and disabled worker schedules', async (t) => {
  const app = Fastify({ logger: false })
  t.after(() => app.close())
  const schema = createSchemaName()
  const disabledWorkerQueue = `${schema}/disabled-worker`
  const disabledScheduleQueue = `${schema}/disabled-schedule`

  await app.register(fastifyPgBoss, {
    constructorOptions: {
      connectionString,
      schema,
    },
    workers: [
      definePgBossWorker({
        enabled: false,
        name: 'disabled-worker',
        queue: disabledWorkerQueue,
        createQueue: true,
        async handler() {},
      }),
      definePgBossWorker({
        name: 'disabled-schedule-worker',
        queue: disabledScheduleQueue,
        createQueue: true,
        schedule: {
          cron: '0 8 * * *',
          enabled: false,
          key: 'disabled',
        },
        async handler() {},
      }),
    ],
  })

  const boss = getPgBoss(app)
  const disabledWorkerQueueResult = await boss.getQueue(disabledWorkerQueue)
  const disabledScheduleQueueResult = await boss.getQueue(disabledScheduleQueue)
  const disabledSchedules = await boss.getSchedules(disabledScheduleQueue, 'disabled')

  assert.equal(disabledWorkerQueueResult, null)
  assert.equal(disabledScheduleQueueResult?.name, disabledScheduleQueue)
  assert.equal(disabledSchedules.length, 0)
})

test('supports the cron string worker schedule shortcut', async (t) => {
  const app = Fastify({ logger: false })
  t.after(() => app.close())
  const schema = createSchemaName()
  const queue = `${schema}/shortcut`

  await app.register(fastifyPgBoss, {
    constructorOptions: {
      connectionString,
      schema,
    },
    workers: [
      definePgBossWorker({
        name: queue,
        createQueue: true,
        schedule: '*/5 * * * *',
        options: {
          pollingIntervalSeconds: 30,
        },
        async handler() {},
      }),
    ],
  })

  const schedules = await getPgBoss(app).getSchedules(queue)

  assert.equal(schedules.length, 1)
  assert.equal(schedules[0]?.name, queue)
  assert.equal(schedules[0]?.cron, '*/5 * * * *')
})
