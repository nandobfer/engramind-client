"use client"

import { useMemo, useRef } from "react"
import { useEngramindConfig } from "../../lib/config"
import { agentDisplayName, DEFAULT_SEARCH_FUSION, DEFAULT_STALE_AFTER_DAYS, type SearchFusion, type SubscriptionInput } from "../network/network-math"
import type { NetworkAgent, NetworkChannel, NetworkMemory } from "../network/types"
import type { Category, ConsumerSettings, EngramindAgent, EngramindApp, EngramindChannel, EngramindMemory, EngramindSubscription, SettingMeta, WhoAmI } from "../types"
import { useEngramindList, useEngramindQuery } from "./useEngramind"

/**
 * Dados da rede do Engramind: canais (com os arquivados), agentes, assinaturas e memórias de todos os
 * status (todas as páginas). No modo gestor, também os apps e as configurações globais (o prazo
 * `consolidation.stale_after_days` e os pesos da busca); no modo app, o próprio app (`whoami`), as
 * categorias e os limites de `get_consumer_settings`. Tudo pela fonte de dados do provider.
 */

export const STALE_AFTER_DAYS_KEY = "consolidation.stale_after_days"
const ALL_STATUSES = "active,permanent,archived"

export function toNetworkMemory(memory: EngramindMemory): NetworkMemory {
    return {
        id: memory.id,
        channel: memory.channel,
        title: memory.title?.trim() || firstSentence(memory.text),
        text: memory.text,
        category: memory.category,
        status: memory.status,
        version: memory.version,
        createdAt: memory.created_at,
        updatedAt: memory.updated_at,
        retrievals: memory.retrieval_count ?? 0,
        injections: memory.injected_count ?? 0,
        lastRetrievedAt: memory.last_retrieved_at ?? null,
        verifiedAt: memory.verified_at ?? null,
        stale: memory.stale_candidate === true,
        author: memory.author?.agent ?? memory.author?.app ?? null,
        authorAgent: memory.author?.agent ?? null,
    }
}

/** Pesos da fusão da busca nas configurações do Engramind (padrão 1/1/60). */
export function searchFusionOf(setting: (key: string) => unknown): SearchFusion {
    const number = (key: string, fallback: number) => {
        const value = setting(key)
        return typeof value === "number" && value >= 0 ? value : fallback
    }
    return { vectorWeight: number("search.vector_weight", DEFAULT_SEARCH_FUSION.vectorWeight), textWeight: number("search.text_weight", DEFAULT_SEARCH_FUSION.textWeight), k: number("search.rrf_k", DEFAULT_SEARCH_FUSION.k) }
}

export function firstSentence(text: string): string {
    const flat = text.replace(/\s+/g, " ").trim()
    const match = /^(.{1,140}?[.!?])(\s|$)/.exec(flat)
    return match ? match[1] : flat.length > 140 ? `${flat.slice(0, 137)}…` : flat
}

/** Pesos da fusão da busca em `get_consumer_settings` (modo app). */
export function consumerSearchFusion(consumer: ConsumerSettings | undefined): SearchFusion {
    const search = consumer?.search
    const number = (value: unknown, fallback: number) => (typeof value === "number" && value >= 0 ? value : fallback)
    return { vectorWeight: number(search?.vector_weight, DEFAULT_SEARCH_FUSION.vectorWeight), textWeight: number(search?.text_weight, DEFAULT_SEARCH_FUSION.textWeight), k: number(search?.rrf_k, DEFAULT_SEARCH_FUSION.k) }
}

/** Prazo de desuso: o fixado pelo app, o do Engramind (gestor: `settings`; app: `consumer-settings`) ou 90. */
export function resolveStaleAfterDays(fixed: number | undefined, fromEngramind: unknown): number {
    if (typeof fixed === "number" && fixed > 0) return fixed
    return typeof fromEngramind === "number" && fromEngramind > 0 ? fromEngramind : DEFAULT_STALE_AFTER_DAYS
}

/** Slug do app do token (modo app): o fixado no provider ou o de `whoami`. */
export function useOwnApp(): { slug: string | null; isLoading: boolean; error: unknown } {
    const config = useEngramindConfig()
    const whoami = useEngramindQuery<WhoAmI>("whoami", undefined, { enabled: config.mode === "app" && !config.app })
    return { slug: config.app ?? whoami.data?.app.slug ?? null, isLoading: !config.app && whoami.isLoading, error: config.app ? null : whoami.error }
}

