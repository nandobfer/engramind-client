import { describe, expect, it } from 'vitest'
import {
  agentDisplayName,
  agentReach,
  agentWritesOf,
  AGENT_WRITE_WINDOW_MS,
  isAuthoredByCenter,
  relevantSearchIds,
  clampCardRect,
  channelColors,
  chartToken,
  PRIMARY_CHANNEL_COLOR,
  universeChannelColors,
  pickChannelColors,
  lastRealUseOf,
  lastUseOf,
  layoutUniverse,
  particleBrightness,
  particleSize,
  PARTICLE_MAX_PX,
  PARTICLE_MIN_PX,
  PINNED_MIN_BRIGHTNESS,
  repelOffset,
  stableHash,
  subscriptionLinks,
  subscriptionReaches,
  UNIVERSE_FIRST_RADIUS,
  UNIVERSE_MIN_DISTANCE,
  UNIVERSE_RING_GAP,
  UNIVERSE_SLOT,
  splitChannelSlug,
  universeRingCapacity,
  universeRingCounts,
  minZoomCenter,
  memoryCardSize,
  MOBILE_FIT_MIN_ZOOM,
  universeStats,
} from '../../src/react/engramind/network/network-math'
import { buildParticles } from '../../src/react/engramind/network/particles'
import { channelNameParts } from '../../src/react/engramind/network/channel-labels'
import type { NetworkMemory } from '../../src/react/engramind/network/types'

/** OPE-109/OPE-114: cálculos puros da rede (cor pelo canal, tamanho, brilho, links, layout pela idade e estatísticas) e o contexto tagged. */

const NOW = Date.parse('2026-11-01T12:00:00Z')
const day = (offset: number) => new Date(NOW - offset * 86_400_000).toISOString()
const mem = (id: string, extra: Partial<NetworkMemory> = {}): NetworkMemory => ({
  id,
  channel: 'opex',
  title: id,
  text: `texto ${id}`,
  category: 'PROJECT_RULES',
  status: 'active',
  version: 1,
  createdAt: day(10),
  updatedAt: day(10),
  retrievals: 0,
  injections: 0,
  lastRetrievedAt: null,
  verifiedAt: null,
  stale: false,
  author: 'opex/opex',
  ...extra,
})

