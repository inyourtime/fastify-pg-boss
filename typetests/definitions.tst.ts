import { expect, test } from 'tstyche'
import {
  definePgBossQueue,
  definePgBossSchedule,
  definePgBossWorker,
  type PgBossQueueDefinition,
  type PgBossScheduleDefinition,
  type PgBossWorkerDefinition,
} from '../src/index.js'

type ReportJobData = {
  date: string
  urlTemplate?: string
}

test('definePgBossQueue accepts queue names and pg-boss queue options', () => {
  const queueName = definePgBossQueue('reports/daily')
  const queueOptions = {
    name: 'reports/daily',
    retryLimit: 3,
    retryBackoff: true,
    policy: 'standard',
  } satisfies PgBossQueueDefinition
  const queueDefinition = definePgBossQueue(queueOptions)

  expect(queueName).type.toBeAssignableTo<PgBossQueueDefinition>()
  expect(queueDefinition).type.toBeAssignableTo<PgBossQueueDefinition>()
  expect(queueOptions.retryLimit).type.toBe<number>()

  definePgBossQueue({
    name: 'reports/daily',
    // @ts-expect-error  Object literal may only specify known properties
    unknownQueueOption: true,
  })
})

test('definePgBossSchedule preserves schedule data types', () => {
  const schedule = definePgBossSchedule<ReportJobData>({
    name: 'reports/daily',
    cron: '0 8 * * *',
    data: {
      date: '2026-04-24',
      urlTemplate: '/reports/:date',
    },
    options: {
      tz: 'UTC',
    },
  })

  expect(schedule).type.toBeAssignableTo<PgBossScheduleDefinition<ReportJobData>>()
  expect(schedule.data).type.toBe<ReportJobData | null | undefined>()

  definePgBossSchedule<ReportJobData>({
    name: 'reports/daily',
    cron: '0 8 * * *',
    data: {
      // @ts-expect-error  Type 'number' is not assignable to type 'string'.
      date: 20260424,
    },
  })
})

test('definePgBossWorker preserves worker schedule data types', () => {
  const worker = definePgBossWorker<ReportJobData>({
    name: 'reports/daily',
    schedule: {
      cron: '0 8 * * *',
      data: {
        date: '2026-04-24',
      },
      tz: 'Asia/Bangkok',
    },
    async handler() {},
  })

  expect(worker).type.toBeAssignableTo<PgBossWorkerDefinition<ReportJobData>>()

  // @ts-expect-error  No overload matches this call.
  definePgBossWorker<ReportJobData>({
    name: 'reports/daily',
    schedule: {
      cron: '0 8 * * *',
      data: {
        urlTemplate: '/reports/:date',
      },
    },
    async handler() {},
  })
})
