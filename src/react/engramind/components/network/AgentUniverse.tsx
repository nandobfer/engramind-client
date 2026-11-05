"use client"

import { useMemo } from "react"
import { UserX } from "lucide-react"
import { EmptyState } from "../../../components/feedback/EmptyState"
import { useT } from "../../../lib/config"
import { agentCreateChannels, agentUniverseChannels, channelColors, pickChannelColors, subscriptionLinks } from "../../network/network-math"
import type { NetworkAgent, NetworkMemory } from "../../network/types"
import { useEngramindRealtime } from "../../hooks/useEngramind"
import { useEngramindNetwork } from "../../hooks/useEngramindNetwork"
import { QueryBoundary } from "../shared/QueryBoundary"
import { AgentLabelsProvider } from "./AgentLabels"
import { ChannelLabelsProvider } from "./ChannelName"
import type { MemoryCardActions } from "./MemoryCard"
import { MemoryUniverse } from "./MemoryUniverse"
import { NetworkSkeleton } from "./NetworkSkeleton"
import type { LocalRemovals } from "./useLocalRemovals"
import { useRawMemoryActions } from "./useRawMemoryActions"

type NetworkData = ReturnType<typeof useEngramindNetwork>

/**
 * Universo de um agente (OPE-109/OPE-113, extraído da rede na OPE-130): o agente no centro e as memórias
 * de todos os canais que ele assina, cada canal com a sua cor. **"Nova memória"** (D11) escolhe o canal
 * entre os assinados e não arquivados. Usado pela rede (`?universo=agente:…`) e pelo `AgentUniverse`.
 */
export function AgentUniverseView({
    agent,
    data,
    actions,
    localRemovals,
    openCreate,
    includeArchived = false,
    isMatch,
    defaultCreateChannel,
    allowCreate = true,
    className,
}: {
    agent: NetworkAgent
    data: Pick<NetworkData, "channels" | "subscriptions" | "memories" | "staleAfterDays" | "memoriesUpdatedAt">
    actions: MemoryCardActions
    localRemovals?: LocalRemovals
    openCreate: (channel: string, channels?: readonly string[]) => void
    includeArchived?: boolean
    isMatch?: ((memory: NetworkMemory) => boolean) | null
    defaultCreateChannel?: string | null
    allowCreate?: boolean
    className?: string
}) {
    const t = useT()
    const links = useMemo(() => subscriptionLinks(data.subscriptions, data.channels, true), [data.subscriptions, data.channels])
    const agentChannels = useMemo(() => agentUniverseChannels(links, data.channels, agent.id, includeArchived), [links, data.channels, agent.id, includeArchived])
    // Cores sobre todos os canais (estáveis entre universos); o universo dá o roxo primário ao canal com mais memórias nele.
    const allColors = useMemo(() => channelColors(data.channels.map((item) => item.slug)), [data.channels])
    const colors = useMemo(() => pickChannelColors(allColors, agentChannels), [allColors, agentChannels])
    const memories = useMemo(() => data.memories.filter((memory) => agentChannels.includes(memory.channel)), [data.memories, agentChannels])
    const createChannels = useMemo(() => (allowCreate ? agentCreateChannels(agentChannels, data.channels, memories, defaultCreateChannel) : []), [allowCreate, agentChannels, data.channels, memories, defaultCreateChannel])
    return (
        <MemoryUniverse
            center={{ kind: "agent", id: agent.id, label: agent.name }}
            memories={memories}
            staleAfterDays={data.staleAfterDays}
            channelColors={colors}
            isMatch={isMatch}
            actions={actions}
            localRemovals={localRemovals}
            dataVersion={data.memoriesUpdatedAt}
            onCreate={createChannels.length ? () => openCreate(createChannels[0]!, createChannels) : null}
            createLabel={createChannels.length ? t("network.newMemory") : undefined}
            emptyTitle={agentChannels.length ? t("network.agentEmpty") : t("network.agentNoChannels")}
            className={className}
        />
    )
}

/**
 * Universo de um agente fora da rede (ex.: a página de um agente no app), com os mesmos dados, ações,
 * cores, tempo real e "Nova memória" da rede. Agente que não existe no Engramind: estado vazio.
 */
export function AgentUniverse(props: { agent: string; defaultCreateChannel?: string | null; allowCreate?: boolean; className?: string; onConfigure?: () => void }) {
    return (
        <ChannelLabelsProvider>
            <AgentUniverseContent {...props} />
        </ChannelLabelsProvider>
    )
}

function AgentUniverseContent({ agent: agentId, defaultCreateChannel, allowCreate, className, onConfigure }: { agent: string; defaultCreateChannel?: string | null; allowCreate?: boolean; className?: string; onConfigure?: () => void }) {
    useEngramindRealtime()
    const t = useT()
    const data = useEngramindNetwork()
    const rawById = useMemo(() => new Map(data.rawMemories.map((memory) => [memory.id, memory])), [data.rawMemories])
    const raw = useRawMemoryActions({ rawById, channels: data.rawChannels, categories: data.categories, limits: data.limits })
    const agent = data.agents.find((item) => item.id === agentId)
    return (
        <AgentLabelsProvider value={data.agentNames}>
            <QueryBoundary isLoading={data.isLoading} error={data.error} onRetry={data.refetch} skeleton={<NetworkSkeleton className={className} />} onConfigure={onConfigure}>
                {agent ? (
                    <AgentUniverseView agent={agent} data={data} actions={raw.actions} localRemovals={raw.localRemovals} openCreate={raw.openCreate} defaultCreateChannel={defaultCreateChannel} allowCreate={allowCreate} className={className} />
                ) : (
                    <div data-testid="agent-universe-missing">
                        <EmptyState icon={UserX} title={t("network.agentMissing.title")} description={t("network.agentMissing.description")} />
                    </div>
                )}
            </QueryBoundary>
            {raw.dialogs}
        </AgentLabelsProvider>
    )
}
