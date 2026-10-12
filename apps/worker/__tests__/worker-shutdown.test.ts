import { beforeEach, expect, test, vi } from "vitest"

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}))

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv(
    "WORKER_DISABLE",
    "ai-agent,sequence-consumer,sequence-producer,sequence-scheduler,trigger",
  )
  vi.spyOn(process, "on").mockImplementation(() => process)
  vi.spyOn(process, "exit").mockImplementation((code) => {
    throw new Error(`exit:${code}`)
  })
})

test("registers one shared handler per signal and exits only after all drains", async () => {
  const { startManagedWorker, shutdownWorkerProcess } = await import(
    "../src/lib/shutdown"
  )
  expect(vi.mocked(process.on).mock.calls.map(([name]) => name)).toEqual([
    "SIGINT",
    "SIGTERM",
    "uncaughtException",
    "unhandledRejection",
  ])
  const gate = Promise.withResolvers<void>()
  const fast = vi.fn(async () => undefined)
  startManagedWorker("integration", (register) => register(() => gate.promise))
  startManagedWorker("schedule", (register) => register(fast))
  const stopping = shutdownWorkerProcess()
  const rejection = expect(stopping).rejects.toThrow("exit:0")
  expect(shutdownWorkerProcess()).toBe(stopping)
  await vi.waitFor(() => expect(fast).toHaveBeenCalledOnce())
  expect(process.exit).not.toHaveBeenCalled()
  gate.resolve()
  await rejection
  expect(process.exit).toHaveBeenCalledExactlyOnceWith(0)
})

test("disabled workers never start", async () => {
  const { startManagedWorker, shutdownWorkerProcess } = await import(
    "../src/lib/shutdown"
  )
  const setup = vi.fn()
  startManagedWorker("trigger", setup)
  startManagedWorker("ai-agent", setup)
  await expect(shutdownWorkerProcess()).rejects.toThrow("exit:0")
  expect(setup).not.toHaveBeenCalled()
})

test("a failing close still drains other workers and exits nonzero", async () => {
  const { startManagedWorker, shutdownWorkerProcess } = await import(
    "../src/lib/shutdown"
  )
  const close = vi.fn(async () => undefined)
  startManagedWorker("events", (register) =>
    register(() => {
      throw new Error("drain failed")
    }),
  )
  startManagedWorker("chat", (register) => register(close))
  await expect(shutdownWorkerProcess()).rejects.toThrow("exit:1")
  expect(close).toHaveBeenCalledOnce()
})

test.each([
  "SIGINT",
  "SIGTERM",
  "uncaughtException",
  "unhandledRejection",
])("handles %s through the same drain", async (signal) => {
  const { shutdownWorkerProcess, startManagedWorker } = await import(
    "../src/lib/shutdown"
  )
  const gate = Promise.withResolvers<void>()
  startManagedWorker("schedule", (register) => register(() => gate.promise))
  const handler = vi
    .mocked(process.on)
    .mock.calls.find(([name]) => name === signal)?.[1]
  expect(handler).toBeDefined()
  handler?.(new Error("test failure"))
  const code = signal.startsWith("SIG") ? 0 : 1
  const rejection = expect(shutdownWorkerProcess()).rejects.toThrow(
    `exit:${code}`,
  )
  expect(process.exit).not.toHaveBeenCalled()
  gate.resolve()
  await rejection
})
