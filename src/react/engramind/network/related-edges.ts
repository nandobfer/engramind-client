import type { UniverseLayoutConfig } from "../../../core/universe-layout"
import type { NetworkMemory } from "./types"

/**
 * Arestas entre memórias similares (OPE-164), puras. O app entrega as similares de cada memória
 * (`RelatedMap`, id → `{ id, score }[]`); a lib escolhe as que valem no universo e monta um traço por par.
 */

/** Uma similar: o id e a nota (0 a 1; cosseno ou termos, conforme o app calculou). */
export interface RelatedHit {
    id: string
    score: number
}

/** Similares de cada memória, pelo id. */
export type RelatedMap = ReadonlyMap<string, readonly RelatedHit[]>

/** Memória como as arestas a enxergam: o id e, quando conhecidos, o status e o canal. */
export type RelatedMemory = Pick<NetworkMemory, "id"> & Partial<Pick<NetworkMemory, "status" | "channel">>

/** Um par de similares: `source` é a origem (o lado com a nota maior; no empate, o menor id). */
export interface RelatedPair {
    /** `related:<menor id>|<maior id>`. */
    id: string
    source: string
    target: string
    score: number
}

const eligible = (memory: RelatedMemory) => memory.status !== "archived"

/**
 * Pares de similares do universo: cada memória ativa ou fixada se liga a até `max` similares (pela nota,
 * desempate pelo id) que estão no universo, ativas ou fixadas e no mesmo canal — o `similar` do Engramind
 * é sempre do mesmo canal (decisão do dono na OPE-164); uma referência antiga a outro canal (memória
 * movida) é descartada. A própria memória e a similar ausente também; a próxima candidata entra no lugar.
 * A → B e B → A viram um traço só, com a maior nota.
 */
export function relatedPairs(memories: readonly RelatedMemory[], related: RelatedMap | null | undefined, max: number): RelatedPair[] {
    if (!related || max <= 0) return []
    const byId = new Map(memories.filter(eligible).map((memory) => [memory.id, memory]))
    const directed = new Map<string, number>()
    for (const memory of [...byId.values()].sort((a, b) => a.id.localeCompare(b.id))) {
        const candidates = (related.get(memory.id) ?? [])
            .filter((hit) => {
                const other = byId.get(hit.id)
                if (!other || hit.id === memory.id || !Number.isFinite(hit.score)) return false
                return !memory.channel || !other.channel || memory.channel === other.channel
            })
            .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
        const seen = new Set<string>()
        for (const hit of candidates) {
            if (seen.has(hit.id)) continue
            seen.add(hit.id)
            directed.set(`${memory.id}\u0000${hit.id}`, hit.score)
            if (seen.size >= max) break
        }
    }
    const pairs = new Map<string, RelatedPair>()
    for (const [key, score] of directed) {
        const [from, to] = key.split("\u0000") as [string, string]
        const [low, high] = from < to ? [from, to] : [to, from]
        const id = `related:${low}|${high}`
        if (pairs.has(id)) continue
        const back = directed.get(`${to}\u0000${from}`)
        const best = Math.max(score, back ?? Number.NEGATIVE_INFINITY)
        const source = back === undefined || score > back ? from : back > score ? to : low
        pairs.set(id, { id, source, target: source === from ? to : from, score: best })
    }
    return [...pairs.values()].sort((a, b) => a.id.localeCompare(b.id))
}

/** Traço de uma aresta: a nota normalizada entre a menor e a maior do universo (uma nota só: o meio). */
export function relatedEdgeStyle(score: number, range: { min: number; max: number }): { width: number; opacity: number } {
    const t = range.max > range.min ? Math.min(1, Math.max(0, (score - range.min) / (range.max - range.min))) : 0.5
    return { width: Math.round((0.75 + 1.75 * t) * 100) / 100, opacity: Math.round((0.2 + 0.45 * t) * 100) / 100 }
}

/** Menor e maior nota dos pares. */
export function relatedScoreRange(pairs: readonly Pick<RelatedPair, "score">[]): { min: number; max: number } {
    if (!pairs.length) return { min: 0, max: 0 }
    return { min: Math.min(...pairs.map((pair) => pair.score)), max: Math.max(...pairs.map((pair) => pair.score)) }
}

/**
 * Link da memória ao centro: `authored` (destacado), `normal` ou nenhum (`null`).
 * - `links = center`: toda memória tem link; o destaque só com `authorLinks` e a memória escrita pelo agente do centro.
 * - `links = related`: só o destacado (com `authorLinks`); no universo do canal não há autor no centro, nenhum link.
 */
export function centerLinkKind(
    memory: Pick<NetworkMemory, "authorAgent">,
    center: { kind: "channel" | "agent"; id: string },
    config: Pick<UniverseLayoutConfig, "links" | "authorLinks">,
): "authored" | "normal" | null {
    const authored = config.authorLinks && center.kind === "agent" && Boolean(memory.authorAgent) && memory.authorAgent === center.id
    if (authored) return "authored"
    return config.links === "related" ? null : "normal"
}
