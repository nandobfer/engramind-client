import { describe, expect, it } from 'vitest'
import {
  applyUniverseLayoutPreset,
  DEFAULT_UNIVERSE_LAYOUT,
  formatUniverseLayoutJson,
  matchesUniverseLayoutPreset,
  parseUniverseLayout,
  parseUniverseLayoutJson,
  UNIVERSE_LAYOUT_PRESETS,
  type UniverseLayoutConfig,
} from '../../src/core/universe-layout'
import { layoutUniverse, universeRingCounts, type UniverseLayoutMemory } from '../../src/react/engramind/network/network-math'
import { centerLinkKind, relatedEdgeStyle, relatedPairs, relatedScoreRange, type RelatedMap } from '../../src/react/engramind/network/related-edges'
import { orderBySimilarity } from '../../src/react/engramind/network/related-order'

/** OPE-164: preset "Relacionadas", campos `links`/`relatedMax`/`authorLinks`, ordem com similares e arestas. */

const NOW = Date.parse('2026-11-01T12:00:00Z')
const day = (offset: number) => new Date(NOW - offset * 86_400_000).toISOString()
const config = (overrides: Partial<UniverseLayoutConfig> = {}): UniverseLayoutConfig => ({ ...DEFAULT_UNIVERSE_LAYOUT, ...overrides })
const memories = (total: number, extra: (index: number) => Partial<UniverseLayoutMemory> = () => ({})): UniverseLayoutMemory[] =>
  Array.from({ length: total }, (_, index) => ({ id: `m${String(index).padStart(3, '0')}`, createdAt: day(index), channel: 'c', status: 'active', ...extra(index) }))
const related = (entries: Record<string, [string, number][]>): RelatedMap => new Map(Object.entries(entries).map(([id, hits]) => [id, hits.map(([other, score]) => ({ id: other, score }))]))
const radiusOf = (point: { x: number; y: number }) => Math.round(Math.hypot(point.x, point.y) * 10) / 10
const angleOf = (point: { x: number; y: number }) => Math.atan2(point.y, point.x)
const circular = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))

describe('schema com os campos novos (OPE-164)', () => {
  it('padrões: links ao centro, 3 arestas e o link do autor ligado', () => {
    expect(DEFAULT_UNIVERSE_LAYOUT.links).toBe('center')
    expect(DEFAULT_UNIVERSE_LAYOUT.relatedMax).toBe(3)
    expect(DEFAULT_UNIVERSE_LAYOUT.authorLinks).toBe(true)
  })

  it('JSON antigo, sem os campos novos, continua válido e assume os padrões', () => {
    const { links: _links, relatedMax: _max, authorLinks: _author, ...old } = DEFAULT_UNIVERSE_LAYOUT
    const parsed = parseUniverseLayoutJson(JSON.stringify({ $schema: 'engramind-universe-layout', version: 1, ...old, ringGap: 90 }))
    expect(parsed.ok && parsed.config).toMatchObject({ ringGap: 90, links: 'center', relatedMax: 3, authorLinks: true })
  })

  it('D2 (similar do get_memory, no máximo 3): relatedMax fora de 1 a 3 ou fracionário é recusado', () => {
    for (const relatedMax of [0, 4, 2.5]) {
      const parsed = parseUniverseLayout({ relatedMax })
      expect(parsed.ok).toBe(false)
      expect(!parsed.ok && parsed.errors[0]?.path).toBe('relatedMax')
    }
  })

  it('links com valor desconhecido e authorLinks não booleano são recusados', () => {
    expect(parseUniverseLayout({ links: 'tudo' }).ok).toBe(false)
    expect(parseUniverseLayout({ authorLinks: 'sim' }).ok).toBe(false)
  })

  it('exportar e importar levam os campos novos', () => {
    const value = config({ links: 'related', relatedMax: 2, authorLinks: false })
    const parsed = parseUniverseLayoutJson(formatUniverseLayoutJson(value))
    expect(parsed.ok && parsed.config).toEqual(value)
  })
})

