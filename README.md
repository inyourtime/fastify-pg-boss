# fastify-pg-boss

[![CI](https://github.com/inyourtime/fastify-pg-boss/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/inyourtime/fastify-pg-boss/actions/workflows/ci.yml)
[![NPM version](https://img.shields.io/npm/v/fastify-pg-boss.svg?style=flat)](https://www.npmjs.com/package/fastify-pg-boss)
[![Checked with Biome](https://img.shields.io/badge/Checked_with-Biome-60a5fa?style=flat&logo=biome)](https://biomejs.dev)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat)](./LICENSE)

Fastify plugin for [pg-boss](https://github.com/timgit/pg-boss). It registers
typed queues, schedules, and workers from plugin options, and decorates the
Fastify instance with the real `PgBoss` object.

The plugin keeps pg-boss itself visible. Use `fastify.pgBoss` or `getPgBoss(app)`
to call the full pg-boss API directly.

## Requirements

- Node.js `>=22.12.0`
- Fastify `^5.0.0`
- pg-boss `^12.15.0`
- PostgreSQL supported by pg-boss

## Install

```sh
npm install fastify-pg-boss pg-boss
```

## Quick Start

```ts
import Fastify from 'fastify'
import fastifyPgBoss, {
  definePgBossQueues,
  getPgBoss,
  queue,
  type PgBossQueuesFromRegistry,
} from 'fastify-pg-boss'

const app = Fastify({ logger: true })

type EmailJob = {
  userId: string
}

// Define every queue in one place. The generic type is the job payload for that
// queue, and create: true tells the plugin to create the pg-boss queue at startup.
const queues = definePgBossQueues({
  'email/send': queue<EmailJob>({ create: true }),
})

// Build workers from the registry so the queue name and job payload stay linked.
const workers = [
  queues.worker('email/send', {
    name: 'email-worker',
    // Optional: register a schedule for this worker's queue.
    // schedule: {
    //   cron: '0 9 * * *',
    //   data: {
    //     userId: 'daily-summary',
    //   },
    //   key: 'daily-summary-email',
    //   tz: 'UTC',
    // },
    options: {
      pollingIntervalSeconds: 10,
    },
    async handler(jobs) {
      for (const job of jobs) {
        app.log.info({ jobId: job.id, userId: job.data.userId }, 'sending email')
      }
    },
  }),
] as const

// Derive the typed queue map once and reuse it for typed sends.
type Queues = PgBossQueuesFromRegistry<typeof queues>

await app.register(fastifyPgBoss, {
  connectionString: process.env.POSTGRES_URL,
  // Registers queues with create: true before schedules and workers.
  queueRegistry: queues,
  workers,
})

// send() is narrowed to known queue names and their payload shapes.
await getPgBoss<Queues>(app).send('email/send', {
  userId: 'user_123',
})
```

When the plugin is enabled, `fastify.pgBoss` is a `PgBoss` instance. When the
plugin is disabled, it is decorated as `null`.

## What It Does

- Creates or accepts a `PgBoss` instance.
- Starts pg-boss during plugin registration by default.
- Registers queues, schedules, and workers in that order.
- Lets worker factories receive the Fastify instance.
- Logs pg-boss `error` events through `fastify.log` by default.
- Calls `offWork` for registered workers and stops pg-boss from Fastify
  `onClose` by default.
- Leaves the complete pg-boss API available through the original instance.

## Creating the Boss Instance

Provide one of `connectionString`, `constructorOptions`, or `boss`.

```ts
await app.register(fastifyPgBoss, {
  connectionString: process.env.POSTGRES_URL,
})
```

```ts
await app.register(fastifyPgBoss, {
  constructorOptions: {
    connectionString: process.env.POSTGRES_URL,
    schema: 'jobs',
  },
})
```

```ts
import { PgBoss } from 'pg-boss'

const boss = new PgBoss({
  connectionString: process.env.POSTGRES_URL,
})

await app.register(fastifyPgBoss, {
  boss,
})
```

`boss` may also be a connection string, pg-boss constructor options, an existing
`PgBoss` instance, or a factory that receives the Fastify instance.

```ts
await app.register(fastifyPgBoss, {
  boss: async (app) => {
    app.log.info('creating pg-boss')

    return new PgBoss({
      connectionString: process.env.POSTGRES_URL,
    })
  },
})
```

## Accessing pg-boss

This plugin does not wrap pg-boss methods. Anything available on pg-boss is
available on `fastify.pgBoss`.

```ts
await app.pgBoss?.send('queue-name', { ok: true })
await app.pgBoss?.schedule('queue-name', '0 8 * * *', { source: 'cron' })
```

Use `getPgBoss(app)` when you want a non-nullable instance or a clear error if
pg-boss is not available.

```ts
import { getPgBoss } from 'fastify-pg-boss'

const boss = getPgBoss(app)
await boss.send('queue-name', { ok: true })
```

Use `getPgBoss<Queues>(app)` when you want TypeScript to narrow `send()` to your
known queues. `PgBossQueuesFromRegistry` derives that map from a typed queue
registry, which keeps queue names and payloads in one place.

```ts
const queues = definePgBossQueues({
  'email/send': queue<EmailJob>({ create: true }),
})

const workers = [
  queues.worker('email/send', {
    name: 'email-worker',
    async handler(jobs) {},
  }),
] as const

type Queues = PgBossQueuesFromRegistry<typeof queues>

const boss = getPgBoss<Queues>(app)
await boss.send('email/send', { userId: 'user_123' })
```

You can type `fastify.pgBoss` globally by augmenting the package's `PgBossQueues`
interface. This changes the decorator type for every Fastify instance in the
TypeScript program. The queue map can be derived from your registry, so you do
not need to repeat the payload shapes.

```ts
const queues = definePgBossQueues({
  'email/send': queue<EmailJob>({ create: true }),
})

declare module 'fastify-pg-boss' {
  interface PgBossQueues extends PgBossQueuesFromRegistry<typeof queues> {}
}

await app.pgBoss?.send('email/send', { userId: 'user_123' })
```

## Queues

Use `queues` when you want the plugin to create queues before schedules and
workers are registered.

```ts
await app.register(fastifyPgBoss, {
  connectionString: process.env.POSTGRES_URL,
  queues: [
    'email/send',
    {
      name: 'reports/daily',
      retryLimit: 3,
      retryDelay: 30,
    },
  ],
})
```

`definePgBossQueue` is a typed identity helper for exporting queue definitions
from another file.

```ts
import { definePgBossQueue } from 'fastify-pg-boss'

export const emailQueue = definePgBossQueue({
  name: 'email/send',
  retryLimit: 3,
})
```

## Typed Queue Registries

Use `definePgBossQueues` when you want a single source of truth for queue names,
payload types, queue creation, typed `send()`, and typed workers.

```ts
import {
  definePgBossQueues,
  queue,
  type PgBossQueuesFromRegistry,
} from 'fastify-pg-boss'

type EmailJob = {
  userId: string
}

type CleanupJob = {
  olderThanDays: number
}

export const queues = definePgBossQueues({
  'email/send': queue<EmailJob>({
    create: true,
    options: {
      retryLimit: 5,
    },
  }),
  cleanup: queue<CleanupJob>({
    create: false,
  }),
})

export type Queues = PgBossQueuesFromRegistry<typeof queues>
```

`queue<Data>()` carries the job payload type for a queue. Its runtime options
control queue creation:

- `create: true` adds the queue to `queues.definitions`, so the plugin creates
  it during registration when passed as `queueRegistry`.
- `create: false` keeps the queue typed but does not create it. Use this when
  the queue is created by migrations, another service, or other infrastructure.
- `options` are passed to `boss.createQueue(name, options)` when `create` is
  true.

Pass the registry to the plugin with `queueRegistry`.

```ts
await app.register(fastifyPgBoss, {
  connectionString: process.env.POSTGRES_URL,
  queueRegistry: queues,
})
```

The registry also creates workers bound to known queue names. The worker cannot
override `queue`, `createQueue`, or `queueOptions`; those come from the registry.

```ts
export const workers = [
  queues.worker('email/send', {
    name: 'email-worker',
    async handler(jobs) {
      for (const job of jobs) {
        job.data.userId
      }
    },
  }),

  queues.worker('cleanup', {
    name: 'cleanup-worker',
    async handler(jobs) {
      for (const job of jobs) {
        job.data.olderThanDays
      }
    },
  }),
] as const

await app.register(fastifyPgBoss, {
  connectionString: process.env.POSTGRES_URL,
  queueRegistry: queues,
  workers,
})
```

Unknown queue names fail at compile time.

```ts
queues.worker('email/missing', {
  name: 'missing-worker',
  async handler() {},
})
```

Worker factories work the same way and receive the Fastify instance during
plugin registration.

```ts
export const emailWorker = queues.worker('email/send', (app) => ({
  name: 'email-worker',
  async handler(jobs) {
    app.log.info({ count: jobs.length }, 'processing email jobs')
  },
}))
```

Use the derived queue map to type `getPgBoss` or the global `PgBossQueues`
augmentation.

```ts
const boss = getPgBoss<Queues>(app)

await boss.send('email/send', { userId: 'user_123' })
await boss.send('cleanup', { olderThanDays: 30 })
```

## Schedules

Use `schedules` for standalone pg-boss schedules.

```ts
await app.register(fastifyPgBoss, {
  connectionString: process.env.POSTGRES_URL,
  schedules: [
    {
      name: 'reports/daily',
      cron: '0 8 * * *',
      data: {
        source: 'schedule',
      },
      key: 'daily-report',
      options: {
        tz: 'UTC',
        retryLimit: 1,
      },
    },
  ],
})
```

Set `enabled: false` to keep a schedule definition in code without registering
it.

```ts
{
  name: 'reports/daily',
  cron: '0 8 * * *',
  enabled: false,
}
```

`definePgBossSchedule` is a typed identity helper for exported schedule
definitions.

## Workers

Workers are registered after queues and schedules. A worker uses `name` as its
queue name unless `queue` is provided. Prefer `queues.worker(name, definition)`
when the worker belongs to a typed queue registry; it binds the queue name and
payload type for you.

```ts
import { definePgBossWorker } from 'fastify-pg-boss'

type ReportJob = {
  date?: string
}

export const dailyReportWorker = definePgBossWorker<ReportJob>({
  name: 'daily-report-worker',
  queue: 'reports/daily',
  createQueue: true,
  queueOptions: {
    retryBackoff: true,
    retryLimit: 3,
  },
  options: {
    pollingIntervalSeconds: 10,
  },
  async handler(jobs) {
    for (const job of jobs) {
      // generate report
    }
  },
})
```

Set `enabled: false` to skip worker registration.

### Fastify in Worker Factories

Worker handlers receive only the jobs fetched by pg-boss. If a worker needs
Fastify services, pass a worker factory to `definePgBossWorker`. The factory
runs during plugin registration and receives the Fastify instance.

```ts
import type { FastifyInstance } from 'fastify'
import type { Job, WorkHandler } from 'pg-boss'
import { definePgBossWorker } from 'fastify-pg-boss'

type OnThisDayJob = {
  date?: string
  urlTemplate?: string
}

export function createOnThisDayWorker(app: FastifyInstance): WorkHandler<OnThisDayJob> {
  return async (jobs: Job<OnThisDayJob>[]) => {
    for (const job of jobs) {
      app.log.info({ jobId: job.id, queue: job.name }, 'processing notifications')
    }
  }
}

export const onThisDayWorker = definePgBossWorker<OnThisDayJob>((app) => ({
  name: 'on-this-day',
  queue: 'notifications/on-this-day/daily',
  createQueue: true,
  handler: createOnThisDayWorker(app),
}))
```

### Worker Schedules

A worker can register its own schedule. The schedule defaults to the worker's
queue.

```ts
definePgBossWorker<ReportJob>({
  name: 'daily-report-worker',
  queue: 'reports/daily',
  createQueue: true,
  schedule: {
    cron: '0 8 * * *',
    data: {},
    key: 'daily-report',
    tz: 'Asia/Bangkok',
  },
  async handler(jobs) {
    for (const job of jobs) {
      // generate scheduled report
    }
  },
})
```

For the smallest scheduled worker, `schedule` can be only the cron expression.

```ts
definePgBossWorker({
  name: 'daily-summary',
  createQueue: true,
  schedule: '0 8 * * *',
  async handler(jobs) {
    // process jobs
  },
})
```

Use `schedule.name` when the scheduled queue should differ from the worker queue.
Use `schedule.enabled: false` to skip registering the schedule.

### Metadata Workers

Set `includeMetadata: true` when you want pg-boss metadata on fetched jobs.

```ts
definePgBossWorker<ReportJob>({
  name: 'metadata-worker',
  queue: 'reports/metadata',
  createQueue: true,
  includeMetadata: true,
  options: {
    batchSize: 1,
    includeMetadata: true,
    pollingIntervalSeconds: 10,
  },
  async handler(jobs) {
    for (const job of jobs) {
      // process job.state, job.priority, and other metadata
    }
  },
})
```

### Shutdown Behavior

On Fastify close, the plugin calls `offWork` for each registered worker and then
stops pg-boss. Use worker-level options to tune that behavior.

```ts
definePgBossWorker({
  name: 'long-running-worker',
  offWorkOptions: {
    wait: true,
  },
  async handler(jobs) {
    // process jobs
  },
})
```

Set `offWorkOnClose: false` for workers that should not be passed to
`boss.offWork` during plugin shutdown.

## Events

The plugin logs pg-boss `error` events through `fastify.log.error` by default.
Provide `events` to attach custom handlers. Each handler receives the Fastify
instance first.

```ts
await app.register(fastifyPgBoss, {
  connectionString: process.env.POSTGRES_URL,
  events: {
    error(app, error) {
      app.log.error({ err: error }, 'custom pg-boss error')
    },
    warning(app, warning) {
      app.log.warn({ warning }, 'pg-boss warning')
    },
    stopped(app) {
      app.log.info('pg-boss stopped')
    },
  },
})
```

Supported event keys are `error`, `warning`, `wip`, `stopped`, and `bam`.
If a custom event handler throws, the plugin catches the failure and logs it as
`pg-boss event handler failed`.

Set `logErrors: false` to disable the default error logger.

## Options Reference

| Option | Description |
| --- | --- |
| `enabled` | Set `false` to decorate `pgBoss` as `null` and skip pg-boss creation and startup. Defaults to `true`. |
| `boss` | Existing `PgBoss` instance, connection string, constructor options, or `(fastify) => PgBoss | Promise<PgBoss>`. |
| `connectionString` | PostgreSQL connection string. Used when `boss` and `constructorOptions` are omitted. |
| `constructorOptions` | pg-boss constructor options. |
| `start` | Start pg-boss during plugin registration. Defaults to `true`. |
| `stopOnClose` | Run worker `offWork` and `PgBoss.stop()` in Fastify `onClose`. Defaults to `true`. |
| `stopOptions` | Options passed to `PgBoss.stop()`. |
| `queues` | Queue names or pg-boss queue definitions to create before schedules and workers. |
| `queueRegistry` | Typed queue registry from `definePgBossQueues`. Queues with `create: true` are created before schedules and workers. |
| `schedules` | Schedule definitions to register before workers. |
| `workers` | Worker definitions or worker factories to register after queues and schedules. |
| `events` | Custom pg-boss event handlers. |
| `logErrors` | Set `false` to disable the default pg-boss `error` logger. |

## Exports

```ts
export {
  fastifyPgBoss,
  definePgBossQueue,
  definePgBossQueues,
  definePgBossSchedule,
  definePgBossWorker,
  getPgBoss,
  queue,
}
```

The package also exports TypeScript types for plugin options, worker
definitions, schedules, queues, queue registries, events, and worker handlers.
Use `PgBossQueuesFromRegistry` to derive a typed queue map from
`definePgBossQueues`. Import runtime pg-boss classes, helpers, and job types
directly from `pg-boss`.

## Development

Install dependencies:

```sh
npm install
```

Start the test PostgreSQL database:

```sh
npm run db:up
```

Run typecheck, build, tests, and coverage thresholds:

```sh
npm test
```

Run only the TSTyche type tests:

```sh
npm run type-test
```

The test suite expects PostgreSQL at:

```txt
postgres://fastify_pg_boss:fastify_pg_boss@localhost:55432/fastify_pg_boss
```

Use `POSTGRES_URL` to point tests at a different database.

Stop and remove the test database:

```sh
npm run db:down
```

Other useful scripts:

```sh
npm run typecheck
npm run type-test
npm run build
```
