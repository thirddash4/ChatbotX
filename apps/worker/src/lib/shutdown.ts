import { WorkerLifecycle } from "./lifecycle"
import { logger } from "./logger"

const lifecycle = new WorkerLifecycle()
let shutdownPromise: Promise<void> | undefined
let exitCode = 0

export function shutdownWorkerProcess(code = 0): Promise<void> {
  exitCode = Math.max(exitCode, code)
  shutdownPromise ??= lifecycle.stop().then((results) => {
    for (const result of results) {
      if (result.status === "rejected") {
        exitCode = 1
        logger.error({ err: result.reason }, "Worker lifecycle failed")
      }
    }
    // Producer connections may remain open. Exit only after every startup and
    // every registered consumer/resource close has settled.
    process.exit(exitCode)
  })
  return shutdownPromise
}

export function startManagedWorker(
  name: string,
  setup: Parameters<WorkerLifecycle["start"]>[0],
): void {
  if (
    process.env.WORKER_DISABLE?.split(",")
      .map((value) => value.trim())
      .includes(name)
  ) {
    logger.info({ worker: name }, "Worker disabled")
    return
  }
  lifecycle.start(setup).catch((err) => {
    logger.error({ err, worker: name }, "Worker startup failed")
    shutdownWorkerProcess(1)
  })
}

process.on("SIGINT", () => shutdownWorkerProcess())
process.on("SIGTERM", () => shutdownWorkerProcess())
process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught worker exception")
  shutdownWorkerProcess(1)
})
process.on("unhandledRejection", (err) => {
  logger.error({ err }, "Unhandled worker rejection")
  shutdownWorkerProcess(1)
})
