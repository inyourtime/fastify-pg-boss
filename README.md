# fastify-pg-boss

Fastify plugin for [pg-boss](https://github.com/timgit/pg-boss). It owns the
Fastify lifecycle around pg-boss and decorates the instance with the real
`PgBoss` object, so every pg-boss API remains available through
`fastify.pgBoss`.

This package exports only the Fastify plugin helpers. Import pg-boss runtime
helpers and types directly from `pg-boss`.

## Install

```sh
npm install fastify-pg-boss fastify pg-boss
```

## Test

Start the test PostgreSQL database before running the Node test suite:

```sh
npm run db:up
```

Run tests with Node's built-in test runner:

```sh
npm test
```

The test files check database connectivity before running. If PostgreSQL is not
reachable, they fail with a message asking you to run `npm run db:up`. Use
`POSTGRES_URL` to point the tests at a different database.

Generate coverage with c8:

```sh
npm run coverage
```

The HTML report is written to `coverage/index.html`.

Stop and remove the test database when finished:

```sh
npm run db:down
```

## Usage

```ts
import Fastify from 'fastify'
import fastifyPgBoss, { definePgBossWorker } from 'fastify-pg-boss'

const app = Fastify()

await app.register(fastifyPgBoss, {
  connectionString: process.env.POSTGRES_URL,
  workers: [
    definePgBossWorker({
      name: 'on-this-day',
      queue: 'notifications/on-this-day/daily',
      createQueue: true,
      schedule: {
        cron: '0 8 * * *',
        data: {},
        tz: 'Asia/Bangkok',
      },
      options: {
        pollingIntervalSeconds: 10,
      },
      async handler(jobs) {
        for (const job of jobs) {
          app.log.info({ jobId: job.id }, 'processing job')
        }
      },
    }),
  ],
})

await app.pgBoss?.send('notifications/on-this-day/daily', {
  date: new Date().toISOString(),
})
```

## Full pg-boss API support

The plugin does not wrap or hide pg-boss. `fastify.pgBoss` is the original
`PgBoss` instance, so methods such as `send`, `sendAfter`, `sendThrottled`,
`sendDebounced`, `insert`, `fetch`, `work`, `offWork`, `publish`, `subscribe`,
`cancel`, `resume`, `retry`, `complete`, `fail`, `touch`, `findJobs`,
`createQueue`, `updateQueue`, `deleteQueue`, `getQueues`, `schedule`,
`unschedule`, `getSchedules`, `getBamStatus`, `getDb`, and the rest of pg-boss'
surface are available directly.

Use `getPgBoss(app)` when you prefer a non-nullable instance:

```ts
import { getPgBoss } from 'fastify-pg-boss'

await getPgBoss(app).send('queue-name', { ok: true })
```

## Options

- `enabled`: set `false` to decorate `pgBoss` as `null` and skip startup.
- `boss`: existing `PgBoss` instance, constructor input, or factory.
- `connectionString`: PostgreSQL connection string.
- `constructorOptions`: pg-boss constructor options.
- `start`: start pg-boss during registration. Defaults to `true`.
- `stopOnClose`: call `offWork` and `stop` from Fastify `onClose`. Defaults to
  `true`.
- `stopOptions`: passed to `PgBoss.stop`.
- `queues`: queue names or full pg-boss queue definitions to create.
- `schedules`: schedules to register before workers.
- `workers`: workers to register after queues and schedules. A worker can also
  create its own queue and schedule itself via `createQueue`, `queueOptions`,
  and `schedule`.
- `events`: typed pg-boss event handlers.
- `logErrors`: set `false` to disable the default `error` event logger.

## Worker Definitions

The plugin mirrors the common application pattern of defining workers outside
the plugin and passing them into registration:

```ts
import type { WorkOptions } from 'pg-boss'
import { definePgBossWorker } from 'fastify-pg-boss'

type OnThisDayJob = {
  date?: string
}

const workOptions: WorkOptions = {
  pollingIntervalSeconds: 10,
}

export const onThisDayWorker = definePgBossWorker<OnThisDayJob>({
  name: 'on-this-day',
  queue: 'notifications/on-this-day/daily',
  createQueue: true,
  schedule: {
    cron: '0 8 * * *',
    data: {},
    tz: 'Asia/Bangkok',
  },
  options: workOptions,
  async handler(jobs) {
    for (const job of jobs) {
      // process job
    }
  },
})
```

If you need the Fastify instance inside the handler, accept it as the handler's
second argument:

```ts
definePgBossWorker<OnThisDayJob>({
  name: 'on-this-day',
  async handler(jobs, app) {
    for (const job of jobs) {
      app.log.info({ jobId: job.id }, 'processing job')
    }
  },
})
```

You can also define the worker as a Fastify-aware factory. This is useful when
you already have a handler factory that closes over the app instance:

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
      app.log.info({ jobId: job.id, queue: job.name }, 'processing job')
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

For the smallest scheduled worker, `schedule` can be only the cron expression:

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