export function useEngramindNetwork() {
    const config = useEngramindConfig()
    const manager = config.mode === "manager"
    const own = useOwnApp()
    const channels = useEngramindList<EngramindChannel>("channels", "channels", { include_archived: true }, { all: true })
    const apps = useEngramindList<EngramindApp>("apps", "apps", {}, { all: true, enabled: manager })
    const agents = useEngramindList<EngramindAgent>("agents", "agents", manager ? {} : { app: own.slug }, { all: true, enabled: manager || own.slug !== null })
    const subscriptions = useEngramindList<EngramindSubscription>("subscriptions", "subscriptions", {}, { all: true })
    const memories = useEngramindList<EngramindMemory>("memories", "memories", { status: ALL_STATUSES }, { all: true })
    const settings = useEngramindQuery<{ settings: SettingMeta[] }>("settings", undefined, { enabled: manager })
    const consumer = useEngramindQuery<ConsumerSettings>(manager ? null : "consumer-settings")
    const categoryList = useEngramindQuery<{ categories: Category[] }>(manager ? null : "categories")

    const setting = (key: string) => settings.data?.settings?.find((meta) => meta.key === key)?.value
    const staleDays = manager ? setting(STALE_AFTER_DAYS_KEY) : consumer.data?.consolidation?.stale_after_days
    const maxBatch = manager ? setting("limits.max_batch") : consumer.data?.limits?.max_batch
    const categoriesSetting = (manager ? setting("categories.list") : categoryList.data?.categories) as Category[] | undefined
    const categories = useMemo(() => categoriesSetting ?? [], [categoriesSetting])
    const textMin = manager ? setting("memory.text_min") : consumer.data?.memory?.text_min
    const textMax = manager ? setting("memory.text_max") : consumer.data?.memory?.text_max
    const limits = typeof textMin === "number" && typeof textMax === "number" ? { textMin, textMax } : undefined

    const data = useMemo(() => {
        const qualifiedById = new Map(agents.items.map((agent) => [agent.id, agent.qualified_slug]))
        const networkAgents: NetworkAgent[] = agents.items.filter((agent) => !agent.disabled_at).map((agent) => ({ id: agent.qualified_slug, app: agent.app.slug, name: agentDisplayName(agent.name) }))
        const networkChannels: NetworkChannel[] = channels.items.map((channel) => ({ slug: channel.slug, name: channel.name, archived: Boolean(channel.archived_at) }))
        const subscriptionInputs: SubscriptionInput[] = subscriptions.items.map((subscription) => ({
            id: subscription.id,
            agent: subscription.agent.qualified_slug ?? qualifiedById.get(subscription.agent.id) ?? subscription.agent.slug,
            target: subscription.target,
            isPrefix: subscription.is_prefix,
            mode: subscription.mode,
            reaches: subscription.reaches ?? [],
        }))
        // Nome de todos os agentes (inclusive os desligados): chip do autor no card da memória.
        const agentNames = new Map(agents.items.map((agent) => [agent.qualified_slug, agentDisplayName(agent.name)]))
        return { agents: networkAgents, agentNames, channels: networkChannels, subscriptions: subscriptionInputs, memories: memories.items.map(toNetworkMemory) }
    }, [agents.items, channels.items, subscriptions.items, memories.items])

    // Referências estáveis enquanto os dados não mudam (o layout e os nodes da rede derivam delas).
    const activeApps = useMemo(
        () => (manager ? apps.items.filter((app) => !app.disabled_at).map((app) => ({ slug: app.slug, name: app.name })) : own.slug ? [{ slug: own.slug, name: config.appName ?? own.slug }] : []),
        [manager, apps.items, own.slug, config.appName],
    )

    const queries = manager ? [channels, apps, agents, subscriptions, memories] : [channels, agents, subscriptions, memories]
    const pending = queries.some((query) => query.isLoading) || own.isLoading
    const error = queries.find((query) => query.error)?.error ?? (manager ? settings.error : (consumer.error ?? own.error)) ?? null
    // Primeira carga: espera todas as páginas. Depois dela, um refetch (que pode voltar a ter `hasNextPage`)
    // mantém a rede na tela em vez de voltar ao skeleton (OPE-157).
    const loadedOnce = useRef(false)
    const loading = pending || (!loadedOnce.current && queries.some((query) => query.hasNextPage))
    if (!loading && !error) loadedOnce.current = true
    return {
        ...data,
        apps: activeApps,
        /** App do token (modo app); `null` no gestor. */
        ownApp: manager ? null : own.slug,
        rawChannels: channels.items,
        rawAgents: agents.items,
        rawMemories: memories.items,
        categories,
        limits,
        maxBatch: typeof maxBatch === "number" ? maxBatch : null,
        searchFusion: manager ? searchFusionOf(setting) : consumerSearchFusion(consumer.data),
        staleAfterDays: resolveStaleAfterDays(config.staleAfterDays, staleDays),
        memoriesUpdatedAt: memories.dataUpdatedAt,
        /** Lista de canais sendo relida (canal recém-criado ainda não chegou). */
        channelsFetching: channels.isFetching,
        isLoading: loading && !error,
        error: error as unknown,
        refetch: () => {
            for (const query of queries) void query.refetch()
            if (manager) void settings.refetch()
            else {
                void consumer.refetch()
                void categoryList.refetch()
            }
        },
    }
}
