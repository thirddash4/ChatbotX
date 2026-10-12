import { randomUUID } from "node:crypto"
import { Queue, QueueEvents, Worker } from "bullmq"
import { expect, test, vi } from "vitest"
import { WorkerLifecycle } from "../src/lib/lifecycle"

const state = vi.hoisted(() => ({ queue: undefined as Queue | undefined }))
vi.mock("@chatbotx.io/worker-config", async () => {
  vi.stubEnv("NEXT_PHASE", "phase-production-build")
  const actual = await vi.importActual<
    typeof import("@chatbotx.io/worker-config")
  >("@chatbotx.io/worker-config")
  return { ...actual, scheduleQueue: state.queue }
})

test.skipIf(!process.env.WORKER_TEST_REDIS_PORT)(
  "real BullMQ processes queues, preserves schedules, and drains in-flight work",
  async () => {
    const connection = {
      host: "127.0.0.1",
      port: Number(process.env.WORKER_TEST_REDIS_PORT),
    }
    const prefix = `worker-test-${randomUUID()}`
    const integration = new Queue("integration", { connection, prefix })
    const chat = new Queue("chat", { connection, prefix })
    const chatEvents = new QueueEvents("chat", { connection, prefix })
    const schedule = new Queue("schedule", { connection, prefix })
    state.queue = schedule
    const events = new QueueEvents("integration", { connection, prefix })
    const lifecycle = new WorkerLifecycle()
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    try {
      await Promise.all([events.waitUntilReady(), chatEvents.waitUntilReady()])
      await lifecycle.start((register) => {
        const worker = new Worker(
          "chat",
          async (job) => ({ delivered: job.data.type }),
          { connection, prefix },
        )
        register(() => worker.close(), "chat")
      })
      await lifecycle.start((register) => {
        const worker = new Worker(
          "integration",
          async (job) => {
            entered.resolve()
            await release.promise
            const child = await chat.add("sendChatMessage", {
              type: job.data.type,
            })
            return await child.waitUntilFinished(chatEvents, 5000)
          },
          { connection, prefix },
        )
        register(() => worker.close())
      })
      const { registerSchedules } = await import(
        "../src/schedule/handlers/register-schedules"
      )
      await registerSchedules()
      await registerSchedules()
      const schedules = await schedule.getJobSchedulers()
      expect(schedules.map((item) => item.key).sort()).toEqual(
        [
          "cleanupTriggers",
          "cleanupWebhookExecutions",
          "enqueueBroadcast",
          "evaluateDateTimeWebhooks",
          "evaluateTriggers",
          "finalizeBroadcasts",
          "maintainMacPartitions",
          "purgeCoexistStaging",
          "purgeWhatsappSignupSessions",
          "purgeWorkspaces",
          "reconcileBroadcasts",
          "reconcileMetaCatalogSyncs",
          "reconcileTenants",
          "refreshZaloTokens",
          "scanCoexistRuns",
          "scanSmartDelay",
          "syncUserQuota",
          "unsubscribeExpiredTrials",
        ].sort(),
      )
      const job = await integration.add("incomingMessage", {
        type: "incomingMessage",
      })
      const completed = job.waitUntilFinished(events, 5000)
      await entered.promise
      let stopped = false
      const stopping = lifecycle.stop().then(() => {
        stopped = true
      })
      await new Promise((resolve) => setTimeout(resolve, 30))
      expect(stopped).toBe(false)
      release.resolve()
      await expect(completed).resolves.toEqual({ delivered: "incomingMessage" })
      await stopping
      expect(await integration.getActiveCount()).toBe(0)
    } finally {
      release.resolve()
      await lifecycle.stop()
      await Promise.all([events.close(), chatEvents.close()])
      await chat.obliterate({ force: true })
      await integration.obliterate({ force: true })
      await schedule.obliterate({ force: true })
      await Promise.all([integration.close(), schedule.close(), chat.close()])
    }
  },
  15_000,
)
