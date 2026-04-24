import type { FastifyInstance } from 'fastify'
import type { BamEvent, WipData } from 'pg-boss'
import { expect, test } from 'tstyche'
import type { FastifyPgBossOptions, PgBossWarning } from '../src/index.js'

test('event handlers receive typed Fastify and pg-boss event payloads', () => {
  const options = {
    events: {
      bam(app, data) {
        expect(app).type.toBe<FastifyInstance>()
        expect(data).type.toBe<BamEvent>()
      },
      error(app, error) {
        expect(app).type.toBe<FastifyInstance>()
        expect(error).type.toBe<Error>()
      },
      stopped(app) {
        expect(app).type.toBe<FastifyInstance>()
      },
      warning(app, warning) {
        expect(app).type.toBe<FastifyInstance>()
        expect(warning).type.toBe<PgBossWarning>()
        expect(warning.message).type.toBe<string>()
      },
      wip(app, data) {
        expect(app).type.toBe<FastifyInstance>()
        expect(data).type.toBe<WipData[]>()
      },
    },
  } satisfies FastifyPgBossOptions

  expect(options).type.toBeAssignableTo<FastifyPgBossOptions>()
})

test('event handlers reject incompatible payload annotations', () => {
  expect<FastifyPgBossOptions>().type.not.toBeAssignableFrom({
    events: {
      error(app: FastifyInstance, error: string) {
        expect(app).type.toBe<FastifyInstance>()
        expect(error).type.toBe<string>()
      },
    },
  })
})
