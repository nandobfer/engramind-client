import { tool, type Tool } from "ai"
import { z } from "zod"
import type { EngramindClient } from "../server/client"

/**
 * `@engramind/client/ai`: ferramentas prontas para o Vercel AI SDK (`ai` ≥ 5), chamadas com o token **do
 * agente** (o consumo aparece na rede como dele). Buscar e ler sempre; criar só com `write: true`.
 * Falhas viram `{ error }` em pt-BR para o modelo, sem derrubar o turno.
 */
export interface EngramindToolsOptions {
    client: EngramindClient
    /** Canais citados por padrão na busca (o Engramind busca nas assinaturas do agente). */
    channels?: readonly string[]
    /** Inclui `create_memory`. */
    write?: boolean
    /** Exclui da busca o que o agente já tem no contexto (padrão `true`). */
    excludeContext?: boolean
    searchLimit?: number
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

export function engramindTools(options: EngramindToolsOptions): Record<string, Tool> {
    const { client } = options
    const tools = {
        search_memories: tool({
            description: "Busca memórias do Engramind por sentido e por texto nos canais do agente. Devolve id, título, canal, categoria e um trecho.",
            inputSchema: z.object({
                query: z.string().min(1).max(500).describe("O que procurar"),
                channels: z.array(z.string()).max(50).optional().describe("Canais (slugs) para restringir a busca"),
                limit: z.number().int().min(1).max(20).optional(),
            }),
            execute: async ({ query, channels, limit }) => {
                try {
                    const result = await client.memories.search({ query, channels: channels ?? (options.channels ? [...options.channels] : undefined), limit: limit ?? options.searchLimit ?? 8, exclude_context: options.excludeContext ?? true })
                    return { mode: result.mode, results: result.results.map(({ memory, score }) => ({ id: memory.id, title: memory.title ?? null, channel: memory.channel, category: memory.category, score, excerpt: memory.text.slice(0, 280) })) }
                } catch (error) {
                    return { error: message(error) }
                }
            },
        }),
        get_memory: tool({
            description: "Lê uma memória do Engramind pelo id (texto completo, título, canal e categoria).",
            inputSchema: z.object({ id: z.string().min(1).max(60).describe("Id da memória (m_…)") }),
            execute: async ({ id }) => {
                try {
                    const memory = await client.memories.get(id)
                    return { id: memory.id, title: memory.title ?? null, text: memory.text, channel: memory.channel, category: memory.category, status: memory.status }
                } catch (error) {
                    return { error: message(error) }
                }
            },
        }),
    }
    if (!options.write) return tools
    return {
        ...tools,
        create_memory: tool({
            description: "Grava uma memória durável no Engramind (um fato autossuficiente, na categoria certa).",
            inputSchema: z.object({
                channel: z.string().min(1).max(160).describe("Canal (slug) em que o agente escreve"),
                text: z.string().min(1).describe("O fato, escrito para quem não tem o contexto da conversa"),
                category: z.string().min(1).max(64).optional(),
            }),
            execute: async ({ channel, text, category }) => {
                try {
                    const result = await client.memories.create({ channel, text, category })
                    return { id: result.memory.id, duplicate: result.duplicate, similar: result.similar.map((item) => item.id) }
                } catch (error) {
                    return { error: message(error) }
                }
            },
        }),
    }
}
