"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { LinkIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import z from "zod"
import { useTenantSettings } from "@/features/tenant"
import {
  buildBotSimulatorLink,
  parseSimulatorWebsiteUrl,
} from "../lib/build-simulator-link"

type BotSimulatorFormProps = {
  workspaceId: string
  webchats: { id: string; name: string }[]
}

function useBotSimulatorSchema() {
  const t = useTranslations()
  return useMemo(
    () =>
      z.object({
        websiteUrl: z
          .string()
          .refine((value) => parseSimulatorWebsiteUrl(value) !== null, {
            message: t("botSimulator.invalidUrl"),
          }),
        webchatId: z.string().min(1, t("botSimulator.webchatRequired")),
      }),
    [t],
  )
}

type BotSimulatorFormValues = z.infer<ReturnType<typeof useBotSimulatorSchema>>

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function BotSimulatorForm({
  workspaceId,
  webchats,
}: BotSimulatorFormProps) {
  const t = useTranslations()
  const schema = useBotSimulatorSchema()
  const { appUrl } = useTenantSettings()
  const form = useForm<BotSimulatorFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { websiteUrl: "", webchatId: webchats[0]?.id ?? "" },
  })

  const webchatOptions = webchats.map((webchat) => ({
    value: webchat.id,
    label: webchat.name,
  }))
  const hasWebchats = webchats.length > 0

  const handleGetLink = async (values: BotSimulatorFormValues) => {
    const link = buildBotSimulatorLink({
      appUrl: appUrl || window.location.origin,
      workspaceId,
      webchatId: values.webchatId,
      websiteUrl: values.websiteUrl,
    })
    if (await copyToClipboard(link)) {
      toast.success(t("botSimulator.linkCopied"))
    } else {
      toast.error(t("botSimulator.copyFailed"))
    }
  }

  return (
    <Card className="mx-auto w-full max-w-xl">
      <CardHeader>
        <CardTitle>{t("botSimulator.title")}</CardTitle>
        <CardDescription>{t("botSimulator.formDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit(handleGetLink)}
          >
            <InputField<BotSimulatorFormValues>
              description={t("botSimulator.websiteLinkHint")}
              label={t("botSimulator.websiteLink")}
              name="websiteUrl"
              placeholder={t("botSimulator.websiteLinkPlaceholder")}
              required
              type="url"
            />
            <SelectField<BotSimulatorFormValues>
              disabled={!hasWebchats}
              label={t("fields.webchat.label")}
              name="webchatId"
              options={webchatOptions}
              placeholder={t("botSimulator.selectWebchat")}
              required
            />
            {hasWebchats ? null : (
              <p className="text-muted-foreground text-sm">
                {t("botSimulator.noWebchat")}{" "}
                <Link
                  className="text-primary underline"
                  href={`/space/${workspaceId}/settings/channels/webchat`}
                >
                  {t("botSimulator.createWebchat")}
                </Link>
              </p>
            )}
            <div className="flex justify-center">
              <Button disabled={!hasWebchats} type="submit">
                <LinkIcon className="size-4" />
                {t("botSimulator.getLink")}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