describe('cor pelo canal (OPE-114)', () => {
  it('buildParticles: a partícula usa a cor do canal; sem mapa, o roxo primário; inativa sem cor', () => {
    const colors = new Map([['opex', 'var(--chart-3)'], ['outro', 'var(--chart-5)']])
    const memories = [mem('a', { channel: 'opex', lastRetrievedAt: day(0) }), mem('b', { channel: 'outro' }), mem('c', { channel: 'opex', status: 'archived' })]
    const visuals = buildParticles(memories, { channelColors: colors, staleAfterDays: 30, now: NOW })
    expect(visuals.get('a')!.baseColor).toBe('var(--chart-3)')
    expect(visuals.get('a')!.color).toContain('var(--chart-3)')
    expect(visuals.get('b')!.baseColor).toBe('var(--chart-5)')
    expect(visuals.get('c')!.color).toBe('var(--color-muted-foreground)')
    expect(buildParticles([mem('d')], { staleAfterDays: 30, now: NOW }).get('d')!.baseColor).toBe(PRIMARY_CHANNEL_COLOR)
  })

  it('buildParticles: o tamanho segue só a relevância, não a idade', () => {
    const visuals = buildParticles([mem('nova', { createdAt: day(0), injections: 3 }), mem('velha', { createdAt: day(300), injections: 3 })], { staleAfterDays: 30, now: NOW })
    expect(visuals.get('nova')!.size).toBe(visuals.get('velha')!.size)
  })

  it('universo: o canal com mais memórias (inativas contam) fica com o roxo primário e os demais com a cor estável', () => {
    const base = channelColors(['a', 'b', 'c'])
    const memories = [mem('1', { channel: 'b' }), mem('2', { channel: 'b', status: 'archived' }), mem('3', { channel: 'a' })]
    const colors = universeChannelColors(base, memories)
    expect(colors.get('b')).toBe(PRIMARY_CHANNEL_COLOR)
    expect(colors.get('a')).toBe(base.get('a'))
    // Canal assinado sem memórias aparece com a cor estável.
    expect(colors.get('c')).toBe(base.get('c'))
    expect([...colors.values()].filter((color) => color === PRIMARY_CHANNEL_COLOR)).toHaveLength(1)
  })

  it('universo: empate vai para o menor slug (a primeira linha da legenda)', () => {
    const colors = universeChannelColors(channelColors(['zeta', 'alfa']), [mem('1', { channel: 'zeta' }), mem('2', { channel: 'alfa' })])
    expect(colors.get('alfa')).toBe(PRIMARY_CHANNEL_COLOR)
    expect(colors.get('zeta')).not.toBe(PRIMARY_CHANNEL_COLOR)
  })

  it('universo: o roxo é por universo; quem não é o maior mantém a mesma cor em qualquer universo', () => {
    const base = channelColors(['x', 'y', 'z'])
    const first = universeChannelColors(base, [mem('1', { channel: 'x' }), mem('2', { channel: 'x' }), mem('3', { channel: 'z' })])
    const second = universeChannelColors(base, [mem('4', { channel: 'y' }), mem('5', { channel: 'y' }), mem('6', { channel: 'x' }), mem('7', { channel: 'z' })])
    expect(first.get('x')).toBe(PRIMARY_CHANNEL_COLOR)
    expect(second.get('x')).toBe(base.get('x'))
    expect(second.get('y')).toBe(PRIMARY_CHANNEL_COLOR)
    expect(first.get('z')).toBe(second.get('z'))
  })

  it('universo de um canal só: roxo primário (também sem mapa); sem memórias, ninguém fica roxo', () => {
    expect(universeChannelColors(undefined, [mem('1', { channel: 'opex' })]).get('opex')).toBe(PRIMARY_CHANNEL_COLOR)
    const empty = universeChannelColors(channelColors(['a']), [])
    expect(empty.get('a')).toBe(channelColors(['a']).get('a'))
    expect([...empty.values()]).not.toContain(PRIMARY_CHANNEL_COLOR)
  })
})

describe('tamanho pelo uso', () => {
  it('logarítmico relativo ao universo: a mais usada no máximo, a nunca usada no mínimo', () => {
    expect(particleSize(100, 100)).toBe(PARTICLE_MAX_PX)
    expect(particleSize(0, 100)).toBe(PARTICLE_MIN_PX)
    const mid = particleSize(10, 100)
    expect(mid).toBeGreaterThan(PARTICLE_MIN_PX + (PARTICLE_MAX_PX - PARTICLE_MIN_PX) * 0.1)
    expect(mid).toBeLessThan(PARTICLE_MAX_PX)
  })

  it('tudo com zero: todas no mínimo', () => {
    expect(particleSize(0, 0)).toBe(PARTICLE_MIN_PX)
  })
})

