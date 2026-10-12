import {
  defaultWorkerOptions,
  getRedisConnection,
  queueNames,
  WebhookJobAction,
  type WebhookJobData,
} from "@chatbotx.io/worker-config"
import { type Job, Worker } from "bullmq"
import { env } from "../env"
import { isBlockedWorkspace } from "../lib/is-blocked-workspace"
import { logger } from "../lib/logger"
import { startManagedWorker } from "../lib/shutdown"
import { WebhookMatcherService } from "./services/webhook-matcher.service"

const webhookMatcher = new WebhookMatcherService()

startManagedWorker("webhook", (registerClose) => {
  const worker = new Worker(
    queueNames.enum.webhook,
    async (job: Job<WebhookJobData>) => {
      if (await isBlockedWorkspace(job.data.data.workspaceId)) {
        return
      }

      switch (job.data.type) {
        case WebhookJobAction.evaluateWebhooks: {
          await webhookMatcher.findAndExecuteWebhooks(job.data.data)
          return
        }
        default:
          return
      }
    },
    {
      connection: getRedisConnection(),
      ...defaultWorkerOptions,
      concurrency: env.WEBHOOK_WORKER_CONCURRENCY,
    },
  )

  worker.on("failed", (job, err) => {
    if (job) {
      logger.error(err, `Webhook job ${job.id} has failed`)
    }
  })

  registerClose(() => worker.close())
})
