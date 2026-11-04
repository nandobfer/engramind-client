import type { EngramindMethod } from "./client"

/**
 * Rotas do proxy da lib: o caminho do REST do Engramind sem o `/v1` (`channels/eng%2Fglobal/archive`).
 * `app` é o que o token de app pode fazer (matriz do guia `tokens-e-escopos`); `manager` acrescenta o que
 * o gestor da rede usa nas telas (apps, criar/editar/excluir canais, configurações por canal).
 */
export type ProxyMode = "app" | "manager"

export interface ProxyRoute {
    method: EngramindMethod
    /** Segmentos; `:nome` casa um segmento qualquer. */
    pattern: string
    modes: readonly ProxyMode[]
    /** Operação do Engramind (auditoria do app e testes). */
    operation: string
}

const BOTH = ["app", "manager"] as const
const MANAGER = ["manager"] as const
const r = (method: EngramindMethod, pattern: string, operation: string, modes: readonly ProxyMode[] = BOTH): ProxyRoute => ({ method, pattern, operation, modes })

export const PROXY_ROUTES: readonly ProxyRoute[] = [
    r("GET", "whoami", "whoami"),
    r("GET", "consumer-settings", "get_consumer_settings"),
    r("GET", "categories", "list_categories"),
    r("POST", "categories", "create_category"),
    r("GET", "agents", "list_agents"),
    r("POST", "agents", "create_agent"),
    r("GET", "agents/:agent", "get_agent"),
    r("PATCH", "agents/:agent", "update_agent"),
    r("DELETE", "agents/:agent", "delete_agent"),
    r("GET", "subscriptions", "list_subscriptions"),
    r("POST", "subscriptions", "subscribe"),
    r("PATCH", "subscriptions/:subscription", "update_subscription"),
    r("DELETE", "subscriptions/:subscription", "unsubscribe"),
    r("GET", "channels", "list_channels"),
    r("GET", "channels/:channel", "get_channel"),
    r("GET", "channels/:channel/stats", "channel_stats"),
    r("POST", "channels/:channel/archive", "archive_channel"),
    r("POST", "channels/:channel/restore", "restore_channel"),
    // Engramind 0.13.0: o token de app edita os canais que criou (403 FOREIGN_APP / 409 CHANNEL_SHARED nos outros).
    r("PATCH", "channels/:channel", "update_channel"),
    r("GET", "memories", "list_memories"),
    r("POST", "memories", "create_memory"),
    r("POST", "memories/import", "import_memories"),
    r("POST", "memories/search", "search_memories"),
    r("POST", "hints", "get_hints"),
    r("GET", "memories/:memory", "get_memory"),
    r("PATCH", "memories/:memory", "update_memory"),
    r("DELETE", "memories/:memory", "delete_memory"),
    r("GET", "memories/:memory/history", "memory_history"),
    r("POST", "memories/:memory/archive", "archive_memory"),
    r("POST", "memories/:memory/restore", "restore_memory"),
    r("POST", "memories/:memory/pin", "pin_memory"),
    r("POST", "memories/:memory/unpin", "unpin_memory"),
    r("POST", "memories/:memory/move", "move_memory"),
    r("POST", "memories/:memory/revert", "revert_memory"),
    r("POST", "memories/:memory/verify", "mark_verified"),
    r("GET", "tokens", "list_tokens"),
    r("POST", "tokens", "issue_token"),
    r("PATCH", "tokens/:token", "update_token"),
    r("POST", "tokens/:token/revoke", "revoke_token"),
    r("POST", "tokens/:token/rotate", "rotate_token"),
    r("GET", "apps/:app", "get_app"),
    r("PUT", "apps/:app/webhook", "update_app_webhook"),
    r("GET", "context", "get_context"),
    // Só o gestor (token admin).
    r("GET", "apps", "list_apps", MANAGER),
    r("POST", "channels", "create_channel", MANAGER),
    r("DELETE", "channels/:channel", "delete_channel", MANAGER),
    r("GET", "channels/:channel/settings", "get_channel_settings", MANAGER),
    r("PUT", "channels/:channel/settings", "update_channel_settings", MANAGER),
    r("GET", "settings", "get_settings", MANAGER),
]

export interface RouteMatch {
    route: ProxyRoute
    params: Record<string, string>
    /** Caminho do Engramind (`/v1/...`) com os segmentos recodificados. */
    path: string
}

/** Casa método + segmentos (já decodificados) com uma rota permitida no modo. */
export function matchProxyRoute(method: string, segments: readonly string[], mode: ProxyMode): RouteMatch | null {
    const upper = method.toUpperCase()
    for (const route of PROXY_ROUTES) {
        if (route.method !== upper || !route.modes.includes(mode)) continue
        const parts = route.pattern.split("/")
        if (parts.length !== segments.length) continue
        const params: Record<string, string> = {}
        let ok = true
        for (let index = 0; index < parts.length; index += 1) {
            const part = parts[index]!
            const segment = segments[index]!
            if (part.startsWith(":")) {
                if (!segment) ok = false
                else params[part.slice(1)] = segment
            } else if (part !== segment) ok = false
            if (!ok) break
        }
        if (ok) return { route, params, path: `/v1/${segments.map((segment) => encodeURIComponent(segment)).join("/")}` }
    }
    return null
}