describe('brilho pelo prazo do consolidador', () => {
  it('cheio no último uso e linear até cinza no prazo', () => {
    expect(particleBrightness({ status: 'active', stale: false, lastUse: day(0) }, 30, NOW)).toBe(1)
    expect(particleBrightness({ status: 'active', stale: false, lastUse: day(15) }, 30, NOW)).toBe(0.5)
    expect(particleBrightness({ status: 'active', stale: false, lastUse: day(45) }, 30, NOW)).toBe(0)
  })

  it('candidata a esquecimento fica cinza mesmo usada há pouco; fixada nunca some; inativa sem brilho', () => {
    expect(particleBrightness({ status: 'active', stale: true, lastUse: day(1) }, 30, NOW)).toBe(0)
    expect(particleBrightness({ status: 'permanent', stale: false, lastUse: day(300) }, 30, NOW)).toBe(PINNED_MIN_BRIGHTNESS)
    expect(particleBrightness({ status: 'archived', stale: false, lastUse: day(0) }, 30, NOW)).toBe(0)
  })

  it('último uso: o maior entre a última recuperação no Engramind e a criação (nunca usada conta da criação)', () => {
    const memory = mem('a', { createdAt: day(20), lastRetrievedAt: day(10) })
    expect(lastUseOf(memory)).toBe(day(10))
    expect(lastUseOf(mem('b', { createdAt: day(20) }))).toBe(day(20))
    expect(lastRealUseOf(mem('b'))).toBeNull()
  })

  it('regressão: a verificação do consolidador não conta como uso (nunca consultada esmaece pela criação)', () => {
    const memory = mem('a', { createdAt: day(29), verifiedAt: day(1) })
    expect(lastUseOf(memory)).toBe(day(29))
    expect(lastRealUseOf(memory)).toBeNull()
    expect(buildParticles([memory], { staleAfterDays: 30, now: NOW }).get('a')!.brightness).toBeLessThan(0.1)
  })

  it('buildParticles: candidata a esquecimento fica cinza, mas o consumo ao vivo (aumento local) a devolve ao brilho cheio', () => {
    const memories = [mem('a', { stale: true })]
    expect(buildParticles(memories, { staleAfterDays: 30, now: NOW }).get('a')!.brightness).toBe(0)
    const live = buildParticles(memories, { staleAfterDays: 30, now: NOW, bumps: { a: 1 } })
    expect(live.get('a')!.brightness).toBe(1)
  })

  it('buildParticles: o consumo ao vivo devolve o brilho e o aumento local cresce a partícula', () => {
    const memories = [mem('a', { createdAt: day(29), injections: 4 }), mem('b', { createdAt: day(0) })]
    const before = buildParticles(memories, { staleAfterDays: 30, now: NOW })
    expect(before.get('a')!.brightness).toBeLessThan(0.1)
    const after = buildParticles(memories, { staleAfterDays: 30, now: NOW, bumps: { a: 1 } })
    expect(after.get('a')!.brightness).toBe(1)
    expect(after.get('a')!.size).toBeGreaterThan(before.get('a')!.size)
    expect(after.get('b')!.size).toBe(PARTICLE_MIN_PX)
  })
})

