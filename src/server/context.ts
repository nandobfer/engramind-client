import { isConsumedEvent, type WebhookEvent } from "../core/events"
import type { ContextView } from "../core/types"
import type { EngramindClient } from "./client"

/**
 * Contexto das memórias por agente (`get_context`) com cache por `version` (`If-None-Match` → `304`).
 * Os eventos `memory.*`, `channel.updated` e `subscription.updated` marcam os canais como sujos;
 * **`memory.consumed` não** (só avisa que memórias foram entregues). Se o Engramind cair, devolve o
 * último bloco (`stale: true`). Guarde o bloco na parte estável do prompt.
 */

export interface ContextEntry {
    content: string
    version: string
    counts: ContextView["counts"]
    format: string
    fetchedAt: number
    dirty: boolean
}

/** Onde o bloco fica (padrão: memória do processo). Troque por Redis/banco para várias instâncias. */
export interface ContextStore {
    get(key: string): ContextEntry | null | Promise<ContextEntry | null>
    set(key: string, entry: ContextEntry): void | Promise<void>
    /** Chaves guardadas (para marcar os canais sujos). */
    keys(): string[] | Promise<string[]>
}

export function createMemoryContextStore(): ContextStore {
    const map = new Map<string, ContextEntry>()
    return { get: (key) => map.get(key) ?? null, set: (key, entry) => void map.set(key, entry), keys: () => [...map.keys()] }
}

export interface ContextResult {
    block: string
    version: string | null
    /** `live` (lido agora ou `304`), `cache` (Engramind indisponível: último bloco) ou `none`. */
    source: "live" | "cache" | "none"
    stale: boolean
    counts: ContextView["counts"] | null
    error: string | null
}

export interface ContextCacheOptions {
    /** Cliente com o token **do agente** (o contexto é o do agente). */
    client: (agent: string) => EngramindClient | null | Promise<EngramindClient | null>
    store?: ContextStore
    format?: string
    /**
     * `always` (padrão): toda chamada revalida com `If-None-Match` (o `304` custa poucos bytes).
     * `on-dirty`: só chama o Engramind quando um evento sujou um canal do bloco ou depois de `maxAgeMs`.
     */
    revalidate?: "always" | "on-dirty"
    maxAgeMs?: number
    onError?: (error: unknown, agent: string) => void
}

const SEP = "\u0000"
export const contextKey = (agent: string, channels: readonly string[], format: string) => [agent, [...channels].sort().join(","), format].join(SEP)
const channelsOfKey = (key: string) => (key.split(SEP)[1] ?? "").split(",").filter(Boolean)

/** O evento muda o contexto do canal? (`memory.consumed` não muda.) */
export function invalidatesContext(event: Pick<WebhookEvent, "type">): boolean {
    if (isConsumedEvent(event.type)) return false
    return event.type.startsWith("memory.") || event.type === "channel.updated" || event.type === "subscription.updated" || event.type === "settings.updated"
}

export function createContextCache(options: ContextCacheOptions) {
    const store = options.store ?? createMemoryContextStore()
    const format = options.format ?? "tagged"
    const maxAge = options.maxAgeMs ?? 5 * 60_000
    /** Canais sujos sem bloco guardado por inteiro (prefixos, `settings.updated` global): suja tudo. */
    let allDirty = false

    async function markChannels(channels: readonly (string | null)[]) {
        const wanted = channels.filter((channel): channel is string => Boolean(channel))
        for (const key of await store.keys()) {
            const keyChannels = channelsOfKey(key)
            const hit = !wanted.length || !keyChannels.length || wanted.some((channel) => keyChannels.includes(channel))
            if (!hit) continue
            const entry = await store.get(key)
            if (entry && !entry.dirty) await store.set(key, { ...entry, dirty: true })
        }
    }

    return {
        /** Webhook recebido: suja o contexto dos canais afetados (nunca por `memory.consumed`). */
        handleEvent(event: Pick<WebhookEvent, "type" | "channel">) {
            if (!invalidatesContext(event)) return
            if (!event.channel) allDirty = true
            void markChannels(event.channel ? [event.channel] : [])
        },
        async getContext(agent: string, input: { channels?: readonly string[]; focus?: string } = {}): Promise<ContextResult> {
            const channels = input.channels ?? []
            const key = contextKey(agent, channels, format)
            const cached = await store.get(key)
            const usable = cached && !input.focus
            if (usable && options.revalidate === "on-dirty" && !cached.dirty && !allDirty && Date.now() - cached.fetchedAt < maxAge) {
                return { block: cached.content, version: cached.version, source: "live", stale: false, counts: cached.counts, error: null }
            }
            try {
                const client = await options.client(agent)
                if (!client) throw new Error(`token do agente ${agent} indisponível`)
                const view = await client.context({ channels: channels.length ? [...channels] : undefined, format, focus: input.focus, ifNoneMatch: usable ? cached.version : null })
                allDirty = false
                if (view === null && cached) {
                    await store.set(key, { ...cached, fetchedAt: Date.now(), dirty: false })
                    return { block: cached.content, version: cached.version, source: "live", stale: false, counts: cached.counts, error: null }
                }
                if (!view) throw new Error("o Engramind respondeu sem o contexto")
                const entry: ContextEntry = { content: typeof view.content === "string" ? view.content : "", version: view.version ?? "", counts: view.counts, format, fetchedAt: Date.now(), dirty: false }
                // Bloco com foco tem outra `version`: não substitui o cache do bloco estável.
                if (!input.focus) await store.set(key, entry)
                return { block: entry.content, version: entry.version, source: "live", stale: false, counts: entry.counts, error: null }
            } catch (error) {
                options.onError?.(error, agent)
                const reason = error instanceof Error ? error.message : String(error)
                if (cached) return { block: cached.content, version: cached.version, source: "cache", stale: true, counts: cached.counts, error: reason }
                return { block: "", version: null, source: "none", stale: true, counts: null, error: reason }
            }
        },
        /** Bloco guardado (sem chamar o Engramind). */
        peek: async (agent: string, channels: readonly string[] = []) => store.get(contextKey(agent, channels, format)),
    }
}

export type ContextCache = ReturnType<typeof createContextCache>
