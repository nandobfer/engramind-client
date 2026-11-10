import { DEFAULT_UNIVERSE_LAYOUT, type UniverseLayoutConfig } from "../../../core/universe-layout"

/**
 * Geometria e tempos da cena de carregamento das redes (OPE-157): partículas numa coroa em volta do nó do
 * agente que viajam até ele, pulsos saindo do centro e os anéis do universo. Tudo deriva do índice (sem
 * `Math.random`), então a cena é a mesma em todo render.
 */

/** Viagem de cada partícula: a mesma duração e easing do `PathTraveler` das arestas. */
export const LOADING_TRAVEL_MS = 900
export const LOADING_TRAVEL_EASE = "easeInOut" as const
/** Ciclo de uma partícula (viagem + pausa até nascer de novo). */
export const LOADING_PARTICLE_PERIOD_MS = 2400
/** Respiração do halo do nó central. */
export const LOADING_HALO_MS = 3000
/** Cada anel de pulso e o intervalo entre os dois. */
export const LOADING_PULSE_MS = 2000
export const LOADING_PULSE_COUNT = 2
export const LOADING_PARTICLE_COUNT = 12
/** Raio (px) da coroa onde as partículas nascem. */
export const LOADING_CROWN_RADIUS = 170
/** Raio máximo (px) dos anéis do universo desenhados na cena. */
export const LOADING_RINGS_MAX_RADIUS = 290
export const LOADING_RINGS_MAX = 3

export interface LoadingParticle {
    /** Ponto de partida relativo ao centro (px). */
    x: number
    y: number
    /** Atraso (ms) dentro do ciclo, escalonado pelo índice. */
    delayMs: number
    /** Tamanho (px) do ponto. */
    size: number
    /** Partícula clara (o tom "white" das viagens) em vez da primária. */
    light: boolean
}

/** Desvio fixo por índice em [0, 1) (sequência de Weyl pela razão áurea). */
const jitter = (index: number, salt: number) => {
    const value = (index + 1) * 0.6180339887 + salt * 0.7548776662
    return value - Math.floor(value)
}

/** Partículas da coroa: ângulos espalhados por igual (com um desvio fixo), raio e atraso por índice. */
export function loadingSceneParticles(count = LOADING_PARTICLE_COUNT, radius = LOADING_CROWN_RADIUS, periodMs = LOADING_PARTICLE_PERIOD_MS): LoadingParticle[] {
    const total = Math.max(0, Math.floor(count))
    return Array.from({ length: total }, (_, index) => {
        const angle = -Math.PI / 2 + ((index + (jitter(index, 1) - 0.5) * 0.6) * 2 * Math.PI) / total
        const distance = radius * (0.75 + jitter(index, 2) * 0.35)
        return {
            x: Math.round(Math.cos(angle) * distance * 10) / 10,
            y: Math.round(Math.sin(angle) * distance * 10) / 10,
            // Ordem embaralhada (índice × 5 mod total) para as partículas vizinhas não nascerem em sequência.
            delayMs: Math.round((((index * 5) % total) * periodMs) / total),
            size: index % 3 === 0 ? 3 : 2,
            light: index % 4 === 1,
        }
    })
}

/** Raios dos anéis do universo (o mesmo `firstRadius` e `ringGap` da configuração), até o raio máximo. */
export function loadingSceneRings(layout: Pick<UniverseLayoutConfig, "firstRadius" | "ringGap"> = DEFAULT_UNIVERSE_LAYOUT, maxRadius = LOADING_RINGS_MAX_RADIUS, maxRings = LOADING_RINGS_MAX): number[] {
    const first = layout.firstRadius > 0 ? layout.firstRadius : DEFAULT_UNIVERSE_LAYOUT.firstRadius
    const gap = layout.ringGap > 0 ? layout.ringGap : DEFAULT_UNIVERSE_LAYOUT.ringGap
    const rings: number[] = []
    for (let radius = first; radius <= maxRadius && rings.length < maxRings; radius += gap) rings.push(radius)
    return rings.length ? rings : [Math.min(first, maxRadius)]
}

/** Escala da cena para caber na área (nunca maior que 1): o maior anel cabe no menor lado. */
export function loadingSceneScale(width: number, height: number, radius: number): number {
    if (!(width > 0) || !(height > 0) || !(radius > 0)) return 1
    return Math.min(1, Math.min(width, height) / (2 * radius + 32))
}

/** Relógio da cena: o primeiro skeleton marca o início e os seguintes continuam dele. */
let sceneEpoch: number | null = null
export function loadingSceneEpoch(now: number): number {
    sceneEpoch ??= now
    return sceneEpoch
}

/**
 * Atraso (ms, em [0, período)) que encaixa um ciclo no relógio da cena: um skeleton que substitui outro (o do
 * app e depois o da lib) continua a sequência em vez de reiniciá-la.
 */
export function loadingCycleDelay(delayMs: number, elapsedMs: number, periodMs: number): number {
    if (!(periodMs > 0)) return Math.max(0, delayMs)
    const value = (delayMs - Math.max(0, elapsedMs)) % periodMs
    return Math.round(value < 0 ? value + periodMs : value)
}