describe('cor estável dos canais', () => {
  const slugsOf = (count: number) => Array.from({ length: count }, (_, index) => `canal-${index}`)
  /** Matiz (o token `--chart-N`) e tom (o que vem depois do token) de uma cor de canal. */
  const parts = (color: string) => ({ hue: /--chart-(\d)/.exec(color)![1]!, tone: color.startsWith('color-mix') ? (color.endsWith('70%, var(--color-foreground))') ? 'claro' : 'escuro') : 'puro' })

  it('um canal sozinho usa a base do slug (o token puro)', () => {
    expect(channelColors(['opex']).get('opex')).toBe(chartToken((stableHash('opex') % 5) + 2))
  })

  it('até 5 canais: cada um com uma matiz distinta e o token puro (nenhum par na mesma matiz)', () => {
    for (let count = 1; count <= 5; count += 1) {
      const colors = [...channelColors(slugsOf(count)).values()]
      expect(new Set(colors).size).toBe(count)
      for (const color of colors) expect(parts(color).tone).toBe('puro')
    }
  })

  it('6 a 15 canais: nenhuma combinação (matiz + tom) repete, e a matiz só repete depois das 5 ocupadas', () => {
    for (let count = 6; count <= 15; count += 1) {
      const colors = [...channelColors(slugsOf(count)).values()]
      expect(new Set(colors).size).toBe(count)
    }
    const colors = [...channelColors(slugsOf(15)).entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, color]) => parts(color))
    // A ordem por slug preenche rodadas de 5: primeiro as 5 matizes puras, depois mais claras, depois mais escuras.
    expect(colors.slice(0, 5).map((color) => color.tone)).toEqual(Array(5).fill('puro'))
    expect(colors.slice(5, 10).map((color) => color.tone)).toEqual(Array(5).fill('claro'))
    expect(colors.slice(10, 15).map((color) => color.tone)).toEqual(Array(5).fill('escuro'))
    for (let round = 0; round < 3; round += 1) expect(new Set(colors.slice(round * 5, round * 5 + 5).map((color) => color.hue)).size).toBe(5)
  })

  it('regressão: dois canais com a mesma base preferida mudam de matiz antes de mudar só o tom', () => {
    const preferred = (slug: string) => stableHash(slug) % 5
    const all = slugsOf(60)
    const a = all[0]!
    const rival = all.find((slug) => slug !== a && preferred(slug) === preferred(a))!
    expect(rival).toBeTruthy()
    const colors = channelColors([a, rival])
    const [first, second] = [a, rival].sort().map((slug) => parts(colors.get(slug)!))
    expect(first!.hue).not.toBe(second!.hue)
    expect(first!.tone).toBe('puro')
    expect(second!.tone).toBe('puro')
  })

  it('o roxo primário (--chart-1) fica fora da paleta estável dos canais e não há cor fixa', () => {
    const colors = channelColors(slugsOf(40))
    for (const color of colors.values()) {
      expect(color).not.toContain('--chart-1)')
      expect(color).not.toContain('--color-primary')
      expect(color).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i)
    }
  })

  it('o mapa é determinístico e não depende da ordem dos slugs recebidos', () => {
    const slugs = slugsOf(12)
    expect([...channelColors(slugs)]).toEqual([...channelColors([...slugs].reverse())].sort(([a], [b]) => a.localeCompare(b)))
  })

  it('regressão: o mesmo canal tem a mesma cor nos universos em que não colide; quem colide muda de matiz', () => {
    const all = slugsOf(40)
    const colors = channelColors(all)
    const slot = (slug: string) => parts(colors.get(slug)!)
    const rival = all.find((slug) => slug !== 'canal-0' && slot(slug).hue === slot('canal-0').hue)!
    expect(rival).toBeTruthy()
    const apart = all.find((slug) => slot(slug).hue !== slot('canal-0').hue)!
    // Sem colisão no universo, a cor é a global.
    const alone = pickChannelColors(colors, ['canal-0', apart])
    expect(alone.get('canal-0')).toBe(colors.get('canal-0'))
    expect(alone.get(apart)).toBe(colors.get(apart))
    // Com colisão, os dois ficam em matizes diferentes (o de slug menor mantém a cor global).
    const together = pickChannelColors(colors, ['canal-0', rival])
    const [lower, higher] = ['canal-0', rival].sort()
    expect(together.get(lower!)).toBe(colors.get(lower!))
    expect(parts(together.get(lower!)!).hue).not.toBe(parts(together.get(higher!)!).hue)
    // Conjunto de entrada em outra ordem: mesmo resultado.
    expect([...pickChannelColors(colors, [rival, 'canal-0'])].sort()).toEqual([...together].sort())
    expect(pickChannelColors(colors, ['novo-canal']).get('novo-canal')).toMatch(/var\(--chart-/)
  })

  it('universo com até 5 canais: nunca há duas cores na mesma matiz, mesmo com colisões globais', () => {
    const all = slugsOf(60)
    const colors = channelColors(all)
    for (let start = 0; start < 55; start += 1) {
      const picked = [...pickChannelColors(colors, all.slice(start, start + 5)).values()]
      expect(new Set(picked.map((color) => parts(color).hue)).size).toBe(5)
    }
  })

  it('universo com mais de 5 canais: nenhuma combinação (matiz + tom) repete', () => {
    const all = slugsOf(60)
    const colors = channelColors(all)
    for (const count of [6, 9, 15]) {
      const picked = [...pickChannelColors(colors, all.slice(10, 10 + count)).values()]
      expect(new Set(picked).size).toBe(count)
    }
  })
})

