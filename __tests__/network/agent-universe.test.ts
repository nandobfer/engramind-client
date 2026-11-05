import { describe, expect, it } from 'vitest'
import { agentCreateChannels, agentUniverseChannels, clampLabelRect } from '../../src/react/engramind/network/network-math'

/** Universo do agente e rótulo do hover (OPE-130: D10 universo extraído, D11 canal da nova memória, D12 nome no hover). */

const channels = [
  { slug: 'opex', archived: false },
  { slug: 'agentes/rotineiros/global', archived: false },
  { slug: 'agentes/rotineiros/vagas', archived: false },
  { slug: 'velho', archived: true },
]
const links = [
  { agent: 'opex/rotineiro-vagas', channel: 'opex' },
  { agent: 'opex/rotineiro-vagas', channel: 'agentes/rotineiros/global' },
  { agent: 'opex/rotineiro-vagas', channel: 'agentes/rotineiros/vagas' },
  { agent: 'opex/rotineiro-vagas', channel: 'velho' },
  { agent: 'opex/outro', channel: 'opex' },
]

describe('agentUniverseChannels', () => {
  it('canais alcançados pelas assinaturas do agente, sem os arquivados (a não ser com includeArchived)', () => {
    expect(agentUniverseChannels(links, channels, 'opex/rotineiro-vagas', false)).toEqual(['opex', 'agentes/rotineiros/global', 'agentes/rotineiros/vagas'])
    expect(agentUniverseChannels(links, channels, 'opex/rotineiro-vagas', true)).toContain('velho')
    expect(agentUniverseChannels(links, channels, 'opex/sem-assinatura', false)).toEqual([])
  })
})

describe('critério aprovado (OPE-130, D11): canais da "Nova memória" no universo do agente', () => {
  const agentChannels = ['opex', 'agentes/rotineiros/global', 'agentes/rotineiros/vagas', 'velho']
  it('sem os arquivados e com o canal preferido primeiro', () => {
    expect(agentCreateChannels(agentChannels, channels, [], 'agentes/rotineiros/vagas')).toEqual(['agentes/rotineiros/vagas', 'opex', 'agentes/rotineiros/global'])
  })
  it('sem preferido (ou preferido de fora), o canal com mais memórias primeiro', () => {
    const memories = [{ channel: 'agentes/rotineiros/global' }, { channel: 'agentes/rotineiros/global' }, { channel: 'opex' }]
    expect(agentCreateChannels(agentChannels, channels, memories)[0]).toBe('agentes/rotineiros/global')
    expect(agentCreateChannels(agentChannels, channels, memories, 'velho')[0]).toBe('agentes/rotineiros/global')
  })
  it('sem canal aberto, nenhuma opção', () => {
    expect(agentCreateChannels(['velho'], channels, [])).toEqual([])
  })
})

describe('critério aprovado (OPE-130, D12): rótulo do hover sempre inteiro no quadro', () => {
  const canvas = { width: 800, height: 600 }
  const label = { width: 200, height: 40 }
  it('no meio: centrado e abaixo da partícula', () => {
    expect(clampLabelRect({ x: 400, y: 300 }, 10, label, canvas)).toEqual({ x: 300, y: 311, placement: 'below' })
  })
  it('na borda direita: encosta na margem sem sair do quadro', () => {
    expect(clampLabelRect({ x: 790, y: 300 }, 10, label, canvas).x).toBe(800 - 200 - 8)
  })
  it('na borda de baixo: passa para cima da partícula', () => {
    const rect = clampLabelRect({ x: 400, y: 590 }, 10, label, canvas)
    expect(rect.placement).toBe('above')
    expect(rect.y + label.height).toBeLessThanOrEqual(590)
  })
  it('quadro menor que o rótulo: encosta na margem', () => {
    expect(clampLabelRect({ x: 50, y: 20 }, 10, label, { width: 100, height: 30 })).toMatchObject({ x: 8, y: 8 })
  })
})
