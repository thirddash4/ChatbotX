import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { expect, test } from "vitest"

const root = resolve(import.meta.dirname, "../../..")
const script = resolve(root, "scripts/check-worker-deploy.mjs")

test("accepts the full repository and rejects empty or worker-only uploads", () => {
  expect(spawnSync(process.execPath, [script, root]).status).toBe(0)
  expect(
    spawnSync(process.execPath, [script, resolve(root, "apps/worker")]).status,
  ).toBe(1)
  const empty = mkdtempSync(resolve(tmpdir(), "worker-context-"))
  try {
    writeFileSync(resolve(empty, "package.json"), "{}")
    const result = spawnSync(process.execPath, [script, empty], {
      encoding: "utf8",
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("Incomplete repository upload")
  } finally {
    rmSync(empty, { recursive: true, force: true })
  }
})
