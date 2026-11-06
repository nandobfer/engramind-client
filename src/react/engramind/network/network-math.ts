import { DEFAULT_UNIVERSE_LAYOUT, type UniverseLayoutConfig } from "../../../core/universe-layout"
import type { MemoryStatus, NetworkChannel, NetworkLink, NetworkMemory, SubscriptionMode } from "./types"

/**
 * Cálculos puros da rede "universo de partículas" do Engramind (OPE-109, OPE-114): cor pelo canal,
 * distância do centro pela idade, tamanho pelo uso, brilho pelo prazo do consolidador, cor estável dos
 * canais, links das assinaturas e layout.
 * Cores só por tokens do tema (`color-mix` sobre variáveis CSS), nunca valores fixos.
 */

const DAY_MS = 24 * 3600 * 1000
export const PARTICLE_MIN_PX = DEFAULT_UNIVERSE_LAYOUT.particleMinPx
export const PARTICLE_MAX_PX = DEFAULT_UNIVERSE_LAYOUT.particleMaxPx
/** Fixada nunca some: brilho mínimo visível. */
export const PINNED_MIN_BRIGHTNESS = 0.25
/** Padrão do Engramind para `consolidation.stale_after_days` (quando a configuração não vem). */
export const DEFAULT_STALE_AFTER_DAYS = 90

const time = (iso: string | null | undefined): number => {
    if (!iso) return Number.NaN
    return new Date(iso).getTime()
}

/** "Agente Opex" → "Opex" (os nodes mostram o nome sem o prefixo). */
export function agentDisplayName(name: string): string {
    const stripped = name.replace(/^\s*agente\s+/i, "").trim()
    return stripped || name.trim()
}

/** Relevância: consultas + injeções somadas. */
export const memoryUses = (memory: Pick<NetworkMemory, "retrievals" | "injections">): number => Math.max(0, memory.retrievals) + Math.max(0, memory.injections)

/**
 * Último uso: o maior entre a última recuperação no Engramind (`last_retrieved_at`) e a criação. A verificação
 * do consolidador (`verified_at`) não é consumo e não conta.
 */
export function lastUseOf(memory: Pick<NetworkMemory, "id" | "lastRetrievedAt" | "createdAt">): string {
    const candidates = [memory.lastRetrievedAt, memory.createdAt].filter((value): value is string => Boolean(value) && !Number.isNaN(time(value)))
    return candidates.reduce((best, value) => (time(value) > time(best) ? value : best), memory.createdAt)
}

/** Data de uso real (sem cair na criação): `null` = "nunca usada". */
export function lastRealUseOf(memory: Pick<NetworkMemory, "id" | "lastRetrievedAt">): string | null {
    const candidates = [memory.lastRetrievedAt].filter((value): value is string => Boolean(value) && !Number.isNaN(time(value)))
    if (!candidates.length) return null
    return candidates.reduce((best, value) => (time(value) > time(best) ? value : best))
}

/** Tamanho pela soma de consultas e injeções, em escala logarítmica suave relativa ao universo (`range`: a faixa em px, padrão 10–34). */
export function particleSize(uses: number, maxUses: number, range: { min: number; max: number } = { min: PARTICLE_MIN_PX, max: PARTICLE_MAX_PX }): number {
    if (maxUses <= 0 || uses <= 0) return range.min
    const ratio = Math.log1p(uses) / Math.log1p(maxUses)
    return Math.round((range.min + (range.max - range.min) * clamp01(ratio)) * 10) / 10
}

/**
 * Brilho de 1 (usada agora) a 0 (cinza), linear até o prazo `stale_after_days` do consolidador.
 * Candidata a esquecimento → 0; inativa → 0; fixada nunca fica abaixo do mínimo visível.
 */
export function particleBrightness(input: { status: MemoryStatus; stale: boolean; lastUse: string }, staleAfterDays: number, now: number = Date.now()): number {
    if (input.status === "archived") return 0
    const days = Math.max(0, (now - time(input.lastUse)) / DAY_MS)
    const limit = staleAfterDays > 0 ? staleAfterDays : DEFAULT_STALE_AFTER_DAYS
    let value = Number.isNaN(days) ? 0 : clamp01(1 - days / limit)
    if (input.stale) value = 0
    if (input.status === "permanent") value = Math.max(value, PINNED_MIN_BRIGHTNESS)
    return Math.round(value * 1000) / 1000
}

