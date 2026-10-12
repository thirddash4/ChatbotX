import { existsSync, readFileSync, statSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(process.argv[2] ?? ".")
const required = [
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "turbo.json",
  "apps/worker/package.json",
  "apps/worker/tsdown.config.ts",
  "apps/worker/docker/Dockerfile",
  "apps/worker/docker/rootfs/usr/local/bin/docker-entrypoint.sh",
  "apps/worker/railway.toml",
  "apps/worker/src/standalone.ts",
  "apps/worker/src/core.ts",
  "packages/business/package.json",
  "packages/database/package.json",
  "integrations/messenger/package.json",
]
for (const name of required) {
  const file = resolve(root, name)
  if (
    !(existsSync(file) && statSync(file).isFile() && statSync(file).size > 0)
  ) {
    throw new Error(`Incomplete repository upload: missing ${name}`)
  }
}
const config = readFileSync(resolve(root, "apps/worker/railway.toml"), "utf8")
if (!config.includes('dockerfilePath = "apps/worker/docker/Dockerfile"')) {
  throw new Error("Worker Dockerfile selection is missing")
}
const lock = readFileSync(resolve(root, "pnpm-lock.yaml"), "utf8")
if (!lock.includes("  apps/worker:")) {
  throw new Error("Lockfile does not contain the worker workspace")
}
console.log("Worker repository context is complete; no deployment performed")
