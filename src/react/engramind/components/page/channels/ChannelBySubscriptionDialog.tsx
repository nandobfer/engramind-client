"use client"

import { useCallback } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "../../../../components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../../components/ui/dialog"
import { FORM_GRID } from "../../../../components/ui/form-grid"
import { Input } from "../../../../components/ui/input"
import { OptionTabs } from "../../../../components/ui/option-tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../components/ui/select"
import { subscribeInput } from "../../../../../core/schemas"
import { SUBSCRIPTION_MODES } from "../../../constants"
import { CHANNEL_HELP, SUBSCRIPTION_MODE_HELP } from "../../../help/identities"
import type { EngramindAgent } from "../../../types"
import { engramindSend, useEngramindMutation } from "../../../hooks/useEngramind"
import { InfoField } from "../../shared/InfoField"
import { useSchemaForm } from "../../shared/useSchemaForm"

type Values = { agent: string; target: string; mode: string }
const MODE_OPTIONS = SUBSCRIPTION_MODES.map((mode) => ({ value: mode, label: mode }))

/**
 * Novo canal no modo app: o token de app não cria canal direto (`POST /v1/channels` é do gestor), então o
 * canal nasce pela assinatura exata de um agente do app (nome = slug, criado pelo app). Repetir a mesma
 * assinatura devolve a existente.
 */
export function ChannelBySubscriptionDialog({ agents, open, onOpenChange, onCreated }: { agents: readonly EngramindAgent[]; open: boolean; onOpenChange: (open: boolean) => void; onCreated?: (slug: string) => void }) {
    const active = agents.filter((agent) => !agent.disabled_at)
    const toPayload = useCallback((values: Values) => ({ agent: values.agent, target: values.target.trim(), mode: values.mode }), [])
    const form = useSchemaForm<Values, unknown>(subscribeInput, { agent: active[0]?.qualified_slug ?? "", target: "", mode: "inject" }, toPayload)
    const save = useEngramindMutation((body: Record<string, unknown>) => engramindSend("post", "subscriptions", body), { invalidate: ["channels", "subscriptions", "agents", "consumer-settings"], success: "Canal criado pela assinatura" })
    const exact = !form.values.target.trim().endsWith("*")
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>Novo canal</DialogTitle>
                    <DialogDescription>O canal nasce quando um agente do app assina o slug exato. Agentes alcançam um canal quando o assinam.</DialogDescription>
                </DialogHeader>
                <div className={FORM_GRID}>
                    <InfoField id="channel-agent" label="Agente" error={form.error("agent")}>
                        <Select value={form.values.agent} onValueChange={(value) => form.set("agent", value)}>
                            <SelectTrigger id="channel-agent" className="bg-transparent">
                                <SelectValue placeholder="Escolha o agente" />
                            </SelectTrigger>
                            <SelectContent>
                                {active.map((agent) => (
                                    <SelectItem key={agent.id} value={agent.qualified_slug}>
                                        {agent.name} ({agent.qualified_slug})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </InfoField>
                    <InfoField id="channel-target" label="Slug do canal" info={CHANNEL_HELP.slug} error={form.error("target") ?? (exact ? undefined : "Use o slug exato do canal (sem *)")}>
                        <Input id="channel-target" value={form.values.target} onChange={(event) => form.set("target", event.target.value)} placeholder="meu-app/global" />
                    </InfoField>
                    <InfoField id="channel-mode" label="Modo" info={SUBSCRIPTION_MODE_HELP[form.values.mode]}>
                        <OptionTabs aria-label="Modo da assinatura" options={MODE_OPTIONS} value={form.values.mode} onChange={(value) => form.set("mode", value)} />
                    </InfoField>
                </div>
                <DialogFooter>
                    <Button
                        type="button"
                        disabled={!form.valid || !exact || !active.length || save.isPending}
                        onClick={() =>
                            form.payload &&
                            save.mutate(form.payload as Record<string, unknown>, {
                                onSuccess: (_data, variables) => {
                                    onOpenChange(false)
                                    if (typeof variables.target === "string") onCreated?.(variables.target)
                                },
                            })
                        }
                    >
                        {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Criar canal
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
