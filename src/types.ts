import type { FastifyInstance } from 'fastify'
import type {
  BamEvent,
  ConstructorOptions,
  OffWorkOptions,
  PgBoss,
  Queue,
  ScheduleOptions,
  SendOptions,
  StopOptions,
  WipData,
  WorkHandler,
  WorkOptions,
  WorkWithMetadataHandler,
} from 'pg-boss'

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

export type PgBossQueueMap = Record<string, object>

// biome-ignore lint/suspicious/noEmptyInterface: Users can augment this interface to type fastify.pgBoss globally.
export interface PgBossQueues {}

export type PgBossWorkerDefinition<
  ReqData extends object = object,
  ResData = any,
  QueueName extends string = string,
  WorkerName extends string = string,
> = {
  createQueue?: boolean
  enabled?: boolean
  /**
   * Human-readable worker name. Used as the queue name when queue is omitted.
   */
  name: WorkerName
  offWorkOnClose?: boolean
  offWorkOptions?: OffWorkOptions
  /**
   * pg-boss queue name. Defaults to name for simple worker definitions.
   */
  queue?: QueueName
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

export type PgBossWorkerDefinitionFactory<
  ReqData extends object = object,
  ResData = any,
  QueueName extends string = string,
  WorkerName extends string = string,
> = (fastify: FastifyInstance) => PgBossWorkerDefinition<ReqData, ResData, QueueName, WorkerName>

export type PgBossWorkerRegistration<
  ReqData extends object = object,
  ResData = any,
  QueueName extends string = string,
  WorkerName extends string = string,
> =
  | PgBossWorkerDefinition<ReqData, ResData, QueueName, WorkerName>
  | PgBossWorkerDefinitionFactory<ReqData, ResData, QueueName, WorkerName>

type Simplify<T> = {
  [Key in keyof T]: T[Key]
} & {}

type UnionToIntersection<Union> = (Union extends unknown ? (value: Union) => void : never) extends (
  value: infer Intersection,
) => void
  ? Intersection
  : never

type PgBossWorkerRequestData<Worker> =
  Worker extends PgBossWorkerDefinition<infer ReqData, any, any, any>
    ? ReqData
    : Worker extends PgBossWorkerDefinitionFactory<infer ReqData, any, any, any>
      ? ReqData
      : Worker extends (fastify: FastifyInstance) => infer Definition
        ? PgBossWorkerRequestData<Definition>
        : never

type PgBossWorkerQueueName<Worker> = Worker extends (fastify: FastifyInstance) => infer Definition
  ? PgBossWorkerQueueName<Definition>
  : Worker extends { queue: infer QueueName }
    ? QueueName extends string
      ? QueueName
      : never
    : Worker extends { name: infer WorkerName }
      ? WorkerName extends string
        ? WorkerName
        : never
      : never

type PgBossQueueFromWorker<Worker> = Worker extends unknown
  ? PgBossWorkerQueueName<Worker> extends infer QueueName extends string
    ? {
        [Name in QueueName]: PgBossWorkerRequestData<Worker>
      }
    : never
  : never

export type PgBossQueuesFromWorkers<Workers extends readonly unknown[]> = Simplify<
  UnionToIntersection<PgBossQueueFromWorker<Workers[number]>>
>

type PgBossQueueData<
  Queues extends object,
  QueueName extends keyof Queues & string,
> = Queues[QueueName] extends object ? Queues[QueueName] : never

export type PgBossTypedSendRequest<
  Queues extends object,
  QueueName extends keyof Queues & string = keyof Queues & string,
> = QueueName extends keyof Queues & string
  ? {
      name: QueueName
      data: PgBossQueueData<Queues, QueueName>
      options?: SendOptions
    }
  : never

export type PgBossTypedSend<Queues extends object> = {
  <QueueName extends keyof Queues & string>(
    request: PgBossTypedSendRequest<Queues, QueueName>,
  ): Promise<string | null>
  <QueueName extends keyof Queues & string>(
    name: QueueName,
    data: PgBossQueueData<Queues, QueueName>,
    options?: SendOptions,
  ): Promise<string | null>
}

export type TypedPgBoss<Queues extends object> = Omit<PgBoss, 'send'> & {
  send: PgBossTypedSend<Queues>
}

export type PgBossWithQueues<Queues extends object> = keyof Queues extends never
  ? PgBoss
  : TypedPgBoss<Queues>

declare module 'fastify' {
  interface FastifyInstance {
    pgBoss: PgBossWithQueues<PgBossQueues> | null
  }
}

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
