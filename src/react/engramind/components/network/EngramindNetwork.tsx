"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { AppWindow, Unplug, UserX } from "lucide-react"
import { toast } from "../../../lib/toast"
import { usePersistentState } from "../../../hooks/usePersistentState"
import { apiErrorMessage } from "../../../lib/api"
import { EmptyState } from "../../../components/feedback/EmptyState"
import { useEngramindConfig, useT } from "../../../lib/config"
import { channelsWithMemories } from "../../network/app-network"
import { agentUniverseChannels, subscriptionLinks } from "../../network/network-math"
import { clearNetworkFilters, DEFAULT_NETWORK_FILTERS, hasActiveFilters, matchesFilters, NETWORK_FILTERS_STORAGE_KEY, networkFiltersSchema, type NetworkFilters } from "../../network/filters"
import type { NetworkMemory } from "../../network/types"
import { useEngramindRealtime } from "../../hooks/useEngramind"
import { useEngramindNetwork } from "../../hooks/useEngramindNetwork"
import { useNetworkSearch } from "../../hooks/useNetworkSearch"
import { QueryBoundary } from "../shared/QueryBoundary"
import { ImportMemoriesDialog } from "../page/memories/ImportMemoriesDialog"
import { ChannelDialog } from "../page/channels/ChannelDialog"
import { ChannelBySubscriptionDialog } from "../page/channels/ChannelBySubscriptionDialog"
import { ChannelPanel } from "./ChannelPanel"
import { AgentLabelsProvider } from "./AgentLabels"
import { ChannelLabelsProvider, useChannelLabels } from "./ChannelName"
import { channelDisplayName } from "../../network/channel-labels"
import { MemoryUniverse } from "./MemoryUniverse"
import { AgentUniverseView } from "./AgentUniverse"
import { NetworkBreadcrumb } from "./NetworkBreadcrumb"
import { NetworkSkeleton } from "./NetworkSkeleton"
import { NetworkActions, NetworkToolbar } from "./NetworkToolbar"
import { OverviewView } from "./OverviewView"
import { AppsOverviewView } from "./AppsOverviewView"
import { EmptyChannelList } from "./overview-shared"
import { NetworkFooter } from "./NetworkFooter"
import { useRawMemoryActions } from "./useRawMemoryActions"
import { useUniverseParam } from "./useUniverseParam"

/**
 * Rede do Engramind: no modo gestor, a visão inicial Apps x canais e a visão Agentes x canais de um app
 * (`?app=`); no modo app, a visão inicial é a rede Agentes x canais do próprio app. Universo do canal e
 * universo do agente (`?universo=`), com a gestão de canais e memórias. As redes escondem os canais sem
 * nenhuma memória (lista "Sem memórias (N)").
 */
export function EngramindNetwork({ onConfigure }: { onConfigure?: () => void }) {
    return (
        <ChannelLabelsProvider>
            <EngramindNetworkContent onConfigure={onConfigure} />
        </ChannelLabelsProvider>
    )
}

function EngramindNetworkContent({ onConfigure }: { onConfigure?: () => void }) {
    useEngramindRealtime()
    const data = useEngramindNetwork()
    return (
        <AgentLabelsProvider value={data.agentNames}>
            <EngramindNetworkView onConfigure={onConfigure} data={data} />
        </AgentLabelsProvider>
    )
}