/** Cor final da partícula: a cor do canal apagada em direção ao cinza conforme perde brilho. */
export function particleColor(base: string, brightness: number): string {
    const pct = Math.round(clamp01(brightness) * 100)
    return `color-mix(in oklch, ${base} ${pct}%, var(--color-muted-foreground))`
}

/** Paleta dos canais: `--chart-2..6` (o `--chart-1` é o roxo primário, reservado ao canal em destaque). */
const CHANNEL_TOKENS = 5
/** Cor do canal com mais memórias do universo (e de todo universo de um canal só). */
export const PRIMARY_CHANNEL_COLOR = "var(--color-primary)"
/** Tom de cada rodada: o token puro, depois misturado com o claro (foreground) e com o escuro (background). */
const TONES = ["", "var(--color-foreground)", "var(--color-background)"] as const

export function stableHash(text: string): number {
    let hash = 2166136261
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index)
        hash = Math.imul(hash, 16777619)
    }
    return hash >>> 0
}

/**
 * Token `--chart-N` do tema. O shadcn/ui traz `--chart-1..5`: o `--chart-6` cai numa variação do
 * `--chart-3` quando o app não o define (sem cor fixa).
 */
export const chartToken = (index: number): string => (index <= 5 ? `var(--chart-${index})` : `var(--chart-${index}, color-mix(in oklch, var(--chart-3) 55%, var(--color-foreground)))`)

const toneOf = (base: number, round: number): string => {
    const token = chartToken(base + 2)
    const tone = TONES[round % TONES.length] ?? ""
    return tone ? `color-mix(in oklch, ${token} 70%, ${tone})` : token
}

/** Cor de um canal: a base (`--chart-2..6`) e a rodada de tom em que ela foi usada. */
interface ChannelSlot {
    base: number
    round: number
}

/**
 * Cor de cada canal, em ordem de slug: a base preferida vem do hash do slug (o mesmo canal tem sempre a
 * mesma preferência) e, se já estiver ocupada, o canal vai para a próxima base livre (sondagem circular).
 * Só quando as 5 bases da rodada estão ocupadas começa a rodada seguinte, que varia o tom (mais clara,
 * depois mais escura): cores diferentes antes de repetir a matiz, e só então variar o tom.
 */
function channelSlots(slugs: readonly string[]): Map<string, ChannelSlot> {
    const slots = new Map<string, ChannelSlot>()
    let used = new Set<number>()
    let round = 0
    for (const slug of [...new Set(slugs)].sort()) {
        if (used.size >= CHANNEL_TOKENS) {
            used = new Set()
            round += 1
        }
        const preferred = stableHash(slug) % CHANNEL_TOKENS
        let base = preferred
        for (let step = 0; step < CHANNEL_TOKENS && used.has(base); step += 1) base = (preferred + step + 1) % CHANNEL_TOKENS
        used.add(base)
        slots.set(slug, { base, round })
    }
    return slots
}

export function channelColors(slugs: readonly string[]): Map<string, string> {
    const colors = new Map<string, string>()
    for (const [slug, slot] of channelSlots(slugs)) colors.set(slug, toneOf(slot.base, slot.round))
    return colors
}

/**
 * Só as cores dos canais de um universo, a partir do mapa de TODOS os canais (`channelColors`): o canal
 * mantém a cor global. Se dois canais do universo caem na mesma matiz, o de slug maior vai, de forma
 * determinística, para uma base livre do universo (só quando as 5 bases estão ocupadas ele repete a matiz,
 * em outro tom, sem repetir a combinação).
 */
export function pickChannelColors(all: ReadonlyMap<string, string>, slugs: readonly string[]): Map<string, string> {
    const universe = [...new Set(slugs)].sort()
    const global = channelSlots([...all.keys(), ...universe])
    const occupancy = new Array<number>(CHANNEL_TOKENS).fill(0)
    const combos = new Set<string>()
    const picked = new Map<string, string>()
    for (const slug of universe) {
        const slot = global.get(slug) ?? { base: 0, round: 0 }
        let chosen = slot
        if (occupancy[slot.base] !== 0) {
            const free = Array.from({ length: CHANNEL_TOKENS }, (_, step) => (slot.base + step + 1) % CHANNEL_TOKENS).find((base) => occupancy[base] === 0)
            if (free !== undefined) chosen = { base: free, round: slot.round }
            else {
                let found: ChannelSlot | null = null
                for (let round = 1; round <= TONES.length && !found; round += 1) {
                    for (let step = 0; step < CHANNEL_TOKENS && !found; step += 1) {
                        const base = (slot.base + step) % CHANNEL_TOKENS
                        if (!combos.has(`${base}:${round % TONES.length}`)) found = { base, round }
                    }
                }
                if (found) chosen = found
            }
        }
        occupancy[chosen.base] = (occupancy[chosen.base] ?? 0) + 1
        combos.add(`${chosen.base}:${chosen.round % TONES.length}`)
        picked.set(slug, toneOf(chosen.base, chosen.round))
    }
    return picked
}

