/**
 * Eventos do Engramind (webhook) e o formato que a lib repassa ao navegador pelo SSE: só ids, slugs e
 * tipos — nunca texto, título, `query` ou segredo.
 */

export type WebhookEventType =
    | "memory.created"
    | "memory.updated"
    | "memory.archived"
    | "memory.deleted"
    | "memory.consumed"
    | "channel.updated"
    | "subscription.updated"
    | "settings.updated"
    | "identities.updated"

/** Corpo do webhook (`POST <webhook_url>`), contrato do Engramind ≥ 0.12.0. */
export interface WebhookEvent {
    id: string
    type: WebhookEventType | (string & {})
    channel: string | null
    channel_version?: number | null
    memory_ids?: string[]
    at?: string
    keys?: string[]
    subscription?: string
    agent?: string | null
    target?: string
    app?: string | null
    consumption?: string
    operation?: "get_context" | "search_memories" | "get_hints" | "get_memory" | (string & {})
    title_ids?: string[]
    context_version?: string
}

/** Evento ao vivo entregue pelo SSE da lib (`event: engramind`). */
export interface LiveEvent {
    /** `id` do webhook (ausente nos eventos gerados pelo próprio app). */
    id?: string
    type: string
    channel?: string | null
    memoryIds?: string[]
    keys?: string[]
    agent?: string | null
    app?: string | null
    consumption?: string
    operation?: string
    titleIds?: string[]
    contextVersion?: string
    at?: string
}

const ids = (value: unknown): string[] | undefined => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined)
const str = (value: unknown): string | undefined => (typeof value === "string" && value ? value : undefined)

/** Webhook → evento ao vivo (só os campos permitidos). */
export function toLiveEvent(event: WebhookEvent): LiveEvent {
    const live: LiveEvent = { id: event.id, type: event.type, channel: event.channel ?? null }
    const memoryIds = ids(event.memory_ids)
    if (memoryIds) live.memoryIds = memoryIds
    const keys = ids(event.keys)
    if (keys) live.keys = keys
    if (event.agent !== undefined) live.agent = event.agent ?? null
    if (event.app !== undefined) live.app = event.app ?? null
    const consumption = str(event.consumption)
    if (consumption) live.consumption = consumption
    const operation = str(event.operation)
    if (operation) live.operation = operation
    const titleIds = ids(event.title_ids)
    if (titleIds) live.titleIds = titleIds
    const contextVersion = str(event.context_version)
    if (contextVersion) live.contextVersion = contextVersion
    const at = str(event.at)
    if (at) live.at = at
    return live
}

/** `memory.consumed` não muda nada: nunca marca o contexto como sujo nem invalida as listas. */
export const isConsumedEvent = (type: string) => type === "memory.consumed"

/** Eventos `memory.*` que mudam o contexto (todos menos `memory.consumed`). */
export const isMemoryChange = (type: string) => type.startsWith("memory.") && !isConsumedEvent(type)

/**
 * Consumo agrupado (um por `consumption`): o formato que a rede anima. `channels` são os canais que
 * entregaram memórias (um evento por canal), `delivered` idem.
 */
export interface ConsumptionEvent {
    /** Agente que leu (`app/agente`). */
    agent: string
    kind: "context" | "search"
    channels: string[]
    delivered: string[]
    memoryIds: string[]
    titleIds?: string[]
    version?: string
    /** Id do consumo no Engramind (`cns_…`). */
    consumption?: string
    operation?: string
}

/** Junta os eventos `memory.consumed` de uma mesma leitura (`consumption`). */
export function mergeConsumption(events: readonly LiveEvent[]): ConsumptionEvent | null {
    const first = events.find((event) => event.agent)
    if (!first?.agent) return null
    const channels = new Set<string>()
    const memoryIds = new Set<string>()
    const titleIds = new Set<string>()
    let version: string | undefined
    for (const event of events) {
        if (event.channel && (event.memoryIds?.length ?? 0) > 0) channels.add(event.channel)
        for (const id of event.memoryIds ?? []) memoryIds.add(id)
        for (const id of event.titleIds ?? []) titleIds.add(id)
        version = version ?? event.contextVersion
    }
    if (!memoryIds.size) return null
    const merged: ConsumptionEvent = {
        agent: first.agent,
        kind: first.operation === "get_context" ? "context" : "search",
        channels: [...channels],
        delivered: [...channels],
        memoryIds: [...memoryIds],
        ...(titleIds.size ? { titleIds: [...titleIds] } : {}),
        ...(version ? { version } : {}),
        ...(first.consumption ? { consumption: first.consumption } : {}),
        ...(first.operation ? { operation: first.operation } : {}),
    }
    return merged
}

export interface ConsumptionGrouperOptions {
    /** Espera para juntar os eventos de canais da mesma leitura (padrão 400 ms). */
    windowMs?: number
    /** Quantos `consumption` já emitidos são lembrados para descartar repetições (padrão 500). */
    memory?: number
    onGroup: (event: ConsumptionEvent) => void
}

/**
 * Agrupa `memory.consumed` por `consumption`: emite **um** consumo por leitura, depois de `windowMs` sem
 * novos canais. Evento sem `agent` (leitura por token de app ou admin) é ignorado, e um `consumption` já
 * emitido não é emitido de novo (retentativa do webhook). Isomórfico (servidor e navegador).
 */
export function createConsumptionGrouper(options: ConsumptionGrouperOptions) {
    const windowMs = options.windowMs ?? 400
    const limit = options.memory ?? 500
    const pending = new Map<string, { events: LiveEvent[]; timer: ReturnType<typeof setTimeout> }>()
    const done: string[] = []
    const doneSet = new Set<string>()
    const flush = (key: string) => {
        const entry = pending.get(key)
        if (!entry) return
        pending.delete(key)
        doneSet.add(key)
        done.push(key)
        while (done.length > limit) doneSet.delete(done.shift()!)
        const merged = mergeConsumption(entry.events)
        if (merged) options.onGroup(merged)
    }
    return {
        push(event: LiveEvent) {
            if (!isConsumedEvent(event.type) || !event.agent) return
            const key = event.consumption ?? event.id ?? `${event.agent}:${event.at ?? ""}`
            if (doneSet.has(key)) return
            const entry = pending.get(key)
            if (entry) {
                clearTimeout(entry.timer)
                entry.events.push(event)
                entry.timer = setTimeout(() => flush(key), windowMs)
            } else pending.set(key, { events: [event], timer: setTimeout(() => flush(key), windowMs) })
        },
        /** Emite os grupos pendentes na hora (desmontagem, testes). */
        flushAll() {
            for (const key of [...pending.keys()]) {
                clearTimeout(pending.get(key)!.timer)
                flush(key)
            }
        },
        dispose() {
            for (const entry of pending.values()) clearTimeout(entry.timer)
            pending.clear()
        },
    }
}
