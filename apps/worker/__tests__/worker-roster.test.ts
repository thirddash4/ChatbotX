import { readFileSync } from "node:fs"
import { describe, expect, test, vi } from "vitest"

const { started } = vi.hoisted(() => ({ started: [] as string[] }))
vi.mock("../src/chat/worker", () => {
  started.push("chat")
  return {}
})
vi.mock("../src/default/worker", () => {
  started.push("default")
  return {}
})
vi.mock("../src/events/worker", () => {
  started.push("events")
  return {}
})
vi.mock("../src/integration/worker", () => {
  started.push("integration")
  return {}
})
vi.mock("../src/schedule/worker", () => {
  started.push("schedule")
  return {}
})
vi.mock("../src/webhook/worker", () => {
  started.push("webhook")
  return {}
})

describe("production roster", () => {
  test("standalone and core load exactly the observed six workers", async () => {
    await import("../src/standalone")
    await import("../src/core")
    expect(started.sort()).toEqual([
      "chat",
      "default",
      "events",
      "integration",
      "schedule",
      "webhook",
    ])
  })

  test.each([
    "chat",
    "default",
    "events",
    "integration",
    "schedule",
    "webhook",
  ])("%s registers lifecycle without its own process exit", (name) => {
    const source = readFileSync(
      new URL(`../src/${name}/worker.ts`, import.meta.url),
      "utf8",
    )
    expect(source).toContain(`startManagedWorker("${name}"`)
    expect(source).toContain("registerClose(")
    expect(source).not.toContain("process.exit")
    expect(source).not.toContain('process.once("SIG')
  })
})
