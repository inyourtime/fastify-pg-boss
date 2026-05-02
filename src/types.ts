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

export type PgBossQueueConfig<Data extends object = object> = {
  /**
   * Create this queue during plugin registration or worker registration.
   * When false, the queue must already exist at runtime.
   */
  create?: boolean
  /**
   * Queue options used when create is true.
   */
  options?: Omit<Queue, 'name'>
  /**
   * Phantom field used only to carry the queue payload type.
   */
  readonly __data?: Data
}

export type PgBossQueueRegistry = Record<string, PgBossQueueConfig<any>>

type PgBossRegistryQueueData<Definition> =
  Definition extends PgBossQueueConfig<infer Data extends object> ? Data : never

type DistributiveOmit<Type, Key extends keyof any> = Type extends unknown ? Omit<Type, Key> : never

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

type PgBossWorkerBaseDefinition<ReqData extends object = object, ResData = any> = {
  enabled?: boolean
  /**
   * Human-readable worker name.
   */
  name: string
  offWorkOnClose?: boolean
  offWorkOptions?: OffWorkOptions
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

export type PgBossQueueRegistryWorkerOptions<
  Registry extends PgBossQueueRegistry,
  QueueName extends keyof Registry & string,
  ResData = any,
> = PgBossWorkerBaseDefinition<PgBossRegistryQueueData<Registry[QueueName]>, ResData> & {
  createQueue?: never
  queue?: never
  queueOptions?: never
}

export type PgBossQueueRegistryWorker<
  Registry extends PgBossQueueRegistry,
  QueueName extends keyof Registry & string,
  ResData = any,
> = DistributiveOmit<
  PgBossWorkerDefinition<PgBossRegistryQueueData<Registry[QueueName]>, ResData>,
  'queue'
> & {
  queue: QueueName
}

export type PgBossQueueRegistryWorkerFactory<
  Registry extends PgBossQueueRegistry,
  QueueName extends keyof Registry & string,
  ResData = any,
> = (fastify: FastifyInstance) => PgBossQueueRegistryWorker<Registry, QueueName, ResData>

export type PgBossDefinedQueueRegistry<Registry extends PgBossQueueRegistry> = {
  readonly queues: Registry
  readonly definitions: readonly PgBossQueueDefinition[]
  worker: {
    <const QueueName extends keyof Registry & string, ResData = any>(
      name: QueueName,
      definition: PgBossQueueRegistryWorkerOptions<Registry, QueueName, ResData>,
    ): PgBossQueueRegistryWorker<Registry, QueueName, ResData>
    <const QueueName extends keyof Registry & string, ResData = any>(
      name: QueueName,
      definition: (
        fastify: FastifyInstance,
      ) => PgBossQueueRegistryWorkerOptions<Registry, QueueName, ResData>,
    ): PgBossQueueRegistryWorkerFactory<Registry, QueueName, ResData>
  }
}

export type PgBossQueuesFromRegistry<Registry> =
  Registry extends PgBossDefinedQueueRegistry<infer Definitions>
    ? {
        [QueueName in keyof Definitions & string]: PgBossRegistryQueueData<Definitions[QueueName]>
      }
    : Registry extends PgBossQueueRegistry
      ? {
          [QueueName in keyof Registry & string]: PgBossRegistryQueueData<Registry[QueueName]>
        }
      : never

export type PgBossScheduleDefinition<Data extends object = object> = {
  data?: Data | null
  enabled?: boolean
  key?: string
  name: string
  options?: ScheduleOptions
  cron: string
}

export type PgBossQueueMap = Record<string, object>

// biome-ignore lint/suspicious/noEmptyInterface: Users can augment this interface to type fastify.pgBoss globally.
export interface PgBossQueues {}

export type PgBossWorkerDefinition<
  ReqData extends object = object,
  ResData = any,
> = PgBossWorkerBaseDefinition<ReqData, ResData> & {
  createQueue?: boolean
  /**
   * pg-boss queue name. Defaults to name for simple worker definitions.
   */
  queue?: string
  /**
   * Queue options used when createQueue is true or queueOptions is provided.
   */
  queueOptions?: Omit<Queue, 'name'>
}

export type PgBossWorkerDefinitionFactory<ReqData extends object = object, ResData = any> = (
  fastify: FastifyInstance,
) => PgBossWorkerDefinition<ReqData, ResData>

export type PgBossWorkerRegistration<ReqData extends object = object, ResData = any> =
  | PgBossWorkerDefinition<ReqData, ResData>
  | PgBossWorkerDefinitionFactory<ReqData, ResData>

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
  queues?: readonly PgBossQueueDefinition[]
  /**
   * Typed queue registry used to create queues and derive worker/send payload types.
   */
  queueRegistry?: PgBossDefinedQueueRegistry<any>
  /**
   * Register schedules before workers.
   */
  schedules?: readonly PgBossScheduleDefinition[]
  /**
   * Register workers after queues and schedules.
   */
  workers?: readonly PgBossWorkerRegistration<any, any>[]
  /**
   * Attach pg-boss event handlers. The default error handler logs errors.
   */
  events?: PgBossEventHandlers
  /**
   * Set false to skip the default pg-boss error logger.
   */
  logErrors?: boolean
}
