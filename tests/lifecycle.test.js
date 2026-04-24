import assert from 'node:assert/strict'
import { Writable } from 'node:stream'
import { before, test } from 'node:test'
import Fastify from 'fastify'
import pino from 'pino'
import { PgBoss } from 'pg-boss'
import fastifyPgBoss, {
  definePgBossQueue,
  definePgBossSchedule,
  definePgBossWorker,
  getPgBoss,
} from '../dist/index.js'
import {
  attachPgBossEventHandlers,
  closeWorkers,
  createBoss,
  getWorkerSchedule,
  registerQueue,
  registerSchedule,
  registerWorker,
  resolveWorkerDefinition,
} from '../dist/lifecycle.js'
import {
  assertDatabaseAvailable,
  connectionString,
  createSchemaName,
  waitFor,
} from './helpers/database.js'

before(assertDatabaseAvailable)

function createLoggerInstance() {
  const entries = []
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      entries.push(JSON.parse(chunk.toString()))
      callback()
    },
  })

  return {
    entries,
    logger: pino(stream),
  }
}

async function waitUntil(predicate, timeoutMs, message) {
  const startedAt = Date.now()

  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(message)
    }

    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

async function createStartedBoss(t, schema = createSchemaName()) {
  const boss = new PgBoss({
    connectionString,
    schema,
  })

  t.after(async () => {
    await boss.stop({ close: true })
  })

  await boss.start()
  assert.equal(await boss.isInstalled(), true)

  return {
    boss,
    schema,
  }
}

async function assertStartsAgainstPostgres(t, boss) {
  t.after(async () => {
    await boss.stop({ close: true })
  })

  await boss.start()
  assert.equal(await boss.isInstalled(), true)
}

test('definition helpers return the provided definitions', () => {
  const queue = { name: 'queue', retryLimit: 1 }
  const schedule = { cron: '* * * * *', name: 'queue' }
  const worker = { async handler() {}, name: 'queue' }
  const workerFactory = () => worker

  assert.equal(definePgBossQueue(queue), queue)
  assert.equal(definePgBossSchedule(schedule), schedule)
  assert.equal(definePgBossWorker(worker), worker)
  assert.equal(definePgBossWorker(workerFactory), workerFactory)
})

test('resolves worker definition factories with the fastify instance', async (t) => {
  const app = Fastify({ logger: false })
  t.after(() => app.close())
  const worker = { async handler() {}, name: 'queue' }
  const workerFactory = (fastify) => {
    assert.equal(fastify, app)
    return worker
  }

  assert.equal(resolveWorkerDefinition(app, worker), worker)
  assert.equal(resolveWorkerDefinition(app, workerFactory), worker)
})

test('createBoss supports every constructor path against postgres and rejects missing configuration', async (t) => {
  const app = Fastify({ logger: false })
  t.after(() => app.close())

  const existingBoss = new PgBoss({ connectionString, schema: createSchemaName() })
  const factoryBoss = new PgBoss({ connectionString, schema: createSchemaName() })

  assert.equal(await createBoss(app, { boss: existingBoss }), existingBoss)
  await assertStartsAgainstPostgres(t, existingBoss)

  assert.equal(await createBoss(app, { boss: () => factoryBoss }), factoryBoss)
  await assertStartsAgainstPostgres(t, factoryBoss)

  await assertStartsAgainstPostgres(
    t,
    await createBoss(app, {
      boss: {
        connectionString,
        schema: createSchemaName(),
      },
    }),
  )
  await assertStartsAgainstPostgres(
    t,
    await createBoss(app, {
      constructorOptions: {
        connectionString,
        schema: createSchemaName(),
      },
    }),
  )
  await assertStartsAgainstPostgres(
    t,
    await createBoss(app, {
      connectionString,
    }),
  )
  await assertStartsAgainstPostgres(
    t,
    await createBoss(app, {
      boss: connectionString,
    }),
  )
  await assert.rejects(() => createBoss(app, {}), /requires boss, connectionString/)
})

test('attaches pg-boss event handlers and logs handler failures through a fastify logger instance', async (t) => {
  const { boss } = await createStartedBoss(t)
  const { entries, logger } = createLoggerInstance()
  const app = Fastify({ loggerInstance: logger })
  const seen = []
  t.after(() => app.close())

  attachPgBossEventHandlers(app, boss, {
    events: {
      bam(_app, data) {
        seen.push(['bam', data])
        throw new Error('bam handler failed')
      },
      error(_app, error) {
        seen.push(['error', error.message])
        throw new Error('custom error handler failed')
      },
      stopped() {
        seen.push(['stopped'])
        throw new Error('stopped handler failed')
      },
      warning(_app, warning) {
        seen.push(['warning', warning.message])
        throw new Error('warning handler failed')
      },
      wip(_app, data) {
        seen.push(['wip', data.length])
        throw new Error('wip handler failed')
      },
    },
  })

  boss.emit('error', new Error('boom'))
  boss.emit('warning', { data: {}, message: 'warn' })
  boss.emit('wip', [{ id: 'worker' }])
  boss.emit('stopped')
  boss.emit('bam', { id: 'bam' })

  await waitUntil(() => entries.length >= 6, 1_000, 'event handler logs were not written')

  assert.deepEqual(seen, [
    ['error', 'boom'],
    ['warning', 'warn'],
    ['wip', 1],
    ['stopped'],
    ['bam', { id: 'bam' }],
  ])
  assert.equal(entries.filter((entry) => entry.msg === 'pg-boss error').length, 1)
  assert.equal(entries.filter((entry) => entry.msg === 'pg-boss event handler failed').length, 5)
})

