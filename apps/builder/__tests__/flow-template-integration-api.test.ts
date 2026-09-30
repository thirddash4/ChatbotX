// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = { method: string; path: string }
type CapturedProcedure = {
  route: RouteConfig
  handler?: (...args: any[]) => any
}

// Capture each registered procedure's handler by faking the oRPC builder chain.
const { authorizedAPI, capturedProcedures, findByInboxIdForWorkspace } =
  vi.hoisted(() => {
    const capturedProcedures: CapturedProcedure[] = []
    const makeProcedure = (route: RouteConfig) => {
      const record: CapturedProcedure = { route }
      capturedProcedures.push(record)
      const chain: Record<string, unknown> = {
        input: vi.fn(() => chain),
        use: vi.fn(() => chain),
        output: vi.fn(() => chain),
        handler: vi.fn((fn: (...args: any[]) => any) => {
          record.handler = fn
          return { handler: fn }
        }),
      }
      return chain
    }
    return {
      authorizedAPI: {
        route: vi.fn((config: RouteConfig) => makeProcedure(config)),
      },
      capturedProcedures,
      findByInboxIdForWorkspace: vi.fn(),
    }
  })

vi.mock("@/orpc", () => ({ authorizedAPI }))
vi.mock("@/middlewares/auth", () => ({
  workspaceAuthorizedMidddleware: vi.fn(),
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationWhatsappRepository: { findByInboxIdForWorkspace },
}))
// Imports pulled in by the router module but unused by this procedure.
vi.mock("@chatbotx.io/analytics", () => ({
  flowAnalyticsService: {},
  flowNodeStatsResponse: {},
  flowStatsRequest: {},
}))
vi.mock("@chatbotx.io/business", () => ({ flowVersionService: {} }))
vi.mock("@chatbotx.io/integration-messenger/messenger-ads", () => ({
  convertStartNodeToMessengerAdsJson: vi.fn(),
}))
vi.mock("../src/features/flows/queries", () => ({ listFlows: vi.fn() }))

await import("@/features/flows/api/private")

const resolver = capturedProcedures.find(
  (p) =>
    p.route.method === "GET" &&
    p.route.path === "/workspaces/{workspaceId}/flows/template-integration",
)

describe("privateResolveTemplateFlowIntegrationAPI", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("is registered as a GET route", () => {
    expect(resolver).toBeDefined()
    expect(resolver?.handler).toBeInstanceOf(Function)
  })

  test("returns the WhatsApp integration id backing the inbox", async () => {
    findByInboxIdForWorkspace.mockResolvedValueOnce({ id: "int-1" })

    const result = await resolver?.handler?.({
      input: { workspaceId: "ws-1", inboxId: "inbox-1" },
    })

    expect(findByInboxIdForWorkspace).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      inboxId: "inbox-1",
    })
    expect(result).toEqual({ integrationWhatsappId: "int-1" })
  })

  test("returns null for an inbox with no WhatsApp integration", async () => {
    findByInboxIdForWorkspace.mockResolvedValueOnce(null)

    const result = await resolver?.handler?.({
      input: { workspaceId: "ws-1", inboxId: "inbox-2" },
    })

    expect(result).toEqual({ integrationWhatsappId: null })
  })
})