/**
 * Cores de um universo: cada canal com a sua cor estável (do mapa `base` ou do slug) e o canal com mais
 * memórias (todas, inclusive inativas; empate pelo slug, a ordem da legenda "Por canal") com o roxo
 * primário. Canais do mapa sem memórias entram com a cor estável. Sem memórias, nenhum fica roxo.
 */
export function universeChannelColors(base: ReadonlyMap<string, string> | undefined, memories: readonly Pick<NetworkMemory, "channel">[]): Map<string, string> {
    const counts = new Map<string, number>()
    for (const memory of memories) counts.set(memory.channel, (counts.get(memory.channel) ?? 0) + 1)
    const slugs = [...new Set([...(base?.keys() ?? []), ...counts.keys()])]
    const colors = new Map<string, string>()
    for (const slug of slugs) {
        const color = base?.get(slug) ?? channelColors([slug]).get(slug)
        if (color) colors.set(slug, color)
    }
    const top = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
    if (top) colors.set(top[0], PRIMARY_CHANNEL_COLOR)
    return colors
}

/**
 * Nome do canal em duas partes: o prefixo até a última `/` (linha discreta) e a ponta final (o
 * título destacado). Canais com o mesmo começo (`agentes/desenvolvedor/…`) passam a se distinguir.
 */
export function splitChannelSlug(slug: string): { prefix: string; leaf: string } {
    const trimmed = slug.replace(/\/+$/, "")
    const cut = trimmed.lastIndexOf("/")
    if (cut <= 0) return { prefix: "", leaf: trimmed || slug }
    return { prefix: trimmed.slice(0, cut + 1), leaf: trimmed.slice(cut + 1) }
}

/** O alvo da assinatura (exato ou prefixo `eng/projeto-*`) alcança o canal? */
export function subscriptionReaches(target: string, isPrefix: boolean, slug: string): boolean {
    if (!isPrefix && !target.endsWith("*")) return target === slug
    const base = target.endsWith("*") ? target.slice(0, -1) : target
    return base.length > 0 && slug.startsWith(base)
}

export interface SubscriptionInput {
    id: string
    agent: string
    target: string
    isPrefix: boolean
    mode: SubscriptionMode
    /** Canais ativos que o alvo alcança (`reaches` do Engramind). */
    reaches: readonly string[]
}

/**
 * Um link por canal casado em cada assinatura: os ativos pelo `reaches` do Engramind e, com
 * "Mostrar arquivados", os arquivados casados localmente. Só canais visíveis; prefixo sem canal não gera link.
 */
export function subscriptionLinks(subscriptions: readonly SubscriptionInput[], channels: readonly NetworkChannel[], includeArchived: boolean): NetworkLink[] {
    const visible = new Map(channels.filter((channel) => includeArchived || !channel.archived).map((channel) => [channel.slug, channel]))
    const links: NetworkLink[] = []
    const seen = new Set<string>()
    for (const subscription of subscriptions) {
        const reached = new Set(subscription.reaches)
        if (includeArchived) for (const channel of visible.values()) if (channel.archived && subscriptionReaches(subscription.target, subscription.isPrefix, channel.slug)) reached.add(channel.slug)
        for (const slug of reached) {
            if (!visible.has(slug)) continue
            const id = `${subscription.agent}→${slug}`
            if (seen.has(id)) continue
            seen.add(id)
            links.push({ id, agent: subscription.agent, channel: slug, mode: subscription.mode })
        }
    }
    return links
}

export interface Point {
    x: number
    y: number
}

export interface Rect {
    x: number
    y: number
    width: number
    height: number
}

/** Zoom mínimo do enquadramento inicial no celular: os nomes continuam legíveis. */
export const MOBILE_FIT_MIN_ZOOM = 0.5

/**
 * Enquadramento com zoom mínimo (celular): se caber o retângulo inteiro com zoom ≥ `minZoom`, devolve
 * `null` (enquadra normalmente); senão, centraliza no meio do retângulo com `minZoom` (o resto fica a
 * um arrastar). Sem tamanho medido do quadro, `null`.
 */