test('can skip the default error logger on a real boss', async (t) => {
  const { boss } = await createStartedBoss(t)
  const { entries, logger } = createLoggerInstance()
  const app = Fastify({ loggerInstance: logger })
  const listenerCount = boss.listenerCount('error')
  t.after(() => app.close())

  attachPgBossEventHandlers(app, boss, {
    logErrors: false,
  })

  assert.equal(boss.listenerCount('error'), listenerCount)
  assert.equal(entries.length, 0)
})

test('registers queues, schedules, and workers against postgres across branches', async (t) => {
  const { boss, schema } = await createStartedBoss(t)
  const stringQueue = `${schema}/string-queue`
  const objectQueue = `${schema}/object-queue`
  const disabledScheduleQueue = `${schema}/disabled-schedule`
  const scheduledQueue = `${schema}/scheduled`
  const keyedScheduleQueue = `${schema}/keyed-schedule`
  const disabledWorkerQueue = `${schema}/disabled-worker`
  const plainWorkerQueue = `${schema}/plain-worker`
  const scheduledWorkerQueue = `${schema}/scheduled-worker`
  const metadataQueue = `${schema}/metadata-queue`
  const fastifyMetadataQueue = `${schema}/fastify-metadata-queue`
  const app = Fastify({ logger: false })
  let resolvePlainWorker
  let resolveMetadataWorker
  let resolveFastifyMetadataWorker
  const plainWorkerJobs = new Promise((resolve) => {
    resolvePlainWorker = resolve
  })
  const metadataWorkerJobs = new Promise((resolve) => {
    resolveMetadataWorker = resolve
  })
  const fastifyMetadataWorkerJobs = new Promise((resolve) => {
    resolveFastifyMetadataWorker = resolve
  })

  t.after(() => app.close())

  await registerQueue(boss, stringQueue)
  await registerQueue(boss, { name: objectQueue, retryLimit: 2 })
  await registerQueue(boss, scheduledQueue)
  await registerQueue(boss, keyedScheduleQueue)
  await registerQueue(boss, plainWorkerQueue)
  await registerQueue(boss, scheduledWorkerQueue)
  await registerQueue(boss, fastifyMetadataQueue)
  await registerSchedule(boss, {
    cron: '* * * * *',
    enabled: false,
    name: disabledScheduleQueue,
  })
  await registerSchedule(boss, {
    cron: '* * * * *',
    data: { ok: true },
    name: scheduledQueue,
    options: { retryLimit: 3 },
  })
  await registerSchedule(boss, {
    cron: '*/5 * * * *',
    key: 'keyed',
    name: keyedScheduleQueue,
    options: { retryLimit: 4 },
  })
  await registerWorker(boss, {
    enabled: false,
    async handler() {},
    name: disabledWorkerQueue,
  })
  await registerWorker(boss, {
    async handler(jobs) {
      resolvePlainWorker(jobs)
    },
    name: plainWorkerQueue,
  })
  await registerWorker(boss, {
    async handler() {},
    name: scheduledWorkerQueue,
    schedule: { cron: '* * * * *', enabled: false },
  })
  await registerWorker(boss, {
    async handler(jobs) {
      resolveMetadataWorker(jobs)
    },
    includeMetadata: true,
    name: 'metadata-worker',
    options: { batchSize: 1, includeMetadata: true, pollingIntervalSeconds: 0.5 },
    queue: metadataQueue,
    queueOptions: { retryLimit: 5 },
  })
  await registerWorker(
    boss,
    {
      async handler(jobs, fastify) {
        resolveFastifyMetadataWorker({ fastify, jobs })
      },
      includeMetadata: true,
      name: 'fastify-metadata-worker',
      queue: fastifyMetadataQueue,
    },
    app,
  )

  const stringQueueResult = await boss.getQueue(stringQueue)
  const objectQueueResult = await boss.getQueue(objectQueue)
  const metadataQueueResult = await boss.getQueue(metadataQueue)
  const disabledSchedule = await boss.getSchedules(disabledScheduleQueue)
  const scheduled = await boss.getSchedules(scheduledQueue)
  const keyed = await boss.getSchedules(keyedScheduleQueue, 'keyed')

  assert.equal(stringQueueResult?.name, stringQueue)
  assert.equal(objectQueueResult?.retryLimit, 2)
  assert.equal(metadataQueueResult?.retryLimit, 5)
  assert.equal(disabledSchedule.length, 0)
  assert.equal(scheduled.length, 1)
  assert.deepEqual(scheduled[0]?.data, { ok: true })
  assert.equal(scheduled[0]?.options?.retryLimit, 3)
  assert.equal(keyed.length, 1)
  assert.equal(keyed[0]?.key, 'keyed')
  assert.equal(keyed[0]?.options?.retryLimit, 4)

  await boss.send(plainWorkerQueue, { plain: true })
  await boss.send(metadataQueue, { metadata: true })
  await boss.send(fastifyMetadataQueue, { fastifyMetadata: true })

  const plainJobs = await waitFor(plainWorkerJobs, 10_000, 'plain worker did not process a job')
  const metadataJobs = await waitFor(
    metadataWorkerJobs,
    10_000,
    'metadata worker did not process a job',
  )
  const fastifyMetadataJobs = await waitFor(
    fastifyMetadataWorkerJobs,
    10_000,
    'fastify metadata worker did not process a job',
  )

  assert.deepEqual(plainJobs[0]?.data, { plain: true })
  assert.equal(metadataJobs[0]?.state, 'active')
  assert.deepEqual(metadataJobs[0]?.data, { metadata: true })
  assert.equal(fastifyMetadataJobs.fastify, app)
  assert.equal(fastifyMetadataJobs.jobs[0]?.state, 'active')
  assert.deepEqual(fastifyMetadataJobs.jobs[0]?.data, { fastifyMetadata: true })

  await closeWorkers(boss)
  await closeWorkers(boss, [
    { enabled: false, async handler() {}, name: disabledWorkerQueue },
    { async handler() {}, name: plainWorkerQueue, offWorkOnClose: false },
    { async handler() {}, name: scheduledWorkerQueue, offWorkOptions: { wait: true } },
    { async handler() {}, name: 'metadata-worker', queue: metadataQueue },
    { async handler() {}, name: 'fastify-metadata-worker', queue: fastifyMetadataQueue },
  ])
})

