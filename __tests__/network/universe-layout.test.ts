import { describe, expect, it } from 'vitest'
import { DEFAULT_UNIVERSE_LAYOUT, UNIVERSE_LAYOUT_PRESETS, type UniverseLayoutConfig } from '../../src/core/universe-layout'
import { layoutUniverse, particleSize, universeRingCapacity, universeRingCounts, type UniverseLayoutMemory } from '../../src/react/engramind/network/network-math'
import { buildParticles } from '../../src/react/engramind/network/particles'
import type { NetworkMemory } from '../../src/react/engramind/network/types'

const NOW = Date.parse('2026-11-01T12:00:00Z')
const day = (offset: number) => new Date(NOW - offset * 86_400_000).toISOString()
const config = (overrides: Partial<UniverseLayoutConfig> = {}): UniverseLayoutConfig => ({ ...DEFAULT_UNIVERSE_LAYOUT, ...overrides })
const memories = (total: number, extra: (index: number) => Partial<UniverseLayoutMemory> = () => ({})): UniverseLayoutMemory[] =>
  Array.from({ length: total }, (_, index) => ({ id: `m${index}`, createdAt: day(index), ...extra(index) }))
const radiusOf = (point: { x: number; y: number }) => Math.hypot(point.x, point.y)
const angleOf = (point: { x: number; y: number }) => (Math.atan2(point.y, point.x) + 2 * Math.PI) % (2 * Math.PI)
const minGap = (points: { x: number; y: number }[]) => {
  let min = Infinity
  for (let a = 0; a < points.length; a += 1) for (let b = a + 1; b < points.length; b += 1) min = Math.min(min, Math.hypot(points[a]!.x - points[b]!.x, points[a]!.y - points[b]!.y))
  return min
}

/** O algoritmo anterior à OPE-142 (anéis perfeitos, mais novas por dentro), copiado como referência do padrão. */
function legacyLayout(items: readonly UniverseLayoutMemory[]) {
  const created = (memory: UniverseLayoutMemory) => (Number.isNaN(Date.parse(memory.createdAt)) ? Number.NEGATIVE_INFINITY : Date.parse(memory.createdAt))
  const sorted = [...items].sort((a, b) => {
    const diff = created(b) - created(a)
    return (Number.isNaN(diff) ? 0 : diff) || a.id.localeCompare(b.id)
  })
  const positions = new Map<string, { x: number; y: number }>()
  let cursor = 0
  universeRingCounts(sorted.length).forEach((count, ring) => {
    const radius = 150 + ring * 58
    const members = sorted.slice(cursor, cursor + count)
    members.forEach((memory, index) => {
      const angle = ring * 0.61 + (index / members.length) * 2 * Math.PI
      positions.set(memory.id, { x: Math.round(Math.cos(angle) * radius * 10) / 10, y: Math.round(Math.sin(angle) * radius * 10) / 10 })
    })
    cursor += count
  })
  return positions
}

describe('layout do universo: o padrão reproduz o desenho original', () => {
  it.each([1, 7, 20, 50, 120, 300])('%i memórias: posições iguais às do algoritmo anterior (tolerância de 0,15 px)', (total) => {
    const list = memories(total)
    const now = layoutUniverse(list)
    const before = legacyLayout(list)
    expect(now.size).toBe(total)
    for (const item of list) {
      expect(Math.abs(now.get(item.id)!.x - before.get(item.id)!.x), `${item.id} x`).toBeLessThanOrEqual(0.15)
      expect(Math.abs(now.get(item.id)!.y - before.get(item.id)!.y), `${item.id} y`).toBeLessThanOrEqual(0.15)
    }
  })

  it('com data inválida e ordem de entrada embaralhada continua igual ao anterior', () => {
    const list = [...memories(40), { id: 'sem-data', createdAt: 'invalida' }].reverse()
    const now = layoutUniverse(list)
    const before = legacyLayout(list)
    for (const item of list) expect(Math.hypot(now.get(item.id)!.x - before.get(item.id)!.x, now.get(item.id)!.y - before.get(item.id)!.y)).toBeLessThanOrEqual(0.2)
  })

  it('sem desvio, cada anel tem um único raio e os anéis ficam 58 px afastados', () => {
    const points = [...layoutUniverse(memories(60)).values()]
    const radii = [...new Set(points.map((point) => Math.round(radiusOf(point))))].sort((a, b) => a - b)
    expect(radii).toEqual([150, 208, 266])
  })
})

