import type { FastifyInstance } from 'fastify'
import type {
  BamEvent,
  ConstructorOptions,
  OffWorkOptions,
  PgBoss,
  Queue,
  ScheduleOptions,
  StopOptions,
  WipData,
  WorkHandler,
  WorkOptions,
  WorkWithMetadataHandler,
} from 'pg-boss'

declare module 'fastify' {
  interface FastifyInstance {
    pgBoss: PgBoss | null
  }
}

export type PgBossFactory = (fastify: FastifyInstance) => PgBoss | Promise<PgBoss>
export type PgBossConstructorInput = string | ConstructorOptions

export type PgBossWarning = {
  data: object
  message: string
}

export type PgBossEventMap = {
  bam: [data: BamEvent]
  error: [error: Error]
  stopped: []
  warning: [warning: PgBossWarning]
  wip: [data: WipData[]]
}

export type PgBossEventHandler<EventName extends keyof PgBossEventMap> = (
  fastify: FastifyInstance,
  ...args: PgBossEventMap[EventName]
) => void | Promise<void>

export type PgBossEventHandlers = {
  [EventName in keyof PgBossEventMap]?: PgBossEventHandler<EventName>
}

export type PgBossQueueDefinition = string | Queue

export type PgBossScheduleDefinition<Data extends object = object> = {
  data?: Data | null
  enabled?: boolean
  key?: string
  name: string
  options?: ScheduleOptions
  cron: string
}

export type PgBossWorkerScheduleDefinition<Data extends object = object> =
  | string
  | {
      cron: string
      data?: Data | null
      enabled?: boolean
      key?: string
      /**
       * Override the scheduled queue name. Defaults to the worker queue.
       */
      name?: string
      options?: ScheduleOptions
      /**
       * Shortcut for options.tz.
       */
      tz?: string
    }

export type PgBossWorkHandler<ReqData, ResData = any> = WorkHandler<ReqData, ResData>

export type PgBossWorkWithMetadataHandler<ReqData, ResData = any> = WorkWithMetadataHandler<
  ReqData,
  ResData
>

export type PgBossWorkerDefinition<ReqData extends object = object, ResData = any> = {
  createQueue?: boolean
  enabled?: boolean
  /**
   * Human-readable worker name. Used as the queue name when queue is omitted.
   */
  name: string
  offWorkOnClose?: boolean
  offWorkOptions?: OffWorkOptions
  /**
   * pg-boss queue name. Defaults to name for simple worker definitions.
   */
  queue?: string
  /**
   * Queue options used when createQueue is true or queueOptions is provided.
   */
  queueOptions?: Omit<Queue, 'name'>
  /**
   * Schedule this worker's queue without declaring a separate schedules entry.
   */
  schedule?: PgBossWorkerScheduleDefinition<ReqData>
} & (
  | {
      includeMetadata?: false
      handler: PgBossWorkHandler<ReqData, ResData>
      options?: WorkOptions
    }
  | {
      includeMetadata: true
      handler: PgBossWorkWithMetadataHandler<ReqData, ResData>
      options?: WorkOptions & { includeMetadata: true }
    }
)

export type PgBossWorkerDefinitionFactory<ReqData extends object = object, ResData = any> = (
  fastify: FastifyInstance,
) => PgBossWorkerDefinition<ReqData, ResData>

export type PgBossWorkerRegistration<ReqData extends object = object, ResData = any> =
  | PgBossWorkerDefinition<ReqData, ResData>
  | PgBossWorkerDefinitionFactory<ReqData, ResData>

export type FastifyPgBossOptions = {
  /**
   * Keep the decorator available but skip constructing and starting pg-boss.
   * Useful in tests, local scripts, or apps where job processing is optional.
   */
  enabled?: boolean
  /**
   * Existing PgBoss instance, constructor input, or factory. When omitted,
   * connectionString or constructorOptions must be provided.
   */
  boss?: PgBoss | PgBossConstructorInput | PgBossFactory
  connectionString?: string
  constructorOptions?: ConstructorOptions
  /**
   * Start pg-boss during Fastify registration.
   */
  start?: boolean
  /**
   * Stop pg-boss from Fastify's onClose hook.
   */
  stopOnClose?: boolean
  stopOptions?: StopOptions
  /**
   * Register queues before schedules and workers.
   */
  queues?: PgBossQueueDefinition[]
  /**
   * Register schedules before workers.
   */
  schedules?: PgBossScheduleDefinition[]
  /**
   * Register workers after queues and schedules.
   */
  workers?: PgBossWorkerRegistration<any, any>[]
  /**
   * Attach pg-boss event handlers. The default error handler logs errors.
   */
  events?: PgBossEventHandlers
  /**
   * Set false to skip the default pg-boss error logger.
   */
  logErrors?: boolean
}
