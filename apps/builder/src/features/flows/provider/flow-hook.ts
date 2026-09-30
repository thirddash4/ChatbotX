import type { FlowNode } from "@chatbotx.io/flow-config"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useMemo } from "react"
import type { FlowVersionResource } from "@/features/flow-versions/schema/resource"
import { useWorkspaceId } from "@/hooks/routing"
import { orpc } from "@/lib/orpc/query"
import { maxPerPage } from "@/lib/shared-request"

export type FlowStateFilter = {
  startType?: string
  integrationWhatsappId?: string
  integrationWhatsappIds?: string[]
}

export const useFlows = (
  workspaceId: string | undefined,
  options?: { enabled?: boolean; filter?: FlowStateFilter },
) =>
  useQuery(
    orpc.flowsAPI.privateListFlowsAPI.queryOptions({
      input: {
        workspaceId: workspaceId ?? "",
        perPage: maxPerPage,
        active: true,
        ...options?.filter,
      },
      enabled: Boolean(workspaceId) && (options?.enabled ?? true),
      select: (res) => res.data,
    }),
  )

export const useInvalidateFlows = () => {
  const queryClient = useQueryClient()

  return useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: orpc.flowsAPI.privateListFlowsAPI.key(),
      }),
    [queryClient],
  )
}

export const useFlowSelectOptions = (options?: {
  enabled?: boolean
  filter?: FlowStateFilter
}) => {
  const workspaceId = useWorkspaceId()
  const { data: flows = [] } = useFlows(workspaceId, options)

  return useMemo(
    () =>
      flows.map((flow) => ({
        label: flow.name,
        value: flow.id.toString(),
      })),
    [flows],
  )
}

/**
 * Resolves the WhatsApp integration id backing a conversation's inbox, so the
 * "Send flow → Template" tab can scope its list to that number's templates.
 * Returns undefined until resolved or when the inbox has no WhatsApp
 * integration (non-WhatsApp conversation), which keeps the tab empty rather
 * than listing another number's templates.
 */
export const useTemplateFlowIntegrationId = (
  inboxId: string | undefined,
  options?: { enabled?: boolean },
) => {
  const workspaceId = useWorkspaceId()
  const { data } = useQuery(
    orpc.flowsAPI.privateResolveTemplateFlowIntegrationAPI.queryOptions({
      input: { workspaceId: workspaceId ?? "", inboxId: inboxId ?? "" },
      enabled: Boolean(workspaceId && inboxId) && (options?.enabled ?? true),
      select: (res) => res.integrationWhatsappId,
    }),
  )

  return data ?? undefined
}

export const useFlowNodesSelectOptions = (options?: {
  enabled?: boolean
  filter?: FlowStateFilter
}) => {
  const workspaceId = useWorkspaceId()
  const { data: flows = [] } = useFlows(workspaceId, options)

  return useMemo(
    () =>
      flows.map((flow) => ({
        label: flow.name,
        value: flow.id.toString(),
        children: getFlowNodesOptions(flow.flowVersions),
      })),
    [flows],
  )
}

export const getFlowNodesOptions = (flowVersions: FlowVersionResource[]) => {
  const lastedFlowVersion = flowVersions.find(({ isLatest }) => isLatest)
  if (!lastedFlowVersion) {
    return []
  }

  return (lastedFlowVersion.nodes as FlowNode[]).map((node: FlowNode) => ({
    label: node.data.name,
    value: node.id.toString(),
  }))
}
