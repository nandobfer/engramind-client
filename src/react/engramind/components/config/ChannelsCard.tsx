"use client"

import { useMemo, useState } from "react"
import { Hash, MoreHorizontal, Plus } from "lucide-react"
import { EmptyState } from "../../../components/feedback/EmptyState"
import { Button } from "../../../components/ui/button"
import { useT } from "../../../lib/config"
import { CHANNEL_HELP } from "../../help/identities"
import type { EngramindAgent, EngramindChannel, EngramindSubscription } from "../../types"
import { ChannelPanel } from "../network/ChannelPanel"
import { ChannelDisplayName } from "../network/ChannelName"
import { ChannelBySubscriptionDialog } from "../page/channels/ChannelBySubscriptionDialog"
import { HelpBadge } from "../shared/Badges"
import { Section } from "../shared/Section"

/**
 * Canais que os agentes do app alcançam: criar pela assinatura exata (o token de app não cria canal
 * direto), abrir o painel do canal (assinantes, arquivar e restaurar os que o app criou; o Engramind
 * recusa os compartilhados com `409 CHANNEL_SHARED`).
 */
export function ChannelsCard({ channels, agents, subscriptions }: { channels: readonly EngramindChannel[]; agents: readonly EngramindAgent[]; subscriptions: readonly EngramindSubscription[] }) {
    const t = useT()
    const [creating, setCreating] = useState(false)
    const [panel, setPanel] = useState<string | null>(null)
    const subscribers = useMemo(() => {
        const counts = new Map<string, Set<string>>()
        for (const subscription of subscriptions) for (const slug of subscription.reaches) counts.set(slug, (counts.get(slug) ?? new Set()).add(subscription.agent.id))
        return counts
    }, [subscriptions])
    const sorted = useMemo(() => [...channels].sort((a, b) => Number(Boolean(a.archived_at)) - Number(Boolean(b.archived_at)) || a.slug.localeCompare(b.slug)), [channels])
    const hasAgents = agents.some((agent) => !agent.disabled_at)
    return (
        <Section
            title={t("config.channels.title")}
            info="Memórias pertencem a canais. Os agentes do app alcançam um canal quando o assinam."
            actions={
                <Button type="button" size="sm" onClick={() => setCreating(true)} disabled={!hasAgents}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden /> {t("config.newChannel")}
                </Button>
            }
        >
            {sorted.length === 0 ? (
                <EmptyState icon={Hash} title="Nenhum canal" description="Assine um canal exato com um agente do app para criá-lo." actionLabel={hasAgents ? t("config.newChannel") : undefined} onAction={() => setCreating(true)} />
            ) : (
                <ul className="divide-y rounded-lg border" data-testid="app-channels">
                    {sorted.map((channel) => (
                        <li key={channel.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                            <div className="min-w-0 flex-1 space-y-1">
                                <p className="flex flex-wrap items-center gap-1.5">
                                    <span className="font-medium">{channel.name}</span>
                                    <ChannelDisplayName slug={channel.slug} className="font-mono text-xs text-muted-foreground" />
                                    {channel.archived_at && <HelpBadge value="arquivado" tone="warning" help={CHANNEL_HELP.archived} />}
                                </p>
                                <p className="text-xs text-muted-foreground">{subscribers.get(channel.slug)?.size ?? 0} agente(s) do app</p>
                            </div>
                            <Button type="button" variant="ghost" size="icon" aria-label={`Abrir o canal ${channel.slug}`} className="h-8 w-8" onClick={() => setPanel(channel.slug)}>
                                <MoreHorizontal className="h-4 w-4" aria-hidden />
                            </Button>
                        </li>
                    ))}
                </ul>
            )}
            {creating && <ChannelBySubscriptionDialog agents={agents} open onOpenChange={setCreating} />}
            <ChannelPanel channel={channels.find((channel) => channel.slug === panel) ?? null} onOpenChange={(open) => !open && setPanel(null)} />
        </Section>
    )
}
