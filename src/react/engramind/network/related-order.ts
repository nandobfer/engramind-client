import type { RelatedPair } from "./related-edges"

/**
 * Ordem do universo com similares (OPE-164), pura: as vagas (raio, ângulo-base, passo) continuam as do
 * critério; só se troca QUEM ocupa cada vaga dentro de uma faixa (anel, arco do canal no anel ou faixa da
 * espiral), para as similares ficarem lado a lado e, entre faixas, em ângulos próximos. Sem par nem
 * âncora, a faixa fica intocada (a ordem de hoje). Determinístico, sem `Math.random()`.
 */

/** Uma faixa: os índices das vagas (na ordem do critério) e o ângulo a partir do qual elas se ordenam. */
export interface LayoutBand {
    indices: number[]
    base: number
}

const TWO_PI = 2 * Math.PI
const norm = (angle: number) => ((angle % TWO_PI) + TWO_PI) % TWO_PI
const circularDistance = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))
/** Peso de quem não tem âncora no giro da faixa: só desempata para a ordem ficar perto da original. */
const LOOSE_WEIGHT = 0.01

function circularMean(angles: readonly number[]): number {
    const x = angles.reduce((sum, angle) => sum + Math.cos(angle), 0)
    const y = angles.reduce((sum, angle) => sum + Math.sin(angle), 0)
    return Math.atan2(y, x)
}

/**
 * Ids por vaga (o mesmo tamanho e índices de `targets`) depois da reordenação. As faixas são processadas na
 * ordem recebida (de dentro para fora): a âncora de uma memória é o ângulo da similar mais forte já
 * posicionada numa faixa anterior.
 */
export function orderBySimilarity(targets: readonly { id: string; angle: number }[], bands: readonly LayoutBand[], pairs: readonly Pick<RelatedPair, "source" | "target" | "score">[]): string[] {
    const ids = targets.map((target) => target.id)
    if (!pairs.length) return ids
    const weights = new Map<string, Map<string, number>>()
    const link = (a: string, b: string, score: number) => {
        const row = weights.get(a) ?? new Map<string, number>()
        row.set(b, Math.max(score, row.get(b) ?? Number.NEGATIVE_INFINITY))
        weights.set(a, row)
    }
    for (const pair of pairs) {
        link(pair.source, pair.target, pair.score)
        link(pair.target, pair.source, pair.score)
    }
    const placed = new Map<string, number>()
    const settle = (band: LayoutBand) => {
        for (const index of band.indices) placed.set(ids[index]!, targets[index]!.angle)
    }
    for (const band of bands) {
        const original = band.indices.map((index) => ids[index]!)
        const rank = new Map(original.map((id, position) => [id, position]))
        const originalAngle = new Map(band.indices.map((index) => [ids[index]!, targets[index]!.angle]))
        const anchors = new Map<string, number>()
        for (const id of original) {
            let best: string | null = null
            let bestWeight = Number.NEGATIVE_INFINITY
            for (const [other, weight] of weights.get(id) ?? []) {
                if (!placed.has(other)) continue
                if (weight > bestWeight || (weight === bestWeight && best !== null && other < best)) {
                    best = other
                    bestWeight = weight
                }
            }
            if (best !== null) anchors.set(id, placed.get(best)!)
        }
        const hasPair = original.some((id) => [...(weights.get(id)?.keys() ?? [])].some((other) => rank.has(other)))
        if (original.length < 2 || (!hasPair && anchors.size === 0)) {
            settle(band)
            continue
        }
        const used = new Set<string>()
        const nextOf = (from: string): string | null => {
            let best: string | null = null
            let bestWeight = Number.NEGATIVE_INFINITY
            for (const [other, weight] of weights.get(from) ?? []) {
                if (!rank.has(other) || used.has(other)) continue
                if (weight > bestWeight || (weight === bestWeight && best !== null && rank.get(other)! < rank.get(best)!)) {
                    best = other
                    bestWeight = weight
                }
            }
            return best
        }
        const chains: string[][] = []
        for (const id of original) {
            if (used.has(id)) continue
            const chain = [id]
            used.add(id)
            for (let next = nextOf(chain[chain.length - 1]!); next !== null; next = nextOf(chain[chain.length - 1]!)) {
                chain.push(next)
                used.add(next)
            }
            for (let next = nextOf(chain[0]!); next !== null; next = nextOf(chain[0]!)) {
                chain.unshift(next)
                used.add(next)
            }
            chains.push(chain)
        }
        const firstRank = (chain: readonly string[]) => Math.min(...chain.map((id) => rank.get(id)!))
        const keyOf = (chain: readonly string[]) => {
            const anchored = chain.filter((id) => anchors.has(id)).map((id) => anchors.get(id)!)
            return anchored.length ? circularMean(anchored) : originalAngle.get(original[firstRank(chain)]!)!
        }
        const keyed = chains.map((chain) => ({ chain, key: norm(keyOf(chain) - band.base), first: firstRank(chain) }))
        keyed.sort((a, b) => a.key - b.key || a.first - b.first)
        const sequence = keyed.flatMap((entry) => entry.chain)
        const slots = [...band.indices].sort((a, b) => norm(targets[a]!.angle - band.base) - norm(targets[b]!.angle - band.base) || a - b)
        const slotAngles = slots.map((index) => targets[index]!.angle)
        const size = sequence.length
        let bestShift = 0
        let bestCost = Number.POSITIVE_INFINITY
        for (let shift = 0; shift < size; shift += 1) {
            let cost = 0
            sequence.forEach((id, position) => {
                const anchor = anchors.get(id)
                const angle = slotAngles[(position + shift) % size]!
                cost += anchor === undefined ? LOOSE_WEIGHT * circularDistance(angle, originalAngle.get(id)!) : circularDistance(angle, anchor)
            })
            if (cost < bestCost - 1e-9) {
                bestCost = cost
                bestShift = shift
            }
        }
        sequence.forEach((id, position) => {
            ids[slots[(position + bestShift) % size]!] = id
        })
        settle(band)
    }
    return ids
}
