import type { FastifyInstance } from 'fastify'
import type { PgBoss } from 'pg-boss'
import type {
  PgBossQueueDefinition,
  PgBossScheduleDefinition,
  PgBossWorkerDefinition,
  PgBossWorkerDefinitionFactory,
  PgBossWorkerRegistration,
  TypedPgBoss,
} from './types.js'

export function definePgBossQueue(definition: PgBossQueueDefinition): PgBossQueueDefinition {
  return definition
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