describe('links das assinaturas', () => {
  const channels = [
    { slug: 'opex', name: 'Opex', archived: false },
    { slug: 'agentes/opex/global', name: 'G', archived: false },
    { slug: 'agentes/opex/velho', name: 'V', archived: true },
    { slug: 'agentes/maddox/dono', name: 'M', archived: false },
  ]
  const subs = [
    { id: 's1', agent: 'opex/opex', target: 'agentes/opex/*', isPrefix: true, mode: 'inject' as const, reaches: ['agentes/opex/global'] },
    { id: 's2', agent: 'opex/opex', target: 'opex', isPrefix: false, mode: 'search' as const, reaches: ['opex'] },
    { id: 's3', agent: 'app/x', target: 'nada/*', isPrefix: true, mode: 'manage' as const, reaches: [] },
  ]

  it('um link por canal casado (prefixo incluído); prefixo sem canal não gera link', () => {
    const links = subscriptionLinks(subs, channels, false)
    expect(links.map((link) => `${link.agent}>${link.channel}:${link.mode}`)).toEqual(['opex/opex>agentes/opex/global:inject', 'opex/opex>opex:search'])
  })

  it('Mostrar arquivados casa o prefixo localmente com os canais arquivados', () => {
    expect(subscriptionLinks(subs, channels, true).map((link) => link.channel)).toContain('agentes/opex/velho')
    expect(subscriptionReaches('agentes/opex/*', true, 'agentes/opex/velho')).toBe(true)
    expect(subscriptionReaches('agentes/opex/*', true, 'agentes/maddox/dono')).toBe(false)
    expect(subscriptionReaches('opex', false, 'opex/x')).toBe(false)
  })

  it('alcance por agente soma as memórias dos canais ligados', () => {
    const reach = agentReach(subscriptionLinks(subs, channels, false), new Map([['opex', 3], ['agentes/opex/global', 2]]))
    expect(reach.get('opex/opex')).toBe(5)
  })
})