export function minZoomCenter(bounds: Rect, size: { width: number; height: number }, minZoom: number): { x: number; y: number; zoom: number } | null {
    if (size.width <= 0 || size.height <= 0 || bounds.width <= 0 || bounds.height <= 0) return null
    const fit = Math.min(size.width / bounds.width, size.height / bounds.height)
    if (fit >= minZoom) return null
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, zoom: minZoom }
}

/**
 * Tamanho visível do card da memória: o natural (largura fixa, altura do conteúdo) limitado ao quadro
 * menos `margin` de cada lado. Sem quadro medido, o natural.
 */
export function memoryCardSize(natural: { width: number; height: number }, canvas: { width: number; height: number }, margin = 8): { width: number; height: number } {
    const width = canvas.width > 0 ? Math.min(natural.width, Math.max(canvas.width - margin * 2, 160)) : natural.width
    const height = canvas.height > 0 ? Math.min(natural.height, Math.max(canvas.height - margin * 2, 120)) : natural.height
    return { width, height }
}

/**
 * Posição (canto superior esquerdo, em px da tela) do card que substitui a partícula: centralizado
 * sobre ela e empurrado para dentro do canvas, com `margin` de folga em todas as bordas.
 */
export function clampCardRect(anchor: Point, card: { width: number; height: number }, canvas: { width: number; height: number }, margin = 8): Point {
    const axis = (center: number, size: number, limit: number) => {
        const max = limit - size - margin
        if (max < margin) return margin
        return Math.min(Math.max(center - size / 2, margin), max)
    }
    return { x: axis(anchor.x, card.width, canvas.width), y: axis(anchor.y, card.height, canvas.height) }
}

/** Rótulo do nome no hover da partícula (D12, OPE-130): largura máxima na tela, em px. */
export const HOVER_LABEL_MAX_WIDTH = 256
/** Distância entre a partícula e o rótulo do hover. */
export const HOVER_LABEL_GAP = 6

/**
 * Posição do rótulo do hover (nome completo da memória), em coordenadas da tela do canvas: abaixo e
 * centrado na partícula; sem espaço embaixo, acima dela; na horizontal, sempre dentro do quadro (com
 * `margin`). Quadro menor que o rótulo: encosta na margem.
 */
export function clampLabelRect(anchor: Point, particle: number, label: { width: number; height: number }, canvas: { width: number; height: number }, margin = 8): Point & { placement: "below" | "above" } {
    const maxX = canvas.width - label.width - margin
    const x = maxX < margin ? margin : Math.min(Math.max(anchor.x - label.width / 2, margin), maxX)
    const below = anchor.y + particle / 2 + HOVER_LABEL_GAP
    if (below + label.height <= canvas.height - margin) return { x, y: below, placement: "below" }
    const above = anchor.y - particle / 2 - HOVER_LABEL_GAP - label.height
    if (above >= margin) return { x, y: above, placement: "above" }
    return { x, y: Math.max(margin, canvas.height - label.height - margin), placement: "below" }
}

/** Canais de um agente no universo dele: os que as assinaturas alcançam (arquivados só com `includeArchived`). */
export function agentUniverseChannels(links: readonly Pick<NetworkLink, "agent" | "channel">[], channels: readonly Pick<NetworkChannel, "slug" | "archived">[], agentId: string, includeArchived: boolean): string[] {
    const archived = new Set(channels.filter((channel) => channel.archived).map((channel) => channel.slug))
    return [...new Set(links.filter((link) => link.agent === agentId && (includeArchived || !archived.has(link.channel))).map((link) => link.channel))]
}

/**
 * Canais em que "Nova memória" do universo do agente pode gravar (D11, OPE-130): os do agente, sem os
 * arquivados, com o canal inicial primeiro — o `preferred` (se for do agente) ou o com mais memórias.
 */
export function agentCreateChannels(agentChannels: readonly string[], channels: readonly Pick<NetworkChannel, "slug" | "archived">[], memories: readonly Pick<NetworkMemory, "channel">[], preferred?: string | null): string[] {
    const archived = new Set(channels.filter((channel) => channel.archived).map((channel) => channel.slug))
    const open = agentChannels.filter((slug) => !archived.has(slug))
    if (!open.length) return []
    const count = (slug: string) => memories.filter((memory) => memory.channel === slug).length
    const first = preferred && open.includes(preferred) ? preferred : [...open].sort((a, b) => count(b) - count(a) || a.localeCompare(b))[0]!
    return [first, ...open.filter((slug) => slug !== first)]
}