describe('preset "Relacionadas"', () => {
  const preset = UNIVERSE_LAYOUT_PRESETS.find((item) => item.id === 'related')!

  it('guarda a configuração salva em 13/11/2026 com os links entre similares', () => {
    expect(preset.label).toBe('Relacionadas')
    expect(preset.config).toEqual({
      layout: 'rings', orderBy: 'created', order: 'newest-outside', grouping: 'none', balance: 'proportional',
      firstRadius: 150, ringGap: 200, slot: 120, minPerRing: 6, ringRotationDeg: 34.95, spiralSpacing: 48, spiralAngleDeg: 137.508,
      angleJitter: 35, radiusJitter: 32, jitterSeed: 0, avoidOverlap: true, minDistance: 42, particleMinPx: 10, particleMaxPx: 34,
      links: 'related', relatedMax: 3, authorLinks: true,
    })
    expect(parseUniverseLayout(preset.config).ok).toBe(true)
  })

  it('os presets anteriores declaram links ao centro', () => {
    for (const item of UNIVERSE_LAYOUT_PRESETS.filter((entry) => entry.id !== 'related')) expect(item.config.links).toBe('center')
  })

  it('aplicar um preset mantém o authorLinks do formulário, e o preset continua ativo', () => {
    const values = config({ authorLinks: false, ringGap: 99 })
    const applied = applyUniverseLayoutPreset(values, preset)
    expect(applied).toEqual({ ...preset.config, authorLinks: false })
    expect(matchesUniverseLayoutPreset(applied, preset)).toBe(true)
    expect(matchesUniverseLayoutPreset(values, preset)).toBe(false)
  })
})

describe('arestas entre similares (relatedPairs)', () => {
  const list = memories(5)
  const [a, b, c, d, e] = list.map((memory) => memory.id) as [string, string, string, string, string]

  it('top-K pela nota, sem a própria memória e com uma aresta por par', () => {
    const pairs = relatedPairs(list, related({ [a]: [[a, 1], [b, 0.9], [c, 0.95], [d, 0.5]], [b]: [[a, 0.9]] }), 2)
    expect(pairs.map((pair) => pair.id)).toEqual([`related:${a}|${b}`, `related:${a}|${c}`])
  })

  it('par mútuo: a origem é o lado com a nota maior; no empate, o menor id', () => {
    const higher = relatedPairs(list, related({ [a]: [[b, 0.8]], [b]: [[a, 0.9]] }), 3)
    expect(higher[0]).toMatchObject({ source: b, target: a, score: 0.9 })
    const tie = relatedPairs(list, related({ [b]: [[a, 0.8]], [a]: [[b, 0.8]] }), 3)
    expect(tie[0]).toMatchObject({ source: a, target: b })
  })

  it('inativas não geram nem recebem aresta e a próxima candidata entra', () => {
    const withArchived = list.map((memory) => (memory.id === b ? { ...memory, status: 'archived' as const } : memory))
    const pairs = relatedPairs(withArchived, related({ [a]: [[b, 0.99], [c, 0.7]], [b]: [[d, 0.9]] }), 1)
    expect(pairs.map((pair) => pair.id)).toEqual([`related:${a}|${c}`])
  })

  it('similar fora do universo ou de outro canal (D2) é descartada', () => {
    const mixed = list.map((memory) => (memory.id === e ? { ...memory, channel: 'outro' } : memory))
    const pairs = relatedPairs(mixed, related({ [a]: [['fora', 0.99], [e, 0.98], [d, 0.6]] }), 1)
    expect(pairs.map((pair) => pair.id)).toEqual([`related:${a}|${d}`])
  })

  it('espessura e opacidade crescem com a nota (uma nota só: o meio)', () => {
    const range = relatedScoreRange([{ score: 0.8 }, { score: 0.9 }])
    expect(relatedEdgeStyle(0.9, range).width).toBeGreaterThan(relatedEdgeStyle(0.8, range).width)
    expect(relatedEdgeStyle(0.9, range).opacity).toBeGreaterThan(relatedEdgeStyle(0.8, range).opacity)
    expect(relatedEdgeStyle(0.7, { min: 0.7, max: 0.7 })).toEqual(relatedEdgeStyle(0.5, { min: 0, max: 1 }))
  })
})