describe('layout', () => {
  it('card da memória: centralizado sobre a partícula e sempre inteiro dentro do quadro', () => {
    const canvas = { width: 800, height: 600 }
    const card = { width: 288, height: 300 }
    expect(clampCardRect({ x: 400, y: 300 }, card, canvas)).toEqual({ x: 256, y: 150 })
    expect(clampCardRect({ x: 0, y: 0 }, card, canvas)).toEqual({ x: 8, y: 8 })
    expect(clampCardRect({ x: 800, y: 600 }, card, canvas)).toEqual({ x: 800 - 288 - 8, y: 600 - 300 - 8 })
    expect(clampCardRect({ x: 790, y: 5 }, card, canvas)).toEqual({ x: 504, y: 8 })
    expect(clampCardRect({ x: 50, y: 50 }, card, { width: 200, height: 200 })).toEqual({ x: 8, y: 8 })
  })

  /** Anel de uma partícula pelo raio (os desvios ficam a menos de meio espaço entre anéis do raio do anel). */
  const ringOf = (point: { x: number; y: number }) => Math.max(0, Math.round((Math.hypot(point.x, point.y) - UNIVERSE_FIRST_RADIUS) / UNIVERSE_RING_GAP))
  const bigUniverse = (total: number) => Array.from({ length: total }, (_, index) => mem(`m${index}`, { createdAt: day(index) }))

  it('universo: as mais antigas na órbita interna e as mais novas na externa (o uso não muda a distância)', () => {
    // m0 é a mais nova e a menos usada; m59, a mais antiga e a mais usada.
    const memories = Array.from({ length: 60 }, (_, index) => mem(`m${index}`, { createdAt: day(index), injections: index }))
    const positions = layoutUniverse(memories)
    const rings = universeRingCounts(60).length
    expect(rings).toBeGreaterThan(1)
    expect(ringOf(positions.get('m0')!)).toBe(rings - 1)
    expect(ringOf(positions.get('m59')!)).toBe(0)
  })

  it('universo: determinístico (mesmas memórias, mesmos pontos, em qualquer ordem de entrada)', () => {
    const memories = bigUniverse(200)
    const first = layoutUniverse(memories)
    expect([...layoutUniverse(memories)]).toEqual([...first])
    const shuffled = [...memories].reverse()
    const again = layoutUniverse(shuffled)
    for (const memory of memories) expect(again.get(memory.id)).toEqual(first.get(memory.id))
  })

  it('universo: nenhuma partícula sobreposta (distância entre centros acima do maior tamanho)', () => {
    for (const total of [1, 2, 7, 60, 200, 300]) {
      const points = [...layoutUniverse(bigUniverse(total)).values()]
      expect(points).toHaveLength(total)
      let min = Infinity
      for (let a = 0; a < points.length; a += 1) for (let b = a + 1; b < points.length; b += 1) min = Math.min(min, Math.hypot(points[a]!.x - points[b]!.x, points[a]!.y - points[b]!.y))
      if (total > 1) expect(min).toBeGreaterThanOrEqual(UNIVERSE_MIN_DISTANCE - 0.2)
    }
    expect(UNIVERSE_MIN_DISTANCE).toBeGreaterThan(PARTICLE_MAX_PX)
  })

  it('universo: as faixas de raio dos anéis não se misturam (mais antigas por dentro, mais novas por fora)', () => {
    const memories = bigUniverse(300)
    const positions = layoutUniverse(memories)
    const counts = universeRingCounts(300)
    const bands = counts.map(() => ({ min: Infinity, max: -Infinity, oldest: -Infinity, newest: Infinity }))
    for (const memory of memories) {
      const point = positions.get(memory.id)!
      const ring = ringOf(point)
      const radius = Math.hypot(point.x, point.y)
      const age = Number(memory.id.slice(1))
      const band = bands[ring]!
      band.min = Math.min(band.min, radius)
      band.max = Math.max(band.max, radius)
      band.oldest = Math.max(band.oldest, age)
      band.newest = Math.min(band.newest, age)
    }
    counts.forEach((count, ring) => expect(memories.filter((memory) => ringOf(positions.get(memory.id)!) === ring)).toHaveLength(count))
    bands.slice(1).forEach((band, index) => {
      expect(bands[index]!.max).toBeLessThan(band.min)
      // Idade em dias: maior = mais antiga. O anel de dentro só tem as mais antigas.
      expect(bands[index]!.newest).toBeGreaterThan(band.oldest)
    })
  })

  it('universo: deixa de ser um alvo de círculos (raios e ângulos variam) e ganha respiro', () => {
    const points = [...layoutUniverse(bigUniverse(200)).values()]
    const radii = points.map((point) => Math.hypot(point.x, point.y))
    const ring = (index: number) => radii.filter((radius) => ringOf({ x: radius, y: 0 }) === index)
    const spread = (values: number[]) => Math.max(...values) - Math.min(...values)
    expect(spread(ring(1))).toBeGreaterThan(0.3 * UNIVERSE_RING_GAP)
    // Vizinha mais próxima: em mediana, perto do espaço previsto entre vizinhas.
    const nearest = points.map((point, index) => Math.min(...points.filter((_, other) => other !== index).map((near) => Math.hypot(near.x - point.x, near.y - point.y)))).sort((a, b) => a - b)
    expect(nearest[Math.floor(nearest.length / 2)]!).toBeGreaterThanOrEqual(0.7 * UNIVERSE_SLOT)
  })

  it('anéis equilibrados: mesmo número de anéis, distribuição proporcional às vagas, sem anel quase vazio', () => {
    // Até a capacidade do primeiro anel: um anel só.
    expect(universeRingCounts(universeRingCapacity(0))).toEqual([universeRingCapacity(0)])
    expect(universeRingCounts(10)).toEqual([10])
    for (const total of [50, 100, 1000]) {
      const counts = universeRingCounts(total)
      const capacities = counts.map((_, ring) => universeRingCapacity(ring))
      const room = capacities.reduce((sum, capacity) => sum + capacity, 0)
      expect(counts.reduce((sum, count) => sum + count, 0)).toBe(total)
      // O mínimo de anéis que comporta todas (como antes).
      expect(room - capacities.at(-1)!).toBeLessThan(total)
      counts.forEach((count, ring) => {
        expect(count).toBeLessThanOrEqual(capacities[ring]!)
        expect(count).toBeGreaterThanOrEqual(Math.floor(((total * capacities[ring]!) / room) * 0.5))
      })
    }
    // 50 memórias: distribuídas proporcionalmente às vagas, sem anel quase vazio.
    const fifty = universeRingCounts(50)
    expect(fifty).toEqual([10, 17, 23])
  })

  it('universo com 50 memórias: as mais antigas no anel de dentro e o último anel cheio', () => {
    const memories = bigUniverse(50)
    const positions = layoutUniverse(memories)
    const counts = universeRingCounts(50)
    const byRing = counts.map((_, index) => memories.filter((memory) => ringOf(positions.get(memory.id)!) === index).map((memory) => Number(memory.id.slice(1))))
    expect(byRing.map((items) => items.length)).toEqual(counts)
    // Idade em dias: maior = mais antiga.
    expect(Math.min(...byRing[0]!)).toBeGreaterThan(Math.max(...byRing[1]!))
  })

  it('universo: memória com data de criação inválida conta como a mais antiga e vai para o anel interno', () => {
    const memories = [...Array.from({ length: 60 }, (_, index) => mem(`m${index}`, { createdAt: day(index) })), mem('sem-data', { createdAt: 'invalida' })]
    const positions = layoutUniverse(memories)
    expect(ringOf(positions.get('sem-data')!)).toBe(0)
    expect(ringOf(positions.get('m0')!)).toBe(universeRingCounts(61).length - 1)
  })

  it('nome do canal: prefixo até a última barra e a ponta final como título', () => {
    expect(splitChannelSlug('agentes/desenvolvedor/central/abc123')).toEqual({ prefix: 'agentes/desenvolvedor/central/', leaf: 'abc123' })
    expect(splitChannelSlug('opex')).toEqual({ prefix: '', leaf: 'opex' })
    expect(splitChannelSlug('agentes/adversario/')).toEqual({ prefix: 'agentes/', leaf: 'adversario' })
  })

  it('celular: enquadra com zoom mínimo legível só quando o retângulo não cabe; centraliza nele', () => {
    const bounds = { x: -500, y: -50, width: 1000, height: 400 }
    expect(minZoomCenter(bounds, { width: 360, height: 600 }, MOBILE_FIT_MIN_ZOOM)).toEqual({ x: 0, y: 150, zoom: 0.5 })
    expect(minZoomCenter(bounds, { width: 1200, height: 800 }, MOBILE_FIT_MIN_ZOOM)).toBeNull()
    expect(minZoomCenter(bounds, { width: 0, height: 0 }, MOBILE_FIT_MIN_ZOOM)).toBeNull()
  })

  it('card da memória limitado ao quadro (8 px de margem), sem mudar quando cabe', () => {
    expect(memoryCardSize({ width: 288, height: 300 }, { width: 800, height: 600 })).toEqual({ width: 288, height: 300 })
    expect(memoryCardSize({ width: 288, height: 700 }, { width: 800, height: 448 })).toEqual({ width: 288, height: 432 })
    expect(memoryCardSize({ width: 288, height: 300 }, { width: 280, height: 600 })).toEqual({ width: 264, height: 300 })
    expect(memoryCardSize({ width: 288, height: 300 }, { width: 0, height: 0 })).toEqual({ width: 288, height: 300 })
  })

  it('hover afasta as vizinhas para longe da focada', () => {
    const offset = repelOffset({ x: 10, y: 0 }, { x: 0, y: 0 })
    expect(offset.x).toBeGreaterThan(0)
    expect(repelOffset({ x: 1000, y: 0 }, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 })
  })
})