/** Medidas do desenho original (anéis a partir do raio 150), que o padrão da configuração reproduz. */
export const UNIVERSE_FIRST_RADIUS = DEFAULT_UNIVERSE_LAYOUT.firstRadius
export const UNIVERSE_RING_GAP = DEFAULT_UNIVERSE_LAYOUT.ringGap
export const UNIVERSE_SLOT = DEFAULT_UNIVERSE_LAYOUT.slot
/** Distância mínima padrão entre os centros de duas partículas: o maior tamanho (34 px) mais o aumento do consumo ao vivo. */
export const UNIVERSE_MIN_DISTANCE = DEFAULT_UNIVERSE_LAYOUT.minDistance

/** Escalas do desvio tentadas em ordem; a última (0) é a posição sem desvio, que sempre cabe. */
const JITTER_SCALES = [1, 0.66, 0.33, 0] as const
/** Menor raio possível de uma partícula depois do desvio (não cruza o centro). */
const MIN_RADIUS = 8

/** Memória como o layout a enxerga: o `id` e a criação bastam; os demais campos servem aos critérios de ordem e ao agrupamento. */
export type UniverseLayoutMemory = Pick<NetworkMemory, "id" | "createdAt"> & Partial<Pick<NetworkMemory, "updatedAt" | "lastRetrievedAt" | "retrievals" | "injections" | "channel">>

/** Criação em ms; data inválida conta como a mais antiga. */
const createdTime = (memory: Pick<NetworkMemory, "createdAt">): number => {
    const value = time(memory.createdAt)
    return Number.isNaN(value) ? Number.NEGATIVE_INFINITY : value
}

const dateOrOldest = (iso: string | null | undefined): number => {
    const value = time(iso)
    return Number.isNaN(value) ? Number.NEGATIVE_INFINITY : value
}

/** Valor do critério de ordem (maior = mais nova, mais recente ou mais usada; data inválida conta como a mais antiga). */
function orderValue(memory: UniverseLayoutMemory, orderBy: UniverseLayoutConfig["orderBy"]): number {
    if (orderBy === "updated") return dateOrOldest(memory.updatedAt)
    if (orderBy === "last-use") return dateOrOldest(lastUseOf({ id: memory.id, lastRetrievedAt: memory.lastRetrievedAt ?? null, createdAt: memory.createdAt }))
    if (orderBy === "uses") return memoryUses({ retrievals: memory.retrievals ?? 0, injections: memory.injections ?? 0 })
    return createdTime(memory)
}

/** Número estável em [0, 1) derivado do id (e de um sal), sem aleatoriedade por render. */
const unitHash = (id: string, salt: string): number => stableHash(`${id}:${salt}`) / 2 ** 32

const toRadians = (degrees: number) => (degrees * Math.PI) / 180

/** Posição-base de uma partícula antes do desvio, com as escalas em que o desvio é medido. */
interface LayoutTarget {
    id: string
    radius: number
    angle: number
    /** Passo angular (rad) entre vizinhas: o desvio de ângulo é uma fração dele. */
    angleStep: number
    /** Escala do desvio de raio (px): a distância entre anéis ou entre vizinhas da espiral. */
    radialScale: number
}

const byChannel = <T extends UniverseLayoutMemory>(members: readonly T[]): T[] => [...members].sort((a, b) => (a.channel ?? "").localeCompare(b.channel ?? ""))

function ringTargets(sorted: readonly UniverseLayoutMemory[], config: UniverseLayoutConfig): LayoutTarget[] {
    const targets: LayoutTarget[] = []
    let cursor = 0
    universeRingCounts(sorted.length, config).forEach((count, ring) => {
        const slice = sorted.slice(cursor, cursor + count)
        const members = config.grouping === "channel" ? byChannel(slice) : slice
        const step = (2 * Math.PI) / members.length
        const offset = ring * toRadians(config.ringRotationDeg)
        members.forEach((memory, index) => targets.push({ id: memory.id, radius: config.firstRadius + ring * config.ringGap, angle: offset + index * step, angleStep: step, radialScale: config.ringGap }))
        cursor += count
    })
    return targets
}

