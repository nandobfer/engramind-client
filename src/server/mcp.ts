/**
 * Configuração de MCP pronta para registrar o Engramind num agente: `POST /mcp` com o token **do agente**
 * e o cabeçalho `Engramind-Channels` (canais do projeto). `tools/list` já mostra só o que o token pode
 * usar; repasse ao agente só as ferramentas que a sua política permite.
 */
export interface EngramindMcpConfig {
    type: "http"
    url: string
    headers: Record<string, string>
}

export function engramindMcpConfig(input: { baseUrl: string; agentToken: string; channels?: readonly string[] }): EngramindMcpConfig {
    const headers: Record<string, string> = { Authorization: `Bearer ${input.agentToken}` }
    if (input.channels?.length) headers["Engramind-Channels"] = input.channels.join(",")
    return { type: "http", url: `${input.baseUrl.replace(/\/+$/, "")}/mcp`, headers }
}

/** Ferramentas de leitura e de escrita do MCP do Engramind (para filtrar o `tools/list`). */
export const MCP_READ_TOOLS = ["get_context", "search_memories", "get_memory", "get_hints", "list_memories", "list_categories"] as const
export const MCP_WRITE_TOOLS = ["create_memory", "update_memory"] as const