describe('filtros e estatísticas', () => {
  it('OPE-113: link destacado só quando o agente do centro escreveu a memória', () => {
    expect(isAuthoredByCenter({ authorAgent: 'opex/opex' }, { kind: 'agent', id: 'opex/opex' })).toBe(true)
    expect(isAuthoredByCenter({ authorAgent: 'outro/bot' }, { kind: 'agent', id: 'opex/opex' })).toBe(false)
    expect(isAuthoredByCenter({ authorAgent: null }, { kind: 'agent', id: 'opex/opex' })).toBe(false)
    expect(isAuthoredByCenter({ authorAgent: 'opex/opex' }, { kind: 'channel', id: 'opex/opex' })).toBe(false)
  })

  it('OPE-113: criação por agente só conta para memória nova com agente autor criada há pouco', () => {
    const at = Date.parse('2026-11-02T12:00:00Z')
    const list = [
      { id: 'a', authorAgent: 'opex/opex', channel: 'opex', createdAt: '2026-11-02T11:59:30Z' },
      { id: 'b', authorAgent: null, channel: 'opex', createdAt: '2026-11-02T11:59:30Z' },
      { id: 'c', authorAgent: 'opex/opex', channel: 'opex', createdAt: new Date(at - AGENT_WRITE_WINDOW_MS - 1000).toISOString() },
    ]
    expect(agentWritesOf(['a', 'b', 'c', 'x'], list, at)).toEqual([{ id: 'a', agent: 'opex/opex', channel: 'opex' }])
    expect(agentWritesOf([], list, at)).toEqual([])
  })

  it('OPE-113: busca híbrida destaca o que os dois ramos acharam e o top 3 de um ramo sozinho (sentido forte); o resto do vetorial não; modo texto destaca tudo', () => {
    const hits = [
      { score: 0.0325, memory: { id: 'both' } },
      { score: 1 / 61, memory: { id: 'vector-1st' } },
      { score: 1 / 63, memory: { id: 'vector-3rd' } },
      { score: 1 / 64, memory: { id: 'vector-4th' } },
      { score: 0.0102, memory: { id: 'vector-last' } },
      { score: 2 / 110, memory: { id: 'both-last' } },
    ]
    expect(relevantSearchIds(hits, 'hybrid')).toEqual(['both', 'vector-1st', 'vector-3rd', 'both-last'])
    expect(relevantSearchIds(hits, 'text')).toHaveLength(6)
    // Pesos da configuração: com o vetor valendo 2, o corte do top 3 de um ramo é 2/63.
    expect(relevantSearchIds([{ score: 2 / 61, memory: { id: 'vector-1st' } }, { score: 2 / 70, memory: { id: 'vector-10th' } }], 'hybrid', { vectorWeight: 2, textWeight: 1, k: 60 })).toEqual(['vector-1st'])
  })

  it('estatísticas do universo: ativas, inativas, fixadas, usos, última consulta e esquecidas', () => {
    const memories = [mem('a', { retrievals: 2, injections: 3, lastRetrievedAt: day(2) }), mem('b', { status: 'permanent' }), mem('c', { status: 'archived', channel: 'x' })]
    const stats = universeStats(memories, new Map([['a', 0.9], ['b', 0], ['c', 0]]))
    expect(stats).toMatchObject({ active: 2, inactive: 1, pinned: 1, uses: 5, lastUse: day(2), forgotten: 1 })
    expect(stats.byChannel).toEqual([{ slug: 'opex', count: 2 }, { slug: 'x', count: 1 }])
  })

  it('nome do agente sem o prefixo "Agente"', () => {
    expect(agentDisplayName('Agente Opex')).toBe('Opex')
    expect(agentDisplayName('agente   Maddox')).toBe('Maddox')
    expect(agentDisplayName('Revisor')).toBe('Revisor')
  })
})

describe('rótulos dos canais', () => {
  it('o rótulo do app vira o título e a dica; canal sem rótulo mantém a ponta do slug', () => {
    const labels = new Map([['agentes/desenvolvedor/central/c1', { title: 'OPE', hint: 'Opex · nandobfer/opex' }]])
    expect(channelNameParts('agentes/desenvolvedor/central/c1', labels)).toEqual({ prefix: 'agentes/desenvolvedor/central/', title: 'OPE', hint: 'Opex · nandobfer/opex' })
    expect(channelNameParts('agentes/desenvolvedor/central/c9', labels)).toEqual({ prefix: 'agentes/desenvolvedor/central/', title: 'c9', hint: null })
    expect(channelNameParts('agentes/opex/global', labels)).toEqual({ prefix: 'agentes/opex/', title: 'global', hint: null })
  })
})