/**
 * Espiral de girassol: densidade constante (≈ `spiralSpacing` entre vizinhas), o raio cresce com a
 * ordem. Com agrupamento por canal, cada canal ocupa um setor (largura proporcional às memórias).
 */
function spiralTargets(sorted: readonly UniverseLayoutMemory[], config: UniverseLayoutConfig): LayoutTarget[] {
    const spacing = config.spiralSpacing
    const turn = config.spiralAngleDeg / 360
    const targets: LayoutTarget[] = []
    const at = (id: string, index: number, span: number, start: number) => {
        const radius = Math.sqrt(config.firstRadius ** 2 + (2 * index * spacing ** 2) / span)
        const angle = span >= 2 * Math.PI ? index * toRadians(config.spiralAngleDeg) : start + 0.05 * span + 0.9 * span * ((index * turn) % 1)
        targets.push({ id, radius, angle, angleStep: spacing / radius, radialScale: spacing })
    }
    if (config.grouping !== "channel") {
        sorted.forEach((memory, index) => at(memory.id, index, 2 * Math.PI, 0))
        return targets
    }
    const groups = new Map<string, UniverseLayoutMemory[]>()
    for (const memory of sorted) groups.set(memory.channel ?? "", [...(groups.get(memory.channel ?? "") ?? []), memory])
    let start = 0
    for (const channel of [...groups.keys()].sort((a, b) => a.localeCompare(b))) {
        const members = groups.get(channel) ?? []
        const span = Math.min(2 * Math.PI, (2 * Math.PI * members.length) / sorted.length)
        members.forEach((memory, index) => at(memory.id, index, span === 2 * Math.PI ? 2 * Math.PI - 1e-9 : span, start))
        start += span
    }
    return targets
}

/**
 * Universo: posição de cada partícula em volta do centro (0,0), pela configuração (`config`; o padrão é o
 * desenho original: anéis concêntricos a partir do raio 150 com as mais novas por dentro).
 * - Ordem: `orderBy` (criação, atualização, último uso ou uso) e `order` (o maior valor por dentro ou por fora);
 *   data inválida conta como a mais antiga.
 * - Disposição: anéis (com giro por anel e distribuição proporcional às vagas) ou espiral de girassol.
 * - Desvio: ângulo e raio de cada partícula deslocados por um valor estável derivado do id e da semente
 *   (sem `Math.random()`), sem sair da faixa do anel (menos de 50 % da distância entre anéis) e, com
 *   `avoidOverlap`, reduzido até a partícula ficar a `minDistance` das outras.
 */
export function layoutUniverse(memories: readonly UniverseLayoutMemory[], config: UniverseLayoutConfig = DEFAULT_UNIVERSE_LAYOUT): Map<string, Point> {
    const values = new Map(memories.map((memory) => [memory.id, orderValue(memory, config.orderBy)]))
    const sign = config.order === "newest-inside" ? -1 : 1
    const sorted = [...memories].sort((a, b) => {
        const diff = (values.get(a.id) ?? 0) - (values.get(b.id) ?? 0)
        return (Number.isNaN(diff) ? 0 : sign * diff) || a.id.localeCompare(b.id)
    })
    const targets = config.layout === "spiral" ? spiralTargets(sorted, config) : ringTargets(sorted, config)
    const at = (radius: number, angle: number): Point => ({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius })
    const current = new Map<string, Point>(targets.map((target) => [target.id, at(target.radius, target.angle)]))
    const jitters = config.angleJitter > 0 || config.radiusJitter > 0
    if (jitters) {
        const checkOverlap = config.avoidOverlap && config.minDistance > 0
        const cell = Math.max(config.minDistance, 1)
        const cells = new Map<string, Set<string>>()
        const cellOf = (point: Point): [number, number] => [Math.floor(point.x / cell), Math.floor(point.y / cell)]
        const place = (id: string, point: Point) => {
            const old = current.get(id)
            if (old) cells.get(cellOf(old).join(":"))?.delete(id)
            current.set(id, point)
            const key = cellOf(point).join(":")
            const group = cells.get(key) ?? new Set<string>()
            group.add(id)
            cells.set(key, group)
        }
        const fits = (id: string, point: Point): boolean => {
            if (!checkOverlap) return true
            const [cx, cy] = cellOf(point)
            for (let dx = -1; dx <= 1; dx += 1) {
                for (let dy = -1; dy <= 1; dy += 1) {
                    for (const other of cells.get(`${cx + dx}:${cy + dy}`) ?? []) {
                        const near = current.get(other)
                        if (other !== id && near && Math.hypot(near.x - point.x, near.y - point.y) < config.minDistance) return false
                    }
                }
            }
            return true
        }
        for (const target of targets) place(target.id, current.get(target.id)!)
        const seeded = (name: string) => (config.jitterSeed ? `${name}:${config.jitterSeed}` : name)
        for (const target of targets) {
            const angleShift = (unitHash(target.id, seeded("angle")) * 2 - 1) * (config.angleJitter / 100) * target.angleStep
            const radiusShift = (unitHash(target.id, seeded("radius")) * 2 - 1) * (config.radiusJitter / 100) * target.radialScale
            for (const scale of JITTER_SCALES) {
                const point = at(Math.max(MIN_RADIUS, target.radius + radiusShift * scale), target.angle + angleShift * scale)
                if (scale === 0 || fits(target.id, point)) {
                    place(target.id, point)
                    break
                }
            }
        }
    }
    const positions = new Map<string, Point>()
    for (const target of targets) {
        const point = current.get(target.id)!
        positions.set(target.id, { x: Math.round(point.x * 10) / 10, y: Math.round(point.y * 10) / 10 })
    }
    return positions
}