test('maps worker schedule shortcuts', () => {
  assert.equal(getWorkerSchedule({ async handler() {}, name: 'plain' }), null)
  assert.deepEqual(getWorkerSchedule({ async handler() {}, name: 'plain', schedule: '0 1 * * *' }), {
    cron: '0 1 * * *',
    name: 'plain',
  })
  assert.deepEqual(
    getWorkerSchedule({
      async handler() {},
      name: 'worker',
      queue: 'queue',
      schedule: {
        cron: '0 2 * * *',
        data: { ok: true },
        name: 'override',
      },
    }),
    {
      cron: '0 2 * * *',
      data: { ok: true },
      name: 'override',
    },
  )
})

test('plugin registers explicit queues and schedules with a started boss factory', async (t) => {
  const { boss, schema } = await createStartedBoss(t)
  const { logger } = createLoggerInstance()
  const app = Fastify({ loggerInstance: logger })
  const queue = `${schema}/explicit-queue`
  t.after(() => app.close())

  await app.register(fastifyPgBoss, {
    boss: () => boss,
    queues: [queue],
    schedules: [{ cron: '* * * * *', name: queue }],
    start: false,
    stopOnClose: false,
    workers: [{ async handler() {}, name: queue }],
  })

  assert.equal(app.pgBoss, boss)
  assert.equal((await boss.getQueue(queue))?.name, queue)
  assert.equal((await boss.getSchedules(queue)).length, 1)
})

test('plugin onClose handles already-cleared pgBoss decorators', async (t) => {
  const boss = new PgBoss({
    connectionString,
    schema: createSchemaName(),
  })
  const { logger } = createLoggerInstance()
  const app = Fastify({ loggerInstance: logger })
  t.after(async () => {
    await boss.stop({ close: true })
  })

  await app.register(fastifyPgBoss, {
    boss: () => boss,
    stopOptions: { graceful: true },
  })

  assert.equal(await boss.isInstalled(), true)
  app.pgBoss = null
  await app.close()
  assert.equal(await boss.isInstalled(), true)
})

test('plugin stops and clears pgBoss on close', async () => {
  const { logger } = createLoggerInstance()
  const app = Fastify({ loggerInstance: logger })
  const schema = createSchemaName()

  await app.register(fastifyPgBoss, {
    constructorOptions: {
      connectionString,
      schema,
    },
    stopOptions: { graceful: true },
    workers: [{ createQueue: true, async handler() {}, name: `${schema}/worker` }],
  })

  await app.close()
  assert.equal(app.pgBoss, null)
})
