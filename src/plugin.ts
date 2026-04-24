import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import type { FastifyPgBossOptions } from './types.js'
import {
  attachPgBossEventHandlers,
  closeWorkers,
  createBoss,
  registerQueue,
  registerSchedule,
  registerWorker,
} from './lifecycle.js'

const plugin: FastifyPluginAsync<FastifyPgBossOptions> = async (fastify, options) => {
  const enabled = options.enabled ?? true
  const start = options.start ?? true
  const stopOnClose = options.stopOnClose ?? true

  if (!fastify.hasDecorator('pgBoss')) {
    fastify.decorate('pgBoss', null)
  }

  if (!enabled) {
    fastify.log.info('pg-boss disabled')
    return
  }

  const boss = await createBoss(fastify, options)
  attachPgBossEventHandlers(fastify, boss, options)

  if (start) {
    await boss.start()
  }

  for (const queue of options.queues ?? []) {
    await registerQueue(boss, queue)
  }

  for (const schedule of options.schedules ?? []) {
    await registerSchedule(boss, schedule)
  }

  for (const worker of options.workers ?? []) {
    await registerWorker(boss, worker)
  }

  fastify.pgBoss = boss

  if (stopOnClose) {
    fastify.addHook('onClose', async () => {
      if (!fastify.pgBoss) {
        return
      }

      await closeWorkers(fastify.pgBoss, options.workers)
      await fastify.pgBoss.stop(options.stopOptions)
      fastify.pgBoss = null
    })
  }
}

export const fastifyPgBoss = fp(plugin, {
  fastify: '5.x',
  name: 'fastify-pg-boss',
})

export default fastifyPgBoss