/** Vagas de um anel (≈ `slot` px entre vizinhas, no mínimo `minPerRing`). */
export const universeRingCapacity = (ring: number, config: UniverseLayoutConfig = DEFAULT_UNIVERSE_LAYOUT) =>
    Math.max(config.minPerRing, Math.floor((2 * Math.PI * (config.firstRadius + ring * config.ringGap)) / config.slot))

/**
 * Quantas memórias em cada anel: o número de anéis é o mínimo que comporta todas. Distribuição
 * `proportional` (padrão): proporcional às vagas de cada anel (maior resto), para o último anel não ficar
 * quase vazio (50 memórias: ~12/17/21 em vez de 20/28/2); `fill`: enche cada anel antes do próximo.
 */
export function universeRingCounts(total: number, config: UniverseLayoutConfig = DEFAULT_UNIVERSE_LAYOUT): number[] {
    if (total <= 0) return []
    if (config.balance === "fill") {
        const counts: number[] = []
        for (let left = total; left > 0; ) {
            const count = Math.min(universeRingCapacity(counts.length, config), left)
            counts.push(count)
            left -= count
        }
        return counts
    }
    const capacities: number[] = []
    let room = 0
    while (room < total) {
        const capacity = universeRingCapacity(capacities.length, config)
        capacities.push(capacity)
        room += capacity
    }
    const exact = capacities.map((capacity) => (total * capacity) / room)
    const counts = exact.map((value, ring) => Math.min(Math.floor(value), capacities[ring] ?? 0))
    let missing = total - counts.reduce((sum, count) => sum + count, 0)
    const byRemainder = exact.map((value, ring) => ({ ring, rest: value - Math.floor(value) })).sort((a, b) => b.rest - a.rest || a.ring - b.ring)
    for (let index = 0; missing > 0; index = (index + 1) % byRemainder.length) {
        const ring = byRemainder[index]?.ring ?? 0
        if ((counts[ring] ?? 0) < (capacities[ring] ?? 0)) {
            counts[ring] = (counts[ring] ?? 0) + 1
            missing -= 1
        }
    }
    return counts
}

/** Deslocamento do hover: as demais partículas se afastam levemente da focada. */
export function repelOffset(from: Point, focus: Point, strength = 18, radius = 220): Point {
    const dx = from.x - focus.x
    const dy = from.y - focus.y
    const distance = Math.hypot(dx, dy)
    if (distance === 0 || distance > radius) return { x: 0, y: 0 }
    const factor = (strength * (1 - distance / radius)) / distance
    return { x: dx * factor, y: dy * factor }
}

/** Link partícula ↔ centro destacado: só no universo do agente, quando ele escreveu a memória. */
export function isAuthoredByCenter(memory: Pick<NetworkMemory, "authorAgent">, center: { kind: "channel" | "agent"; id: string }): boolean {
    return center.kind === "agent" && Boolean(memory.authorAgent) && memory.authorAgent === center.id
}

/** Janela em que uma memória nova conta como "acabou de ser criada" (partícula de criação). */
export const AGENT_WRITE_WINDOW_MS = 2 * 60 * 1000

export interface AgentWrite {
    id: string
    agent: string
    channel: string
}

