import { startWorker, stopWorker } from "@chatbotx.io/event-bus/worker"
import { startManagedWorker } from "../lib/shutdown"
import { analyticsDashboardEvents } from "./analytics"
import flowEventListener from "./flow"
import messageEventListener from "./message"

startManagedWorker("events", async (registerClose) => {
  registerClose(stopWorker)
  await startWorker([
    messageEventListener,
    flowEventListener,
    analyticsDashboardEvents,
  ])
})
