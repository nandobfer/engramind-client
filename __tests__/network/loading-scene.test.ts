import { describe, expect, it } from "vitest"
import { DEFAULT_UNIVERSE_LAYOUT } from "../../src/core/universe-layout"
import { LOADING_CROWN_RADIUS, LOADING_PARTICLE_COUNT, LOADING_PARTICLE_PERIOD_MS, loadingCycleDelay, loadingSceneParticles, loadingSceneRings, loadingSceneScale } from "../../src/react/engramind/network/loading-scene"

/** Cena de carregamento das redes (OPE-157): geometria determinística e relógio contínuo. */
describe("loadingSceneParticles", () => {
    it("é determinística: duas chamadas devolvem as mesmas partículas", () => {
        expect(loadingSceneParticles()).toEqual(loadingSceneParticles())
        expect(loadingSceneParticles()).toHaveLength(LOADING_PARTICLE_COUNT)
    })
    it("nascem numa coroa em volta do centro, com atrasos escalonados dentro do ciclo", () => {
        const particles = loadingSceneParticles()
        for (const particle of particles) {
            const distance = Math.hypot(particle.x, particle.y)
            expect(distance).toBeGreaterThanOrEqual(LOADING_CROWN_RADIUS * 0.7)
            expect(distance).toBeLessThanOrEqual(LOADING_CROWN_RADIUS * 1.15)
            expect(particle.delayMs).toBeGreaterThanOrEqual(0)
            expect(particle.delayMs).toBeLessThan(LOADING_PARTICLE_PERIOD_MS)
        }
        expect(new Set(particles.map((particle) => particle.delayMs)).size).toBe(particles.length)
        expect(particles.some((particle) => particle.light)).toBe(true)
    })
    it("borda: contagem zero ou negativa não gera partículas", () => {
        expect(loadingSceneParticles(0)).toEqual([])
        expect(loadingSceneParticles(-3)).toEqual([])
    })
})

describe("loadingSceneRings", () => {
    it("usa o raio inicial e a distância entre anéis da configuração do universo", () => {
        expect(loadingSceneRings(DEFAULT_UNIVERSE_LAYOUT)).toEqual([150, 208, 266])
        expect(loadingSceneRings({ firstRadius: 100, ringGap: 40 }, 290)).toEqual([100, 140, 180])
    })
    it("para no raio máximo e nunca fica vazia", () => {
        expect(loadingSceneRings({ firstRadius: 200, ringGap: 100 }, 290)).toEqual([200])
        expect(loadingSceneRings({ firstRadius: 400, ringGap: 50 }, 290)).toEqual([290])
    })
})

describe("loadingSceneScale e loadingCycleDelay", () => {
    it("a cena encolhe para caber na área e nunca cresce além de 1", () => {
        expect(loadingSceneScale(1200, 800, 266)).toBe(1)
        expect(loadingSceneScale(360, 600, 266)).toBeCloseTo(360 / 564)
        expect(loadingSceneScale(0, 0, 266)).toBe(1)
    })
    it("um skeleton que substitui outro continua o ciclo do relógio da cena", () => {
        expect(loadingCycleDelay(500, 0, 2400)).toBe(500)
        expect(loadingCycleDelay(500, 300, 2400)).toBe(200)
        expect(loadingCycleDelay(500, 900, 2400)).toBe(2000)
        expect(loadingCycleDelay(500, 2400 * 3 + 100, 2400)).toBe(400)
    })
})
