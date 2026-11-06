import { describe, expect, it } from 'vitest'
import {
  DEFAULT_UNIVERSE_LAYOUT,
  formatUniverseLayoutJson,
  parseUniverseLayout,
  parseUniverseLayoutJson,
  resolveUniverseLayout,
  sameUniverseLayout,
  UNIVERSE_LAYOUT_PRESETS,
  UNIVERSE_NUMBER_FIELDS,
  universeLayoutSchema,
  type UniverseNumberField,
} from '../../src/core/universe-layout'

describe('configuração do layout do universo', () => {
  it('o padrão é válido e é o desenho original (anéis a partir do raio 150, +58, 46 px, sem desvio)', () => {
    expect(universeLayoutSchema.parse({})).toEqual(DEFAULT_UNIVERSE_LAYOUT)
    expect(DEFAULT_UNIVERSE_LAYOUT).toMatchObject({ layout: 'rings', order: 'newest-inside', orderBy: 'created', grouping: 'none', balance: 'proportional', firstRadius: 150, ringGap: 58, slot: 46, minPerRing: 6, angleJitter: 0, radiusJitter: 0 })
    expect(DEFAULT_UNIVERSE_LAYOUT.ringRotationDeg).toBeCloseTo((0.61 * 180) / Math.PI, 1)
  })

  it('campo ausente assume o padrão (config parcial)', () => {
    const parsed = parseUniverseLayout({ ringGap: 90 })
    expect(parsed).toEqual({ ok: true, config: { ...DEFAULT_UNIVERSE_LAYOUT, ringGap: 90 } })
  })

  it('recusa valor fora do intervalo, com campo e mensagem em pt-BR, em cada campo numérico', () => {
    for (const [field, spec] of Object.entries(UNIVERSE_NUMBER_FIELDS) as [UniverseNumberField, (typeof UNIVERSE_NUMBER_FIELDS)[UniverseNumberField]][]) {
      for (const value of [spec.min - 1, spec.max + 1]) {
        const result = parseUniverseLayout({ [field]: value })
        expect(result.ok, `${field}=${value}`).toBe(false)
        if (!result.ok) expect(result.errors[0]).toMatchObject({ path: field })
      }
      if (field !== 'particleMaxPx') expect(parseUniverseLayout({ [field]: spec.min }).ok, `${field} no mínimo`).toBe(true)
    }
    const result = parseUniverseLayout({ ringGap: 5 })
    expect(!result.ok && result.errors[0]!.message).toBe('Distância entre anéis: o mínimo é 16 px')
  })

  it('recusa chave desconhecida, opção inválida, tipo errado e inteiro fracionário', () => {
    const unknown = parseUniverseLayout({ cor: 'azul' })
    expect(!unknown.ok && unknown.errors).toEqual([{ path: 'cor', message: 'Campo desconhecido: "cor"' }])
    const layout = parseUniverseLayout({ layout: 'grid' })
    expect(!layout.ok && layout.errors[0]!.message).toContain('Disposição: use')
    expect(parseUniverseLayout({ slot: '46' }).ok).toBe(false)
    expect(parseUniverseLayout({ jitterSeed: 1.5 }).ok).toBe(false)
    expect(parseUniverseLayout({ avoidOverlap: 'sim' }).ok).toBe(false)
  })

  it('o tamanho máximo da partícula não pode ser menor que o mínimo', () => {
    const result = parseUniverseLayout({ particleMinPx: 30, particleMaxPx: 20 })
    expect(!result.ok && result.errors).toEqual([{ path: 'particleMaxPx', message: 'Tamanho máximo da partícula: não pode ser menor que o mínimo' }])
    expect(parseUniverseLayout({ particleMinPx: 20, particleMaxPx: 20 }).ok).toBe(true)
  })

  it('exportar e importar: o JSON volta igual (ida e volta), com o identificador e a versão', () => {
    const config = { ...DEFAULT_UNIVERSE_LAYOUT, layout: 'spiral' as const, spiralSpacing: 60, angleJitter: 12, jitterSeed: 7, avoidOverlap: false }
    const text = formatUniverseLayoutJson(config)
    expect(JSON.parse(text)).toMatchObject({ $schema: 'engramind-universe-layout', version: 1, layout: 'spiral' })
    expect(parseUniverseLayoutJson(text)).toEqual({ ok: true, config })
  })

  it('importar aceita só os campos que mudam e completa com o padrão', () => {
    expect(parseUniverseLayoutJson('{"layout":"spiral"}')).toEqual({ ok: true, config: { ...DEFAULT_UNIVERSE_LAYOUT, layout: 'spiral' } })
    expect(parseUniverseLayoutJson('{}')).toEqual({ ok: true, config: DEFAULT_UNIVERSE_LAYOUT })
  })

  it('importar recusa JSON inválido, não objeto, outro formato, versão futura e lista os erros por campo', () => {
    const broken = parseUniverseLayoutJson('{ nope')
    expect(!broken.ok && broken.errors[0]!.message).toMatch(/^JSON inválido:/)
    expect(parseUniverseLayoutJson('[1]').ok).toBe(false)
    expect(parseUniverseLayoutJson('7').ok).toBe(false)
    expect(parseUniverseLayoutJson('{"$schema":"outro"}').ok).toBe(false)
    expect(parseUniverseLayoutJson('{"version":2}').ok).toBe(false)
    const many = parseUniverseLayoutJson('{"ringGap":1,"slot":9999,"extra":1}')
    expect(!many.ok && many.errors.map((error) => error.path).sort()).toEqual(['extra', 'ringGap', 'slot'])
  })

  it('resolveUniverseLayout: parcial completa com o padrão; inválido cai no padrão', () => {
    expect(resolveUniverseLayout(undefined)).toBe(DEFAULT_UNIVERSE_LAYOUT)
    expect(resolveUniverseLayout({ slot: 70 })).toEqual({ ...DEFAULT_UNIVERSE_LAYOUT, slot: 70 })
    expect(resolveUniverseLayout({ slot: 1 })).toBe(DEFAULT_UNIVERSE_LAYOUT)
  })

  it('os presets passam pelo schema e o primeiro é o padrão', () => {
    for (const preset of UNIVERSE_LAYOUT_PRESETS) expect(parseUniverseLayout(preset.config).ok, preset.id).toBe(true)
    expect(sameUniverseLayout(UNIVERSE_LAYOUT_PRESETS[0]!.config, DEFAULT_UNIVERSE_LAYOUT)).toBe(true)
    expect(sameUniverseLayout(UNIVERSE_LAYOUT_PRESETS[1]!.config, DEFAULT_UNIVERSE_LAYOUT)).toBe(false)
  })
})
