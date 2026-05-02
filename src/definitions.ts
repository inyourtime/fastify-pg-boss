import type { FastifyInstance } from 'fastify'
import type { PgBoss } from 'pg-boss'
import type {
  PgBossDefinedQueueRegistry,
  PgBossQueueConfig,
  PgBossQueueDefinition,
  PgBossQueueRegistry,
  PgBossScheduleDefinition,
  PgBossWorkerDefinition,
  PgBossWorkerDefinitionFactory,
  PgBossWorkerRegistration,
  TypedPgBoss,
} from './types.js'

export function definePgBossQueue(definition: PgBossQueueDefinition): PgBossQueueDefinition {
  return definition
}

export function queue<Data extends object = object>(
  definition: Omit<PgBossQueueConfig<Data>, '__data'> = {},
): PgBossQueueConfig<Data> {
  return definition
}

function shouldCreateQueue(definition: PgBossQueueConfig) {
  return definition.create === true
}

function getQueueDefinition(
  name: string,
  definition: PgBossQueueConfig,
): PgBossQueueDefinition | null {
  if (!shouldCreateQueue(definition)) {
    return null
  }

  return {
    ...(definition.options ?? {}),
    name,
  }
}

function applyQueueDefinition<Definition extends object>(
  name: string,
  workerDefinition: Definition,
): Omit<Definition, 'createQueue' | 'queue' | 'queueOptions'> & {
  queue: string
} {
  const {
    createQueue: _createQueue,
    queue: _queue,
    queueOptions: _queueOptions,
    ...definition
  } = workerDefinition as Definition & {
    createQueue?: unknown
    queue?: unknown
    queueOptions?: unknown
  }

  return {
    ...definition,
    queue: name,
  }
}

export function definePgBossQueues<const Registry extends PgBossQueueRegistry>(
  registry: Registry,
): PgBossDefinedQueueRegistry<Registry> {
  const definitions = Object.entries(registry)
    .map(([name, definition]) => getQueueDefinition(name, definition))
    .filter((definition): definition is PgBossQueueDefinition => definition !== null)

  return {
    queues: registry,
    definitions,
    worker(name: string, definition: PgBossWorkerRegistration<any, any>) {
      if (typeof definition === 'function') {
        return (fastify: FastifyInstance) => applyQueueDefinition(name, definition(fastify))
      }

      return applyQueueDefinition(name, definition)
    },
  } as unknown as PgBossDefinedQueueRegistry<Registry>
}

export function definePgBossSchedule<Data extends object = object>(
  definition: PgBossScheduleDefinition<Data>,
): PgBossScheduleDefinition<Data> {
  return definition
}

export function definePgBossWorker<ReqData extends object = object, ResData = any>(): {
  <const Definition extends PgBossWorkerDefinition<ReqData, ResData>>(
    definition: Definition,
  ): Definition
  <const Definition extends PgBossWorkerDefinition<ReqData, ResData>>(
    definition: (fastify: FastifyInstance) => Definition,
  ): (fastify: FastifyInstance) => Definition
}

export function definePgBossWorker<ReqData extends object = object, ResData = any>(
  definition: PgBossWorkerDefinition<ReqData, ResData>,
): PgBossWorkerDefinition<ReqData, ResData>

export function definePgBossWorker<ReqData extends object = object, ResData = any>(
  definition: PgBossWorkerDefinitionFactory<ReqData, ResData>,
): PgBossWorkerDefinitionFactory<ReqData, ResData>

export function definePgBossWorker<ReqData extends object = object, ResData = any>(
  definition?: PgBossWorkerRegistration<ReqData, ResData>,
):
  | PgBossWorkerRegistration<ReqData, ResData>
  | (<const Definition extends PgBossWorkerRegistration<ReqData, ResData>>(
      definition: Definition,
    ) => Definition) {
  if (definition === undefined) {
    return <const Definition extends PgBossWorkerRegistration<ReqData, ResData>>(
      typedDefinition: Definition,
    ) => typedDefinition
  }

  return definition
}

export function getPgBoss(fastify: FastifyInstance): PgBoss

export function getPgBoss<Queues extends object>(fastify: FastifyInstance): TypedPgBoss<Queues>

export function getPgBoss(fastify: FastifyInstance): PgBoss {
  if (!fastify.pgBoss) {
    throw new Error('pg-boss is not available. Check that fastify-pg-boss is enabled and started.')
  }

  return fastify.pgBoss
}
