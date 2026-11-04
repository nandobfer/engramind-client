/** Tipos da rede "universo de partículas" do Engramind (OPE-109), independentes da origem dos dados. */

export type MemoryStatus = "active" | "permanent" | "archived"

export interface NetworkMemory {
    id: string
    channel: string
    title: string
    text: string
    category: string
    status: MemoryStatus
    version: number
    createdAt: string
    updatedAt: string
    /** `retrieval_count` do Engramind (buscas). */
    retrievals: number
    /** `injected_count` do Engramind (entradas no contexto). */
    injections: number
    lastRetrievedAt: string | null
    verifiedAt: string | null
    /** `stale_candidate`: candidata a esquecimento pelo consolidador. */
    stale: boolean
    author: string | null
    /** Agente autor (`app/agente`, `author.agent` do Engramind); `null` = gravada sem agente (dono, Mentor, app). */
    authorAgent?: string | null
    /** Memória escrita pelo dono (listas dos agentes em `/integracoes/ia`). */
    fromOwner?: boolean
    /** Quem gravou, quando não foi o dono (Mentor, agente): o selo de origem da antiga lista. */
    originLabel?: string
}

export interface NetworkAgent {
    /** `app/agente`. */
    id: string
    app: string
    /** Nome sem o prefixo "Agente". */
    name: string
}

export interface NetworkChannel {
    slug: string
    name: string
    archived: boolean
}

export type SubscriptionMode = "inject" | "search" | "manage"

export interface NetworkLink {
    id: string
    agent: string
    channel: string
    mode: SubscriptionMode
}

/** Consumo agrupado por `consumption` (webhook `memory.consumed`): só ids e slugs. */
export type { ConsumptionEvent } from "../../../core/events"

export type UniverseRef = { kind: "channel"; slug: string } | { kind: "agent"; id: string }
