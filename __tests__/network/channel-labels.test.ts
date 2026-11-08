import { describe, expect, it } from 'vitest'
import { channelDisplayHint, channelDisplayName, channelNameParts, type ChannelLabel } from '../../src/react/engramind/network/channel-labels'

const central = 'agentes/desenvolvedor/central/6ae2827b3a8b66d141966500'
const campaign = 'app/campanhas/6ae2827b3a8b66d141966501/jogadores'
const labels = new Map<string, ChannelLabel>([
  [central, { title: 'OPE', hint: 'Opex · nandobfer/opex' }],
  [campaign, { title: 'Águas de Prata · Jogadores', hint: 'Memórias da campanha "Águas de Prata" (jogadores)', prefix: 'app/campanhas/' }],
])

describe('rótulos de canal', () => {
  it('sem rótulo: prefixo e ponta do próprio slug', () => {
    expect(channelNameParts('app/global', labels)).toEqual({ prefix: 'app/', title: 'global', hint: null })
    expect(channelDisplayName('app/global', labels)).toBe('app/global')
    expect(channelDisplayHint('app/global', labels)).toBe('app/global')
    expect(channelDisplayName('app/global')).toBe('app/global')
  })

  it('rótulo sem prefix: troca só a ponta (comportamento anterior)', () => {
    expect(channelNameParts(central, labels)).toEqual({ prefix: 'agentes/desenvolvedor/central/', title: 'OPE', hint: 'Opex · nandobfer/opex' })
    expect(channelDisplayName(central, labels)).toBe('agentes/desenvolvedor/central/OPE')
  })

  it('rótulo com prefix: o id do meio do slug some da tela e continua na dica', () => {
    expect(channelNameParts(campaign, labels)).toEqual({ prefix: 'app/campanhas/', title: 'Águas de Prata · Jogadores', hint: 'Memórias da campanha "Águas de Prata" (jogadores)' })
    expect(channelDisplayName(campaign, labels)).toBe('app/campanhas/Águas de Prata · Jogadores')
    expect(channelDisplayName(campaign, labels)).not.toContain('6ae2827b3a8b66d141966501')
    expect(channelDisplayHint(campaign, labels)).toBe(`Memórias da campanha "Águas de Prata" (jogadores) · ${campaign}`)
  })

  it('prefix vazio: o título ocupa a linha inteira', () => {
    const only = new Map<string, ChannelLabel>([[campaign, { title: 'Águas de Prata', hint: 'Campanha', prefix: '' }]])
    expect(channelNameParts(campaign, only).prefix).toBe('')
    expect(channelDisplayName(campaign, only)).toBe('Águas de Prata')
  })
})