describe('layout do universo: anéis configuráveis', () => {
  it('firstRadius, ringGap, slot e minPerRing mudam o desenho e a capacidade dos anéis', () => {
    expect(universeRingCapacity(0, config({ minPerRing: 30 }))).toBe(30)
    expect(universeRingCapacity(0, config({ slot: 92 }))).toBeLessThan(universeRingCapacity(0))
    const radii = [...new Set([...layoutUniverse(memories(60), config({ firstRadius: 200, ringGap: 100 })).values()].map((point) => Math.round(radiusOf(point))))].sort((a, b) => a - b)
    expect(radii).toEqual([200, 300])
  })

  it('ringRotationDeg gira cada anel em relação ao anterior', () => {
    const list = memories(60)
    const straight = layoutUniverse(list, config({ ringRotationDeg: 0 }))
    const turned = layoutUniverse(list, config({ ringRotationDeg: 90 }))
    const ring0 = universeRingCounts(60)[0]!
    const first = list[ring0]!.id
    expect(angleOf(straight.get('m0')!)).toBeCloseTo(angleOf(turned.get('m0')!), 5)
    expect(angleOf(straight.get(first)!)).toBeCloseTo(0, 1)
    expect(angleOf(turned.get(first)!)).toBeCloseTo(Math.PI / 2, 1)
  })

  it('order newest-outside inverte: a mais nova no anel externo e a mais antiga no interno', () => {
    const positions = layoutUniverse(memories(60), config({ order: 'newest-outside' }))
    expect(radiusOf(positions.get('m0')!)).toBeGreaterThan(radiusOf(positions.get('m59')!))
    expect(Math.round(radiusOf(positions.get('m59')!))).toBe(150)
  })

  it('data inválida conta como a mais antiga: externa com newest-inside e interna com newest-outside', () => {
    const list = [...memories(60), { id: 'sem-data', createdAt: 'invalida' }]
    expect(radiusOf(layoutUniverse(list).get('sem-data')!)).toBeGreaterThan(radiusOf(layoutUniverse(list).get('m0')!))
    expect(Math.round(radiusOf(layoutUniverse(list, config({ order: 'newest-outside' })).get('sem-data')!))).toBe(150)
  })

  it('orderBy uses: a mais usada por dentro; orderBy updated e last-use usam as próprias datas', () => {
    // A criação diz o contrário do uso: m0 é a mais nova e a menos usada.
    const list = memories(60, (index) => ({ retrievals: index, injections: 0, updatedAt: day(60 - index), lastRetrievedAt: index % 2 ? day(1) : null }))
    const byUses = layoutUniverse(list, config({ orderBy: 'uses' }))
    expect(Math.round(radiusOf(byUses.get('m59')!))).toBe(150)
    expect(radiusOf(byUses.get('m0')!)).toBeGreaterThan(radiusOf(byUses.get('m59')!))
    const byUpdated = layoutUniverse(list, config({ orderBy: 'updated' }))
    expect(Math.round(radiusOf(byUpdated.get('m59')!))).toBe(150)
    const byLastUse = layoutUniverse(list, config({ orderBy: 'last-use' }))
    // Quem foi consultada ontem (índices ímpares) vale mais que a criação antiga; m0 não foi consultada, vale a criação de hoje.
    expect(Math.round(radiusOf(byLastUse.get('m0')!))).toBe(150)
    expect(radiusOf(byLastUse.get('m59')!)).toBeLessThan(radiusOf(byLastUse.get('m58')!))
  })

  it('balance fill enche cada anel antes do próximo (20/28/2 para 50 memórias)', () => {
    expect(universeRingCounts(50, config({ balance: 'fill' }))).toEqual([20, 28, 2])
    expect(universeRingCounts(50, config({ balance: 'proportional' }))).toEqual([12, 17, 21])
    expect(universeRingCounts(0, config({ balance: 'fill' }))).toEqual([])
  })

  it('grouping channel: as memórias do mesmo canal ficam em arco contíguo em cada anel', () => {
    const list = memories(60, (index) => ({ channel: ['b', 'a', 'c'][index % 3] }))
    const positions = layoutUniverse(list, config({ grouping: 'channel' }))
    const counts = universeRingCounts(60)
    let cursor = 0
    counts.forEach((count) => {
      const members = list.slice(cursor, cursor + count)
      cursor += count
      const ordered = [...members].sort((a, b) => angleOf(positions.get(a.id)!) - angleOf(positions.get(b.id)!))
      // Girando pelo anel, o canal muda no máximo (canais - 1) vezes mais a volta.
      const changes = ordered.filter((item, index) => item.channel !== ordered[(index + 1) % ordered.length]!.channel).length
      expect(changes).toBeLessThanOrEqual(3)
    })
  })
})

