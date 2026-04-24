import type { FastifyInstance } from 'fastify'
import type { PgBoss } from 'pg-boss'
import type {
  PgBossQueueDefinition,
  PgBossScheduleDefinition,
  PgBossWorkerDefinition,
} from './types.js'

export function definePgBossQueue(definition: PgBossQueueDefinition): PgBossQueueDefinition {
  return definition
}

export function definePgBossSchedule<Data extends object = object>(
  definition: PgBossScheduleDefinition<Data>,
): PgBossScheduleDefinition<Data> {
  return definition
}

export function definePgBossWorker<ReqData extends object = object, ResData = any>(
  definition: PgBossWorkerDefinition<ReqData, ResData>,
): PgBossWorkerDefinition<ReqData, ResData> {
  return definition
}

export function getPgBoss(fastify: FastifyInstance): PgBoss {
  if (!fastify.pgBoss) {
    throw new Error('pg-boss is not available. Check that fastify-pg-boss is enabled and started.')
  }

  return fastify.pgBoss
}
