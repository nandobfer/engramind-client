/**
 * Textos da lib (pt-BR). O app sobrescreve qualquer chave pelo `messages` do `EngramindProvider`; chave
 * ausente usa o texto padrão. `{nome}` é trocado pelo valor correspondente.
 */
export const DEFAULT_MESSAGES = {
    "network.channelNotFound": "Canal não encontrado: voltando à rede.",
    "network.agentNotFound": "Agente não encontrado: voltando à rede.",
    "network.appNotFound": "App não encontrado: voltando à rede.",
    "network.searchFailed": "Não foi possível buscar as memórias.",
    "network.backToNetwork": "Voltar à rede",
    "network.noApps.title": "Nenhum app no Engramind",
    "network.noApps.description": "Crie um app e os agentes dele para ver a rede.",
    "network.noAgents.title": "Este app não tem agentes ativos",
    "network.noAgents.description": "Crie ou ative um agente deste app na configuração do Engramind.",
    "network.noLinkedChannels.title": "Os agentes deste app não assinam nenhum canal com memórias",
    "network.noLinkedChannels.description": "Canais sem memórias ficam fora da rede. Assine um canal ou grave uma memória num canal assinado.",
    "network.configure": "Configurar",
    "network.layout": "Distribuição da rede",
    "network.newMemory": "Nova memória",
    "network.agentEmpty": "Nenhuma memória nos canais deste agente",
    "network.agentNoChannels": "Este agente não assina nenhum canal",
    "network.agentMissing.title": "Agente não encontrado no Engramind",
    "network.agentMissing.description": "O agente ainda não foi cadastrado no Engramind (ou foi removido).",
    "state.configure.title": "Reconfigure o Engramind",
    "state.configure.description": "O Engramind recusou o token do app. Peça um novo token ao gestor e reconfigure o servidor do app.",
    "state.noAccess.title": "Sem acesso",
    "state.noAccess.description": "O token do app não alcança este registro.",
    "state.retry": "Tentar novamente",
    "config.agents.title": "Agentes",
    "config.channels.title": "Canais",
    "config.tokens.title": "Tokens de agente",
    "config.webhook.title": "Webhook do app",
    "config.empty.agents": "Nenhum agente neste app.",
    "config.newAgent": "Novo agente",
    "config.newChannel": "Novo canal",
    "config.webhook.url": "URL do webhook",
    "config.webhook.save": "Salvar webhook",
    "config.webhook.remove": "Remover webhook",
    "config.webhook.rotate": "Gerar novo segredo",
    "config.webhook.saved": "Webhook do app atualizado.",
    "config.webhook.secretOnce": "Copie o segredo agora: ele não aparece de novo. Configure-o no servidor do app para validar a assinatura.",
    "config.webhook.configured": "Segredo configurado",
    "config.webhook.notConfigured": "Sem webhook: a rede atualiza só pelas próprias ações e ao reconsultar.",
} as const

export type MessageKey = keyof typeof DEFAULT_MESSAGES
export type Messages = Record<MessageKey, string>
export type PartialMessages = Partial<Messages>

export function mergeMessages(overrides?: PartialMessages): Messages {
    const merged = { ...DEFAULT_MESSAGES } as Messages
    for (const [key, value] of Object.entries(overrides ?? {})) if (typeof value === "string" && key in merged) merged[key as MessageKey] = value
    return merged
}