describe('links ao centro (centerLinkKind)', () => {
  const agent = { kind: 'agent' as const, id: 'opex/dev' }
  const mine = { authorAgent: 'opex/dev' }
  const other = { authorAgent: 'opex/outro' }

  it('modo center: todas ligadas; o destaque só com authorLinks', () => {
    expect(centerLinkKind(mine, agent, { links: 'center', authorLinks: true })).toBe('authored')
    expect(centerLinkKind(mine, agent, { links: 'center', authorLinks: false })).toBe('normal')
    expect(centerLinkKind(other, agent, { links: 'center', authorLinks: true })).toBe('normal')
  })

  it('modo related: só a memória escrita pelo agente, com authorLinks; no universo do canal, nenhuma', () => {
    expect(centerLinkKind(mine, agent, { links: 'related', authorLinks: true })).toBe('authored')
    expect(centerLinkKind(mine, agent, { links: 'related', authorLinks: false })).toBeNull()
    expect(centerLinkKind(other, agent, { links: 'related', authorLinks: true })).toBeNull()
    expect(centerLinkKind(mine, { kind: 'channel', id: 'c' }, { links: 'related', authorLinks: true })).toBeNull()
  })
})

describe('ordem com similares (layoutUniverse + orderBySimilarity)', () => {
  const preset = UNIVERSE_LAYOUT_PRESETS.find((item) => item.id === 'related')!.config
  const ringOf = (cfg: UniverseLayoutConfig, list: UniverseLayoutMemory[]) => {
    const positions = layoutUniverse(list, { ...cfg, angleJitter: 0, radiusJitter: 0 }, { related: map })
    return (id: string) => radiusOf(positions.get(id)!)
  }
  const list = memories(60)
  const ids = list.map((memory) => memory.id)
  // Pares distantes no critério (no mesmo anel): 0↔9, 1↔7, 2↔11.
  const map = related({ [ids[0]!]: [[ids[9]!, 0.95]], [ids[1]!]: [[ids[7]!, 0.9]], [ids[2]!]: [[ids[11]!, 0.88]] })

  it('sem similares (ou com links ao centro) as posições são idênticas às de hoje', () => {
    expect(layoutUniverse(list, preset, { related: new Map() })).toEqual(layoutUniverse(list, { ...preset, links: 'center' }))
    expect(layoutUniverse(list, { ...preset, links: 'center' }, { related: map })).toEqual(layoutUniverse(list, { ...preset, links: 'center' }))
    expect(layoutUniverse(list, DEFAULT_UNIVERSE_LAYOUT)).toEqual(layoutUniverse(list, DEFAULT_UNIVERSE_LAYOUT, { related: map }))
  })

  it('cada memória fica no mesmo anel e os anéis têm as mesmas vagas', () => {
    const before = ringOf({ ...preset, links: 'center' }, list)
    const after = ringOf(preset, list)
    for (const id of ids) expect(Math.abs(after(id) - before(id)), id).toBeLessThanOrEqual(0.5)
  })

  it('as similares ficam em vagas vizinhas do anel', () => {
    const positions = layoutUniverse(list, { ...preset, angleJitter: 0, radiusJitter: 0 }, { related: map })
    const count = universeRingCounts(list.length, preset)[0]!
    const step = (2 * Math.PI) / count
    for (const [x, y] of [[0, 9], [1, 7], [2, 11]] as const) expect(circular(angleOf(positions.get(ids[x]!)!), angleOf(positions.get(ids[y]!)!))).toBeLessThan(step * 1.01)
  })

  it('o raio, o desvio e o tamanho continuam pela memória (só a vaga muda) e o resultado é determinístico', () => {
    expect(layoutUniverse(list, preset, { related: map })).toEqual(layoutUniverse([...list].reverse(), preset, { related: map }))
  })

  it('entre anéis, a similar de fora fica num ângulo próximo da de dentro', () => {
    const counts = universeRingCounts(list.length, preset)
    const inner = ids[0]!
    const outer = ids[counts[0]! + 5]!
    const anchored = related({ [outer]: [[inner, 0.9]] })
    const positions = layoutUniverse(list, { ...preset, angleJitter: 0, radiusJitter: 0 }, { related: anchored })
    const step = (2 * Math.PI) / counts[1]!
    expect(circular(angleOf(positions.get(outer)!), angleOf(positions.get(inner)!))).toBeLessThanOrEqual(step)
  })

  it('agrupado por canal, nada troca de arco', () => {
    const grouped = memories(30, (index) => ({ channel: index % 2 ? 'a' : 'b' }))
    const groupedIds = grouped.map((memory) => memory.id)
    const cfg = { ...preset, grouping: 'channel' as const, angleJitter: 0, radiusJitter: 0 }
    const before = layoutUniverse(grouped, { ...cfg, links: 'center' })
    const after = layoutUniverse(grouped, cfg, { related: related({ [groupedIds[1]!]: [[groupedIds[9]!, 0.9]], [groupedIds[0]!]: [[groupedIds[8]!, 0.9]] }) })
    const arcOf = (positions: Map<string, { x: number; y: number }>, channel: string) =>
      new Set(grouped.filter((memory) => memory.channel === channel).map((memory) => `${radiusOf(positions.get(memory.id)!)}:${angleOf(positions.get(memory.id)!).toFixed(4)}`))
    expect(arcOf(after, 'a')).toEqual(arcOf(before, 'a'))
    expect(arcOf(after, 'b')).toEqual(arcOf(before, 'b'))
  })

  it('espiral: cada memória fica na mesma coroa (raio) e as similares se aproximam', () => {
    const cfg = { ...preset, layout: 'spiral' as const, angleJitter: 0, radiusJitter: 0 }
    const before = layoutUniverse(list, { ...cfg, links: 'center' })
    const spiralMap = related({ [ids[20]!]: [[ids[26]!, 0.9]] })
    const after = layoutUniverse(list, cfg, { related: spiralMap })
    const radii = (positions: Map<string, { x: number; y: number }>) => [...positions.values()].map(radiusOf).sort((x, y) => x - y)
    radii(after).forEach((value, index) => expect(Math.abs(value - radii(before)[index]!)).toBeLessThanOrEqual(0.5))
    const distance = (positions: Map<string, { x: number; y: number }>) => Math.hypot(positions.get(ids[20]!)!.x - positions.get(ids[26]!)!.x, positions.get(ids[20]!)!.y - positions.get(ids[26]!)!.y)
    expect(distance(after)).toBeLessThan(distance(before))
    expect(Math.abs(radiusOf(after.get(ids[20]!)!) - radiusOf(before.get(ids[20]!)!))).toBeLessThan(cfg.spiralSpacing)
  })

  it('universo com uma memória fica igual', () => {
    const one = memories(1)
    expect(layoutUniverse(one, preset, { related: related({ [one[0]!.id]: [['x', 1]] }) })).toEqual(layoutUniverse(one, { ...preset, links: 'center' }))
  })

  it('orderBySimilarity sem pares devolve a ordem recebida', () => {
    expect(orderBySimilarity([{ id: 'a', angle: 0 }, { id: 'b', angle: 1 }], [{ indices: [0, 1], base: 0 }], [])).toEqual(['a', 'b'])
  })
})