describe('layout do universo: espiral', () => {
  const spiral = (overrides: Partial<UniverseLayoutConfig> = {}) => config({ layout: 'spiral', ...overrides })

  it('é determinística, começa no raio inicial e o raio cresce com a ordem (sem anéis)', () => {
    const list = memories(150)
    const first = layoutUniverse(list, spiral())
    expect([...layoutUniverse(list, spiral())]).toEqual([...first])
    expect(Math.round(radiusOf(first.get('m0')!))).toBe(150)
    const radii = list.map((item) => radiusOf(first.get(item.id)!))
    for (let index = 1; index < radii.length; index += 1) expect(radii[index]!).toBeGreaterThanOrEqual(radii[index - 1]! - 0.2)
    expect(new Set(radii.map((radius) => Math.round(radius))).size).toBeGreaterThan(100)
  })

  it('mantém cerca do espaço entre vizinhas configurado e não sobrepõe', () => {
    const points = [...layoutUniverse(memories(200), spiral({ spiralSpacing: 60 })).values()]
    expect(minGap(points)).toBeGreaterThan(30)
    const near = points.map((point, index) => Math.min(...points.filter((_, other) => other !== index).map((other) => Math.hypot(other.x - point.x, other.y - point.y)))).sort((a, b) => a - b)
    const median = near[Math.floor(near.length / 2)]!
    expect(median).toBeGreaterThan(40)
    expect(median).toBeLessThan(90)
  })

  it('order newest-outside e spiralAngleDeg mudam as posições', () => {
    const list = memories(80)
    const base = layoutUniverse(list, spiral())
    expect(radiusOf(layoutUniverse(list, spiral({ order: 'newest-outside' })).get('m0')!)).toBeGreaterThan(radiusOf(base.get('m0')!))
    expect(layoutUniverse(list, spiral({ spiralAngleDeg: 90 })).get('m5')).not.toEqual(base.get('m5'))
  })

  it('grouping channel: cada canal ocupa o próprio setor', () => {
    const list = memories(120, (index) => ({ channel: ['x', 'y', 'z'][index % 3] }))
    const positions = layoutUniverse(list, spiral({ grouping: 'channel' }))
    const arcs = ['x', 'y', 'z'].map((channel) => list.filter((item) => item.channel === channel).map((item) => angleOf(positions.get(item.id)!)))
    const bounds = arcs.map((angles) => ({ min: Math.min(...angles), max: Math.max(...angles) })).sort((a, b) => a.min - b.min)
    expect(bounds[0]!.max).toBeLessThanOrEqual(bounds[1]!.min + 1e-6)
    expect(bounds[1]!.max).toBeLessThanOrEqual(bounds[2]!.min + 1e-6)
  })

  it('um canal só com agrupamento funciona (um setor de volta inteira)', () => {
    const list = memories(30, () => ({ channel: 'unico' }))
    const positions = layoutUniverse(list, spiral({ grouping: 'channel' }))
    expect(positions.size).toBe(30)
    expect([...positions.values()].every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true)
  })
})