/**
 * Criações por agente entre os ids que acabaram de aparecer: só memórias com agente autor
 * (`authorAgent`) criadas há pouco. Ids que só apareceram agora por outro motivo (Mostrar arquivados,
 * filtro de app, memória movida) não contam.
 */
export function agentWritesOf(fresh: readonly string[], memories: readonly Pick<NetworkMemory, "id" | "authorAgent" | "channel" | "createdAt">[], now: number = Date.now()): AgentWrite[] {
    if (!fresh.length) return []
    const byId = new Map(memories.map((memory) => [memory.id, memory]))
    const writes: AgentWrite[] = []
    for (const id of fresh) {
        const memory = byId.get(id)
        if (!memory?.authorAgent) continue
        const age = now - time(memory.createdAt)
        if (Number.isNaN(age) || age > AGENT_WRITE_WINDOW_MS || age < -AGENT_WRITE_WINDOW_MS) continue
        writes.push({ id, agent: memory.authorAgent, channel: memory.channel })
    }
    return writes
}

/** Pesos da fusão da busca do Engramind (`search.vector_weight`, `search.text_weight`, `search.rrf_k`). */
export interface SearchFusion {
    vectorWeight: number
    textWeight: number
    k: number
}

export const DEFAULT_SEARCH_FUSION: SearchFusion = { vectorWeight: 1, textWeight: 1, k: 60 }

/** Acertos de um ramo sozinho que ainda destacam: as primeiras posições (as mais próximas pelo sentido). */
export const SEARCH_SINGLE_BRANCH_TOP = 3

/**
 * Ids que a busca destaca. O ramo vetorial do Engramind não tem limiar: devolve as memórias mais
 * próximas até o `limit`, mesmo sem relação com o termo, e com poucas memórias elas são todas. No modo
 * `hybrid`, destacam as que os dois ramos encontraram (sentido e texto) e as que um ramo sozinho pôs
 * nas `SEARCH_SINGLE_BRANCH_TOP` primeiras posições: score ≥ `max(peso) / (k + top)`. Como o acerto dos
 * dois ramos vale no mínimo `(pesoV + pesoT) / (k + limit)`, ele sempre passa. No modo `text`, todas.
 */
export function relevantSearchIds(results: readonly { score: number; memory: { id: string } }[], mode: "hybrid" | "text", fusion: SearchFusion = DEFAULT_SEARCH_FUSION): string[] {
    if (mode === "text") return results.map((hit) => hit.memory.id)
    const threshold = Math.max(fusion.vectorWeight, fusion.textWeight) / (fusion.k + SEARCH_SINGLE_BRANCH_TOP)
    return results.filter((hit) => hit.score >= threshold - 1e-6).map((hit) => hit.memory.id)
}

export interface UniverseStats {
    active: number
    inactive: number
    pinned: number
    uses: number
    lastUse: string | null
    forgotten: number
    byChannel: { slug: string; count: number }[]
}

/** Números do card de estatísticas de um universo (canal ou agente). */
export function universeStats(memories: readonly NetworkMemory[], brightness: ReadonlyMap<string, number>): UniverseStats {
    const byChannel = new Map<string, number>()
    let lastUse: string | null = null
    for (const memory of memories) {
        byChannel.set(memory.channel, (byChannel.get(memory.channel) ?? 0) + 1)
        const used = lastRealUseOf(memory)
        if (used && (!lastUse || time(used) > time(lastUse))) lastUse = used
    }
    return {
        active: memories.filter((memory) => memory.status !== "archived").length,
        inactive: memories.filter((memory) => memory.status === "archived").length,
        pinned: memories.filter((memory) => memory.status === "permanent").length,
        uses: memories.reduce((sum, memory) => sum + memoryUses(memory), 0),
        lastUse,
        forgotten: memories.filter((memory) => memory.status !== "archived" && (brightness.get(memory.id) ?? 1) === 0).length,
        byChannel: [...byChannel].map(([slug, count]) => ({ slug, count })).sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug)),
    }
}

/** Alcance de cada agente: memórias somadas dos canais ligados a ele. */
export function agentReach(links: readonly NetworkLink[], countByChannel: ReadonlyMap<string, number>): Map<string, number> {
    const reach = new Map<string, number>()
    for (const link of links) reach.set(link.agent, (reach.get(link.agent) ?? 0) + (countByChannel.get(link.channel) ?? 0))
    return reach
}

function clamp01(value: number): number {
    if (Number.isNaN(value)) return 0
    return Math.min(1, Math.max(0, value))
}