function EngramindNetworkView({ onConfigure: onConfigureProp, data }: { onConfigure?: () => void; data: ReturnType<typeof useEngramindNetwork> }) {
    const config = useEngramindConfig()
    const t = useT()
    const manager = config.mode === "manager"
    const onConfigure = onConfigureProp ?? (config.onConfigure ? () => config.onConfigure!("connection") : undefined)
    // Nenhum app ou app sem agentes: leva à configuração das identidades (agentes e apps).
    const configureIdentities = config.onConfigure ? () => config.onConfigure!("identities") : onConfigure
    const { value: filters, setValue: setFilters } = usePersistentState<NetworkFilters>(config.storagePrefix ? `${config.storagePrefix}:${NETWORK_FILTERS_STORAGE_KEY}` : NETWORK_FILTERS_STORAGE_KEY, networkFiltersSchema, DEFAULT_NETWORK_FILTERS)
    const patchFilters = useCallback((patch: Partial<NetworkFilters>) => setFilters((previous) => ({ ...previous, ...patch })), [setFilters])
    const clearFilters = useCallback(() => setFilters((previous) => clearNetworkFilters(previous)), [setFilters])
    const includeArchived = filters.includeArchived
    const [panel, setPanel] = useState<string | null>(null)
    const [dialog, setDialog] = useState<"import" | "channel" | null>(null)
    const { universe, app: appSlug, open, openApp, back, home } = useUniverseParam({ escapeEnabled: panel === null && dialog === null, fixedApp: manager ? null : data.ownApp })

    const rawById = useMemo(() => new Map(data.rawMemories.map((memory) => [memory.id, memory])), [data.rawMemories])
    const raw = useRawMemoryActions({ rawById, channels: data.rawChannels, categories: data.categories, limits: data.limits })
    const links = useMemo(() => subscriptionLinks(data.subscriptions, data.channels, true), [data.subscriptions, data.channels])
    const visibleChannels = useMemo(() => data.channels.filter((channel) => includeArchived || !channel.archived), [data.channels, includeArchived])
    const visibleLinks = useMemo(() => subscriptionLinks(data.subscriptions, data.channels, includeArchived), [data.subscriptions, data.channels, includeArchived])

    const channel = universe?.kind === "channel" ? data.channels.find((item) => item.slug === universe.slug) : undefined
    const agent = universe?.kind === "agent" ? data.agents.find((item) => item.id === universe.id) : undefined
    // Canal recém-criado (Novo canal abre o universo dele): espera a lista de canais ser relida.
    const missing = !data.isLoading && !data.error && universe !== null && !channel && !agent && !(universe.kind === "channel" && data.channelsFetching)
    useEffect(() => {
        if (!missing) return
        toast.error(universe?.kind === "channel" ? t("network.channelNotFound") : t("network.agentNotFound"))
        back({ replace: true })
    }, [missing, universe, back])
    const app = appSlug ? data.apps.find((item) => item.slug === appSlug) : undefined
    const missingApp = manager && !data.isLoading && !data.error && appSlug !== null && !app
    useEffect(() => {
        if (!missingApp) return
        toast.error(t("network.appNotFound"))
        home({ replace: true })
    }, [missingApp, home])

    // As duas redes (Apps x canais e Agentes x canais) só mostram canais com alguma memória (inativas contam).
    const networkChannels = useMemo(() => channelsWithMemories(visibleChannels, data.memories), [visibleChannels, data.memories])
    const networkLinks = useMemo(() => {
        const slugs = new Set(networkChannels.map((item) => item.slug))
        return visibleLinks.filter((link) => slugs.has(link.channel))
    }, [networkChannels, visibleLinks])
    const appAgents = useMemo(() => (app ? data.agents.filter((item) => item.app === app.slug) : []), [app, data.agents])
    const appLinksOfApp = useMemo(() => {
        const ids = new Set(appAgents.map((item) => item.id))
        return networkLinks.filter((link) => ids.has(link.agent))
    }, [appAgents, networkLinks])
    const appChannelList = useMemo(() => {
        const slugs = new Set(appLinksOfApp.map((link) => link.channel))
        return networkChannels.filter((item) => slugs.has(item.slug))
    }, [appLinksOfApp, networkChannels])
    // Canais assinados pelo app, mesmo sem memória (a rede esconde; o card de estatísticas abre o painel).
    const appLinkedChannelSlugs = useMemo(() => {
        if (!app) return null
        const ids = new Set(appAgents.map((item) => item.id))
        return new Set(visibleLinks.filter((link) => ids.has(link.agent)).map((link) => link.channel))
    }, [app, appAgents, visibleLinks])
    // Canais sem memória: fora do canvas, continuam editáveis pelo card de estatísticas (OPE-129).
    const emptyChannels = useMemo(() => {
        if (universe) return []
        const shown = new Set(networkChannels.map((item) => item.slug))
        return visibleChannels.filter((item) => !shown.has(item.slug) && (!appLinkedChannelSlugs || appLinkedChannelSlugs.has(item.slug)))
    }, [universe, networkChannels, visibleChannels, appLinkedChannelSlugs])

    const agentChannels = useMemo(() => (agent ? agentUniverseChannels(links, data.channels, agent.id, includeArchived) : []), [agent, links, includeArchived, data.channels])
    const universeMemories = useMemo(() => {
        if (channel) return data.memories.filter((memory) => memory.channel === channel.slug)
        if (agent) return data.memories.filter((memory) => agentChannels.includes(memory.channel))
        return []
    }, [channel, agent, agentChannels, data.memories])
    // Canais da rede em tela: os do app aberto ou todos os da visão de apps.
    const overviewChannels = app ? appChannelList : networkChannels
    const overviewMemories = useMemo(() => {
        const slugs = new Set(overviewChannels.map((item) => item.slug))
        return data.memories.filter((memory) => slugs.has(memory.channel))
    }, [data.memories, overviewChannels])

    // A busca cita os canais da visão atual (o Engramind só busca nos `manage` e arquivados citados).
    const viewChannels = useMemo(() => (channel ? [channel.slug] : agent ? agentChannels : overviewChannels.map((item) => item.slug)), [channel, agent, agentChannels, overviewChannels])
    const searchChannels = useMemo(() => (filters.channels.length ? viewChannels.filter((slug) => filters.channels.includes(slug)) : viewChannels), [viewChannels, filters.channels])
    const searching = filters.search.trim().length > 0
    const search = useNetworkSearch({ query: filters.search, channels: searchChannels, categories: filters.categories, fusion: data.searchFusion, enabled: searchChannels.length > 0 })
    // Busca que falhou não reaproveita o destaque do termo anterior: nada destaca e a barra avisa.
    const searchFailed = searching && searchChannels.length > 0 && search.isError
    const searchError = searchFailed ? apiErrorMessage(search.error, t("network.searchFailed")) : null
    const searchIds = useMemo<ReadonlySet<string> | null>(() => (!searching || searchFailed ? null : searchChannels.length ? (search.data?.ids ?? null) : new Set<string>()), [searching, searchFailed, searchChannels.length, search.data])
    useEffect(() => {
        if (search.errorUpdatedAt && searchFailed) toast.error(`Busca falhou: ${apiErrorMessage(search.error, "Não foi possível buscar as memórias.")}`)
        // Um aviso por falha (o `errorUpdatedAt` muda a cada erro).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search.errorUpdatedAt])

    const filtering = hasActiveFilters(filters, searchIds)
    const isMatch = useMemo(() => (filtering ? (memory: NetworkMemory) => matchesFilters(memory, filters, searchIds) : null), [filtering, filters, searchIds])
    const hitsByChannel = useMemo(() => {
        if (!isMatch) return null
        const hits = new Map<string, number>()
        for (const memory of data.memories) if (isMatch(memory)) hits.set(memory.channel, (hits.get(memory.channel) ?? 0) + 1)
        return hits
    }, [isMatch, data.memories])
    const viewMemories = channel || agent ? universeMemories : overviewMemories
    const total = isMatch ? viewMemories.filter(isMatch).length : viewMemories.length
    const filterOptions = useMemo(
        () => ({
            channels: data.channels.filter((item) => includeArchived || !item.archived).map((item) => item.slug),
            categories: data.categories.map((item) => item.key),
            authors: [...new Set(data.memories.map((memory) => memory.author).filter((author): author is string => Boolean(author)))].sort(),
        }),
        [data.channels, data.categories, data.memories, includeArchived],
    )

    const channelLabels = useChannelLabels()
    const current = channel ? { kind: "channel" as const, id: channel.slug, label: channelDisplayName(channel.slug, channelLabels) } : agent ? { kind: "agent" as const, id: agent.id, label: agent.name } : null
    const viewKey = current ? `${current.kind}:${current.id}` : app ? `app:${app.slug}` : "apps"
    // Modo app: a visão do app é a inicial (sem "voltar"); os estados vazios levam à configuração.
    const emptyAction = manager ? { actionLabel: t("network.backToNetwork"), onAction: () => back() } : configureIdentities ? { actionLabel: t("network.configure"), onAction: configureIdentities } : {}
    return (
        <div className="flex flex-col gap-3">
            <NetworkBreadcrumb
                app={app && manager ? { label: app.name, onOpen: () => openApp(app.slug) } : null}
                current={current}
                onBack={() => back()}
                onHome={() => home()}
                actions={<NetworkActions onNewChannel={() => setDialog("channel")} onImport={() => setDialog("import")} importDisabled={data.channels.every((item) => item.archived)} onChannelMenu={channel ? () => setPanel(channel.slug) : undefined} />}
            />
            <NetworkToolbar
                filters={filters}
                onFilters={patchFilters}
                options={filterOptions}
                onClear={clearFilters}
                total={total}
                textOnly={searching && !searchFailed && search.data?.textOnly === true}
                searchError={searchError}
                onRetrySearch={() => void search.refetch()}
            />
            <QueryBoundary isLoading={data.isLoading} error={data.error} onRetry={data.refetch} skeleton={<NetworkSkeleton />} onConfigure={onConfigure}>
                <AnimatePresence mode="wait" initial={false}>
                    <motion.div key={viewKey} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.04 }} transition={{ duration: 0.22 }}>
                        {channel ? (
                            <MemoryUniverse
                                center={{ kind: "channel", id: channel.slug, label: channel.slug, archived: channel.archived }}
                                memories={universeMemories}
                                staleAfterDays={data.staleAfterDays}
                                isMatch={isMatch}
                                actions={channel.archived ? { ...raw.actions, readOnly: true } : raw.actions}
                                localRemovals={raw.localRemovals}
                                subscribers={new Set(links.filter((link) => link.channel === channel.slug).map((link) => link.agent)).size}
                                dataVersion={data.memoriesUpdatedAt}
                                onCreate={channel.archived ? null : () => raw.openCreate(channel.slug)}
                                createLabel={t("network.newMemory")}
                            />
                        ) : agent ? (
                            <AgentUniverseView agent={agent} data={data} actions={raw.actions} localRemovals={raw.localRemovals} openCreate={raw.openCreate} includeArchived={includeArchived} isMatch={isMatch} />
                        ) : app ? (
                            !appAgents.length ? (
                                <EmptyState icon={UserX} title={t("network.noAgents.title")} description={t("network.noAgents.description")} {...emptyAction} />
                            ) : !appChannelList.length ? (
                                <EmptyState icon={Unplug} title={t("network.noLinkedChannels.title")} description={t("network.noLinkedChannels.description")} {...emptyAction}>
                                    <EmptyChannelList channels={emptyChannels} onOpen={setPanel} className="w-full max-w-sm border-t-0 pt-0 text-left" />
                                </EmptyState>
                            ) : (
                                <OverviewView
                                    agents={appAgents}
                                    channels={appChannelList}
                                    emptyChannels={emptyChannels}
                                    links={appLinksOfApp}
                                    memories={overviewMemories}
                                    allMemories={data.memories}
                                    title={app.name}
                                    layout={filters.overviewLayout}
                                    hitsByChannel={hitsByChannel}
                                    onOpenAgent={(id) => open({ kind: "agent", id })}
                                    onOpenChannel={(slug) => open({ kind: "channel", slug })}
                                    onChannelMenu={setPanel}
                                />
                            )
                        ) : !manager ? (
                            <EmptyState icon={UserX} title={t("network.noAgents.title")} description={t("network.noAgents.description")} {...emptyAction} />
                        ) : !data.apps.length ? (
                            <EmptyState icon={AppWindow} title={t("network.noApps.title")} description={t("network.noApps.description")} actionLabel={configureIdentities ? t("network.configure") : undefined} onAction={configureIdentities} />
                        ) : (
                            <AppsOverviewView
                                apps={data.apps}
                                agents={data.agents}
                                channels={networkChannels}
                                emptyChannels={emptyChannels}
                                links={networkLinks}
                                memories={overviewMemories}
                                allMemories={data.memories}
                                layout={filters.overviewLayout}
                                hitsByChannel={hitsByChannel}
                                onOpenApp={openApp}
                                onOpenChannel={(slug) => open({ kind: "channel", slug })}
                                onChannelMenu={setPanel}
                            />
                        )}
                    </motion.div>
                </AnimatePresence>
            </QueryBoundary>
            {/* Fim da página (OPE-113): o resumo, Configurar, Saiba mais e a distribuição da visão inicial. */}
            <NetworkFooter layout={universe ? undefined : { value: filters.overviewLayout, onChange: (overviewLayout) => patchFilters({ overviewLayout }) }} />
            <ChannelPanel channel={data.rawChannels.find((item) => item.slug === panel) ?? null} onOpenChange={(next) => !next && setPanel(null)} onDeleted={(slug) => universe?.kind === "channel" && universe.slug === slug && back()} />
            {dialog === "channel" &&
                (manager ? (
                    <ChannelDialog key="new" channel={null} open onOpenChange={(next) => !next && setDialog(null)} onCreated={(slug) => open({ kind: "channel", slug })} />
                ) : (
                    <ChannelBySubscriptionDialog agents={data.rawAgents} open onOpenChange={(next) => !next && setDialog(null)} onCreated={(slug) => open({ kind: "channel", slug })} />
                ))}
            {dialog === "import" && <ImportMemoriesDialog channels={data.rawChannels} maxBatch={data.maxBatch} onOpenChange={(next) => !next && setDialog(null)} />}
            {raw.dialogs}
        </div>
    )
}