describe('layout do universo: desvio', () => {
  const loose = UNIVERSE_LAYOUT_PRESETS.find((preset) => preset.id === 'loose-rings')!.config

  it('é determinístico e não depende da ordem de entrada', () => {
    const list = memories(200)
    const first = layoutUniverse(list, loose)
    expect([...layoutUniverse(list, loose)]).toEqual([...first])
    const again = layoutUniverse([...list].reverse(), loose)
    for (const item of list) expect(again.get(item.id)).toEqual(first.get(item.id))
  })

  it('tira os anéis do alvo (raios e ângulos variam) sem misturar as faixas de anéis vizinhos', () => {
    const list = memories(300)
    const positions = layoutUniverse(list, loose)
    const counts = universeRingCounts(300, loose)
    const sorted = [...list].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    let cursor = 0
    const bands = counts.map((count) => {
      const radii = sorted.slice(cursor, cursor + count).map((item) => radiusOf(positions.get(item.id)!))
      cursor += count
      return { min: Math.min(...radii), max: Math.max(...radii) }
    })
    expect(bands[1]!.max - bands[1]!.min).toBeGreaterThan(0.3 * loose.ringGap)
    bands.slice(1).forEach((band, index) => expect(bands[index]!.max).toBeLessThan(band.min))
  })

  it('a semente reembaralha de forma estável e a semente 0 é a padrão', () => {
    const list = memories(80)
    const seed0 = layoutUniverse(list, { ...loose, jitterSeed: 0 })
    const seed7 = layoutUniverse(list, { ...loose, jitterSeed: 7 })
    expect(seed7).not.toEqual(seed0)
    expect([...layoutUniverse(list, { ...loose, jitterSeed: 7 })]).toEqual([...seed7])
  })

  it('com avoidOverlap nenhum par fica abaixo de minDistance; sem ele o desvio máximo vale', () => {
    const list = memories(300)
    const safe = [...layoutUniverse(list, { ...loose, minDistance: 50 }).values()]
    expect(minGap(safe)).toBeGreaterThanOrEqual(50 - 0.2)
    const risky = { ...loose, ringGap: 20, slot: 30, angleJitter: 100, radiusJitter: 49, avoidOverlap: false }
    const unchecked = [...layoutUniverse(list, risky).values()]
    expect(minGap(unchecked)).toBeLessThan(50)
    expect(minGap([...layoutUniverse(list, { ...risky, avoidOverlap: true }).values()])).toBeGreaterThanOrEqual(0)
  })

  it('o desvio de raio máximo nunca cruza o centro', () => {
    const points = [...layoutUniverse(memories(40), config({ firstRadius: 40, ringGap: 400, radiusJitter: 49, minDistance: 0 })).values()]
    expect(Math.min(...points.map(radiusOf))).toBeGreaterThanOrEqual(7.9)
  })
})

describe('tamanho das partículas configurável', () => {
  it('particleSize usa a faixa informada', () => {
    expect(particleSize(0, 10, { min: 6, max: 50 })).toBe(6)
    expect(particleSize(10, 10, { min: 6, max: 50 })).toBe(50)
    expect(particleSize(10, 10)).toBe(34)
  })

  it('buildParticles respeita sizeRange (inclusive o teto do consumo ao vivo)', () => {
    const base = { id: 'a', channel: 'c', title: 't', text: 'x', category: 'k', status: 'active', version: 1, createdAt: day(1), updatedAt: day(1), retrievals: 10, injections: 0, lastRetrievedAt: null, verifiedAt: null, stale: false, author: null } as NetworkMemory
    const list = [base, { ...base, id: 'b', retrievals: 0 }]
    const sizes = buildParticles(list, { staleAfterDays: 90, now: NOW, sizeRange: { min: 6, max: 50 } })
    expect(sizes.get('a')!.size).toBe(50)
    expect(sizes.get('b')!.size).toBe(6)
    expect(buildParticles(list, { staleAfterDays: 90, now: NOW }).get('a')!.size).toBe(34)
  })
})
