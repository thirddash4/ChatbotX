/**
 * The bot simulator only frames real web pages, so anything that is not an
 * absolute http(s) URL (e.g. `javascript:`) is rejected before it can reach
 * an iframe `src`.
 */
export function parseSimulatorWebsiteUrl(value: unknown): URL | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null
  }
  try {
    const url = new URL(value.trim())
    return url.protocol === "http:" || url.protocol === "https:" ? url : null
  } catch {
    return null
  }
}

export function buildBotSimulatorLink(input: {
  appUrl: string
  workspaceId: string
  webchatId: string
  websiteUrl: string
}): string {
  const link = new URL(
    `/bs/${input.workspaceId}/${input.webchatId}`,
    input.appUrl,
  )
  link.searchParams.set("url", input.websiteUrl.trim())
  return link.toString()
}
