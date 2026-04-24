import { PgBoss } from 'pg-boss'
import type { FastifyInstance } from 'fastify'
import type {
  FastifyPgBossOptions,
  PgBossQueueDefinition,
  PgBossScheduleDefinition,
  PgBossWorkerDefinition,
} from './types.js'

export async function createBoss(
  fastify: FastifyInstance,
  options: FastifyPgBossOptions,
): Promise<PgBoss> {
  if (options.boss instanceof PgBoss) {
    return options.boss
  }

  if (typeof options.boss === 'function') {
    return options.boss(fastify)
  }

  if (typeof options.boss === 'string') {
    return new PgBoss(options.boss)
  }

  if (typeof options.boss === 'object') {
    return new PgBoss(options.boss)
  }

  if (options.connectionString) {
    return new PgBoss(options.connectionString)
  }

  if (options.constructorOptions) {
    return new PgBoss(options.constructorOptions)
  }

  throw new Error(
    'fastify-pg-boss requires boss, connectionString, or constructorOptions when enabled.',
  )
}

export function attachPgBossEventHandlers(
  fastify: FastifyInstance,
  boss: PgBoss,
  options: FastifyPgBossOptions,
) {
  if (options.logErrors !== false) {
    boss.on('error', (error) => {
      fastify.log.error({ err: error }, 'pg-boss error')
    })
  }

  const eventHandlers = options.events ?? {}

  if (eventHandlers.error) {
    boss.on('error', (error) => {
      void Promise.resolve()
        .then(() => eventHandlers.error?.(fastify, error))
        .catch((err) => {
          fastify.log.error({ err, event: 'error' }, 'pg-boss event handler failed')
        })
    })
  }

  if (eventHandlers.warning) {
    boss.on('warning', (warning) => {
      void Promise.resolve()
        .then(() => eventHandlers.warning?.(fastify, warning))
        .catch((error) => {
          fastify.log.error({ err: error, event: 'warning' }, 'pg-boss event handler failed')
        })
    })
  }

  if (eventHandlers.wip) {
    boss.on('wip', (data) => {
      void Promise.resolve()
        .then(() => eventHandlers.wip?.(fastify, data))
        .catch((error) => {
          fastify.log.error({ err: error, event: 'wip' }, 'pg-boss event handler failed')
        })
    })
  }

  if (eventHandlers.stopped) {
    boss.on('stopped', () => {
      void Promise.resolve()
        .then(() => eventHandlers.stopped?.(fastify))
        .catch((error) => {
          fastify.log.error({ err: error, event: 'stopped' }, 'pg-boss event handler failed')
        })
    })
  }

  if (eventHandlers.bam) {
    boss.on('bam', (data) => {
      void Promise.resolve()
        .then(() => eventHandlers.bam?.(fastify, data))
        .catch((error) => {
          fastify.log.error({ err: error, event: 'bam' }, 'pg-boss event handler failed')
        })
    })
  }
}

export async function registerQueue(boss: PgBoss, queue: PgBossQueueDefinition) {
  if (typeof queue === 'string') {
    await boss.createQueue(queue)
    return
  }

  const { name, ...options } = queue
  await boss.createQueue(name, options)
}

export async function registerSchedule(boss: PgBoss, schedule: PgBossScheduleDefinition) {
  if (schedule.enabled === false) {
    return
  }

  const options = schedule.key
    ? {
        ...schedule.options,
        key: schedule.key,
      }
    : schedule.options

  await boss.schedule(schedule.name, schedule.cron, schedule.data ?? null, options)
}

export function getWorkerSchedule<ReqData extends object>(
  worker: PgBossWorkerDefinition<ReqData>,
): PgBossScheduleDefinition<ReqData> | null {
  if (!worker.schedule) {
    return null
  }

  const queue = worker.queue ?? worker.name

  if (typeof worker.schedule === 'string') {
    return {
      cron: worker.schedule,
      name: queue,
    }
  }

  const { tz, ...schedule } = worker.schedule
  const options = tz
    ? {
        ...schedule.options,
        tz,
      }
    : schedule.options

  const definition: PgBossScheduleDefinition<ReqData> = {
    ...schedule,
    name: schedule.name ?? queue,
  }

  if (options) {
    definition.options = options
  }

  return definition
}

export async function registerWorker(boss: PgBoss, worker: PgBossWorkerDefinition) {
  if (worker.enabled === false) {
    return
  }

  const queue = worker.queue ?? worker.name

  if (worker.createQueue || worker.queueOptions) {
    await boss.createQueue(queue, worker.queueOptions)
  }

  const schedule = getWorkerSchedule(worker)
  if (schedule) {
    await registerSchedule(boss, schedule)
  }

  if (worker.includeMetadata) {
    await boss.work(queue, { ...worker.options, includeMetadata: true }, worker.handler)
    return
  }

  await boss.work(queue, worker.options ?? {}, worker.handler)
}

export async function closeWorkers(boss: PgBoss, workers: PgBossWorkerDefinition[] = []) {
  for (const worker of workers) {
    if (worker.enabled === false || worker.offWorkOnClose === false) {
      continue
    }

    await boss.offWork(worker.queue ?? worker.name, worker.offWorkOptions)
  }
}
