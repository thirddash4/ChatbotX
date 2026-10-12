import { describe, expect, test, vi } from "vitest"
import { closeWorkerResources, WorkerLifecycle } from "../src/lib/lifecycle"

function deferred() {
  const { promise, resolve } = Promise.withResolvers<void>()
  return { promise, resolve }
}

describe("consolidated worker lifecycle", () => {
  test("drains every worker and schedule resource before completing shutdown", async () => {
    const lifecycle = new WorkerLifecycle()
    const gate = deferred()
    const closed: string[] = []
    for (const name of [
      "chat",
      "default",
      "events",
      "integration",
      "schedule",
      "webhook",
    ]) {
      lifecycle.start((register) =>
        register(async () => {
          if (name === "integration") {
            await gate.promise
          }
          closed.push(name)
        }),
      )
    }
    let finished = false
    const stopping = lifecycle.stop().then(() => {
      finished = true
    })
    await vi.waitFor(() => expect(closed).toContain("schedule"))
    expect(finished).toBe(false)
    gate.resolve()
    await stopping
    expect(closed.sort()).toEqual([
      "chat",
      "default",
      "events",
      "integration",
      "schedule",
      "webhook",
    ])
  })

  test("waits for startup to register late resources and ignores repeated stop calls", async () => {
    const lifecycle = new WorkerLifecycle()
    const gate = deferred()
    const close = vi.fn(async () => undefined)
    lifecycle.start(async (register) => {
      await gate.promise
      register(close)
    })
    const first = lifecycle.stop()
    expect(lifecycle.stop()).toBe(first)
    expect(close).not.toHaveBeenCalled()
    gate.resolve()
    await first
    expect(close).toHaveBeenCalledOnce()
    expect(() => lifecycle.start(() => undefined)).toThrow("during shutdown")
  })

  test("startup and synchronous close failures do not skip other closers", async () => {
    const lifecycle = new WorkerLifecycle()
    const closed = vi.fn(async () => undefined)
    const start = lifecycle.start((register) => {
      register(() => {
        throw new Error("close failed")
      })
      register(closed)
      throw new Error("startup failed")
    })
    await expect(start).rejects.toThrow("startup failed")
    const results = await lifecycle.stop()
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(2)
    expect(closed).toHaveBeenCalledOnce()
  })
})

test("a failed consumer close still closes its dependent resources", async () => {
  const closeResources = vi.fn(async () => undefined)
  await expect(
    closeWorkerResources(
      { close: () => Promise.reject(new Error("consumer failed")) },
      closeResources,
    ),
  ).rejects.toThrow("consumer failed")
  expect(closeResources).toHaveBeenCalledOnce()
})

test("successful consumer close precedes resource close", async () => {
  const order: string[] = []
  await closeWorkerResources(
    {
      close: () => {
        order.push("worker")
        return Promise.resolve()
      },
    },
    () => {
      order.push("resources")
      return Promise.resolve()
    },
  )
  expect(order).toEqual(["worker", "resources"])
})
