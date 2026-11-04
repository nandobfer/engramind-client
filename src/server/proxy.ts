import { EngramindError, notConfiguredError } from "../core/errors"
import type { EngramindClient, EngramindMethod } from "./client"
import { matchProxyRoute, type ProxyMode, type ProxyRoute } from "./routes"

/**
 * Proxy HTTP pronto para os componentes da lib: o app monta numa rota (ex.: catch-all do Next.js
 * `app/api/engramind/[...path]/route.ts`) **atrás do próprio login** — a lib não verifica usuário. Repassa
 * só as rotas do modo (`app`: as do token de app; `manager`: também as do gestor), com o token do
 * servidor; a resposta é `{ success: true, data }` ou `{ success: false, error, code, details }` e nunca
 * traz o token configurado. No modo app, `issue_token` só emite `kind: agent`.
 */

export interface ProxyMutation {
    operation: string
    method: EngramindMethod
    params: Record<string, string>
    /** Corpo enviado (o app decide o que audita; segredos de token emitido não passam por aqui). */
    body: unknown
    result: unknown
}

export interface EngramindProxyOptions {
    /** Cliente do Engramind (ou uma função que o monta a cada requisição, ex.: lendo a configuração). */
    client: EngramindClient | (() => EngramindClient | null | Promise<EngramindClient | null>)
    mode?: ProxyMode
    /** Prefixo da rota no app (ex.: `/api/engramind`); o resto do caminho é a rota do Engramind. */
    basePath: string
    /** Depois de cada mutação bem-sucedida (auditoria do app). */
    onMutation?: (mutation: ProxyMutation) => void | Promise<void>
    /**
     * Token de agente emitido ou rotacionado: o segredo aparece só nesta resposta. O app pode gravá-lo onde
     * quiser (ex.: cofre do servidor); o diálogo da lib também o mostra uma única vez.
     */
    onTokenIssued?: (secret: string, token: { id: string; agent: string | null; app: string | null; kind: string; operation: "issue_token" | "rotate_token" }) => void | Promise<void>
    onError?: (error: unknown, route: ProxyRoute | null) => void
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers } })

export function errorResponse(error: unknown): Response {
    if (error instanceof EngramindError) {
        const headers: Record<string, string> = error.retryAfter !== null ? { "Retry-After": String(error.retryAfter) } : {}
        return json(error.status || 500, { success: false, error: error.message, code: error.code, ...(error.details !== undefined ? { details: error.details } : {}) }, headers)
    }
    return json(500, { success: false, error: "Falha inesperada ao falar com o Engramind.", code: "ENGRAMIND_PROXY_ERROR" })
}

/** Segmentos depois do `basePath`, decodificados (`channels/eng%2Fglobal` → `["channels", "eng/global"]`). */
export function proxySegments(pathname: string, basePath: string): string[] | null {
    const base = basePath.replace(/\/+$/, "")
    if (!pathname.startsWith(`${base}/`) && pathname !== base) return null
    const rest = pathname.slice(base.length).replace(/^\/+/, "")
    if (!rest) return []
    try {
        return rest.split("/").map((segment) => decodeURIComponent(segment))
    } catch {
        return null
    }
}

async function readBody(request: Request): Promise<unknown> {
    const text = await request.text()
    if (!text) return undefined
    try {
        return JSON.parse(text)
    } catch {
        throw new EngramindError(400, "Corpo da requisição inválido (JSON).", "ENGRAMIND_VALIDATION_ERROR")
    }
}

export function createEngramindProxy(options: EngramindProxyOptions) {
    const mode: ProxyMode = options.mode ?? "app"
    return async function handle(request: Request): Promise<Response> {
        const url = new URL(request.url)
        const segments = proxySegments(url.pathname, options.basePath)
        const match = segments ? matchProxyRoute(request.method, segments, mode) : null
        if (!match) return json(404, { success: false, error: "Operação do Engramind não disponível neste app.", code: "ENGRAMIND_ROUTE_NOT_ALLOWED" })
        try {
            const client = typeof options.client === "function" ? await options.client() : options.client
            if (!client) throw notConfiguredError()
            const method = match.route.method
            let body = method === "GET" || method === "DELETE" ? undefined : await readBody(request)
            if (match.route.operation === "issue_token" && mode === "app") {
                const input = (body && typeof body === "object" ? body : {}) as Record<string, unknown>
                if (input.kind !== undefined && input.kind !== "agent") throw new EngramindError(403, "O app só emite tokens de agente.", "ENGRAMIND_SCOPE_REQUIRED")
                body = { ...input, kind: "agent" }
            }
            const query = Object.fromEntries(url.searchParams.entries())
            const result = await client.call(method, match.path, { query, body: body ?? (method === "GET" || method === "DELETE" ? undefined : {}), headers: method === "GET" && request.headers.get("if-none-match") ? { "If-None-Match": request.headers.get("if-none-match")! } : undefined })
            if (method !== "GET") {
                const issued = (match.route.operation === "issue_token" || match.route.operation === "rotate_token") && result && typeof result === "object" ? (result as { secret?: unknown; token?: { id: string; kind: string; app?: { slug: string } | null; agent?: { slug: string } | null } }) : null
                if (issued && typeof issued.secret === "string" && issued.token) {
                    const token = issued.token
                    await options.onTokenIssued?.(issued.secret, { id: token.id, kind: token.kind, app: token.app?.slug ?? null, agent: token.agent && token.app ? `${token.app.slug}/${token.agent.slug}` : (token.agent?.slug ?? null), operation: match.route.operation as "issue_token" | "rotate_token" })
                }
                try {
                    await options.onMutation?.({ operation: match.route.operation, method, params: match.params, body: redactBody(match.route.operation, body), result: issued ? { ...issued, secret: undefined } : result })
                } catch (error) {
                    options.onError?.(error, match.route)
                }
            }
            return json(200, { success: true, data: result })
        } catch (error) {
            options.onError?.(error, match.route)
            return errorResponse(error)
        }
    }
}

/** O segredo do webhook nunca vai para a auditoria do app. */
function redactBody(operation: string, body: unknown): unknown {
    if (operation !== "update_app_webhook" || !body || typeof body !== "object") return body
    const copy = { ...(body as Record<string, unknown>) }
    if (copy.secret) copy.secret = "[segredo omitido]"
    return copy
}
