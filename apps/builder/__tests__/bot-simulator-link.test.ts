import { describe, expect, test } from "vitest"
import {
  buildBotSimulatorLink,
  parseSimulatorWebsiteUrl,
} from "@/features/bot-simulator/lib/build-simulator-link"

describe("buildBotSimulatorLink", () => {
  test("puts workspace and webchat in the path and the website in ?url", () => {
    const link = buildBotSimulatorLink({
      appUrl: "https://app.example.com",
      workspaceId: "111",
      webchatId: "222",
      websiteUrl: "https://example.com",
    })

    expect(link).toBe(
      "https://app.example.com/bs/111/222?url=https%3A%2F%2Fexample.com",
    )
  })

  test("keeps the website's own query and hash intact", () => {
    const websiteUrl = "https://shop.example.com/p?a=1&b=2#reviews"
    const link = buildBotSimulatorLink({
      appUrl: "https://app.example.com/",
      workspaceId: "111",
      webchatId: "222",
      websiteUrl,
    })

    const parsed = new URL(link)
    expect(parsed.pathname).toBe("/bs/111/222")
    expect(parsed.hash).toBe("")
    expect(parsed.searchParams.get("url")).toBe(websiteUrl)
  })
})

describe("parseSimulatorWebsiteUrl", () => {
  test("accepts http and https pages", () => {
    expect(parseSimulatorWebsiteUrl("https://example.com")?.hostname).toBe(
      "example.com",
    )
    expect(parseSimulatorWebsiteUrl(" http://localhost:3000 ")).not.toBeNull()
  })

  test.each([
    "",
    "example.com",
    "ftp://example.com",
    "javascript:alert(1)",
    "data:text/html,hi",
  ])("rejects %s", (value) => {
    expect(parseSimulatorWebsiteUrl(value)).toBeNull()
  })

  test("rejects a repeated ?url param", () => {
    expect(parseSimulatorWebsiteUrl(["https://a.com", "https://b.com"])).toBe(
      null,
    )
  })
})
