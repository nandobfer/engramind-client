import { randomUUID } from "node:crypto"
import { proxyMaskedError, toEngramindError, unreachableError, type EngramindErrorBody } from "../core/errors"
import type { CategoryInput, ChannelQuery, MemoryQuery } from "./client-types"
import type { Category, ConsumerSettings, ContextView, EngramindAgent, EngramindApp, EngramindChannel, EngramindHint, EngramindMemory, EngramindSubscription, EngramindToken, ImportResult, IssuedToken, MemoryRevision, MemoryWrite, SearchResults, WhoAmI } from "../core/types"

/**
 * Cliente HTTP do Engramind — SOMENTE servidor. Bearer com o token do app (ou de um agente),
 * `Idempotency-Key` em toda mutação, `If-None-Match` no contexto (`304` → `null`) e erros do envelope
 * `{ error: { code, message, details } }` traduzidos para `EngramindError` (pt-BR), inclusive o 5xx
 * mascarado por um proxy na frente do Engramind (Cloudflare).
 */

export type EngramindMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
export type Query = Record<string, string | number | boolean | null | undefined>

export interface EngramindClientOptions {
    /** URL base do Engramind (ex.: `https://engramind.exemplo.com`). */
    baseUrl: string
    /** Token do app (`kind: app`), de um agente ou, no gestor, admin. Nunca vai ao navegador. */
    token: string
    userAgent?: string
    timeoutMs?: number
    fetch?: typeof fetch
    /** Depuração: método, URL (com `focus` omitido), status e duração. Nunca recebe o corpo nem o token. */
    onDebug?: (entry: { method: string; url: string; status: number | null; durationMs: number; error?: string }) => void
}

export interface CallOptions {
    query?: Query
    body?: unknown
    headers?: Record<string, string>
    /** Chave de idempotência fixa (importação); padrão: uma nova por mutação. */
    idempotencyKey?: string
    signal?: AbortSignal
    timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 30_000
const USER_TEXT_QUERY = ["focus"]
const enc = encodeURIComponent

export function buildUrl(baseUrl: string, path: string, query: Query = {}): string {
    const url = new URL(`${baseUrl.replace(/\/+$/, "")}${path}`)
    for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value))
    return url.toString()
}

/** URL para a depuração: o texto do usuário (`focus`) vira o tamanho. */
export function debugUrl(url: string): string {
    const masked = new URL(url)
    for (const key of USER_TEXT_QUERY) {
        const value = masked.searchParams.get(key)
        if (value !== null) masked.searchParams.set(key, `[omitido: ${value.length} caracteres]`)
    }
    return masked.toString()
}

export function createEngramindClient(options: EngramindClientOptions) {
    const doFetch = options.fetch ?? fetch
    const userAgent = options.userAgent ?? "engramind-client"

    async function call<T = unknown>(method: EngramindMethod, path: string, request: CallOptions = {}): Promise<T> {
        const headers: Record<string, string> = { ...request.headers, Authorization: `Bearer ${options.token}`, Accept: "application/json", "User-Agent": userAgent }
        if (method !== "GET") headers["Idempotency-Key"] = request.idempotencyKey ?? `engramind-client-${randomUUID()}`
        const hasBody = request.body !== undefined && method !== "GET"
        if (hasBody) headers["Content-Type"] = "application/json"
        const timeout = AbortSignal.timeout(request.timeoutMs ?? options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
        const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout
        const url = buildUrl(options.baseUrl, path, request.query)
        const started = Date.now()
        let res: Response
        try {
            res = await doFetch(url, { method, headers, body: hasBody ? JSON.stringify(request.body) : undefined, cache: "no-store", signal })
        } catch (error) {
            const reason = error instanceof Error ? (error.name === "TimeoutError" || error.name === "AbortError" ? "tempo limite" : ((error as { cause?: { code?: string } }).cause?.code ?? error.message)) : String(error)
            options.onDebug?.({ method, url: debugUrl(url), status: null, durationMs: Date.now() - started, error: reason })
            throw unreachableError(reason)
        }
        options.onDebug?.({ method, url: debugUrl(url), status: res.status, durationMs: Date.now() - started })
        if (res.status === 304) return null as T
        const text = await res.text()
        let json: unknown = null
        if (text) {
            try {
                json = JSON.parse(text)
            } catch {
                json = null
            }
        }
        if (!res.ok) {
            const body = (json as { error?: EngramindErrorBody } | null)?.error ?? null
            throw toEngramindError(res.status, body && typeof body === "object" ? body : null, res.headers.get("retry-after"), body ? null : proxyMaskedError(text, json))
        }
        return json as T
    }

    /** `GET /health/ready` (público): `true` quando o serviço recebe tráfego. */
    async function ready(signal?: AbortSignal): Promise<{ ready: boolean; detail: string }> {
        try {
            const res = await doFetch(`${options.baseUrl.replace(/\/+$/, "")}/health/ready`, { headers: { Accept: "application/json", "User-Agent": userAgent }, cache: "no-store", signal: signal ?? AbortSignal.timeout(10_000) })
            const body = (await res.json().catch(() => null)) as { status?: string } | null
            return { ready: res.ok && body?.status === "ready", detail: body?.status ?? `HTTP ${res.status}` }
        } catch (error) {
            return { ready: false, detail: error instanceof Error ? error.message : String(error) }
        }
    }

    return {
        call,
        ready,
        whoami: () => call<WhoAmI>("GET", "/v1/whoami"),
        consumerSettings: () => call<ConsumerSettings>("GET", "/v1/consumer-settings"),
        categories: {
            list: () => call<{ categories: Category[] }>("GET", "/v1/categories"),
            create: (input: CategoryInput) => call<Category>("POST", "/v1/categories", { body: input }),
        },
        agents: {
            list: (query: Query = {}) => call<{ agents: EngramindAgent[]; next_cursor: string | null }>("GET", "/v1/agents", { query }),
            get: (agent: string) => call<EngramindAgent>("GET", `/v1/agents/${enc(agent)}`),
            create: (input: { app?: string; slug: string; name: string; description?: string | null }) => call<EngramindAgent & { created?: boolean }>("POST", "/v1/agents", { body: input }),
            update: (agent: string, input: { name?: string; description?: string | null; disabled?: boolean }) => call<EngramindAgent>("PATCH", `/v1/agents/${enc(agent)}`, { body: input }),
            delete: (agent: string) => call<null>("DELETE", `/v1/agents/${enc(agent)}`),
        },
        subscriptions: {
            list: (query: Query = {}) => call<{ subscriptions: EngramindSubscription[]; next_cursor: string | null }>("GET", "/v1/subscriptions", { query }),
            create: (input: { agent: string; target: string; mode: "inject" | "search" | "manage"; access?: string[] | null; priority?: number | null }) => call<EngramindSubscription & { created?: boolean }>("POST", "/v1/subscriptions", { body: input }),
            update: (subscription: string, input: { mode?: "inject" | "search" | "manage"; access?: string[] | null; priority?: number | null }) => call<EngramindSubscription>("PATCH", `/v1/subscriptions/${enc(subscription)}`, { body: input }),
            delete: (subscription: string) => call<null>("DELETE", `/v1/subscriptions/${enc(subscription)}`),
        },
        channels: {
            list: (query: ChannelQuery = {}) => call<{ channels: EngramindChannel[]; next_cursor: string | null }>("GET", "/v1/channels", { query: query as Query }),
            get: (channel: string) => call<EngramindChannel>("GET", `/v1/channels/${enc(channel)}`),
            archive: (channel: string) => call<EngramindChannel>("POST", `/v1/channels/${enc(channel)}/archive`, { body: {} }),
            restore: (channel: string) => call<EngramindChannel>("POST", `/v1/channels/${enc(channel)}/restore`, { body: {} }),
        },
        memories: {
            list: (query: MemoryQuery = {}) => call<{ memories: EngramindMemory[]; next_cursor: string | null }>("GET", "/v1/memories", { query: query as Query }),
            get: (memory: string) => call<EngramindMemory>("GET", `/v1/memories/${enc(memory)}`),
            create: (input: { channel: string; text: string; category?: string; key?: string; tags?: string[] }) => call<MemoryWrite>("POST", "/v1/memories", { body: input }),
            update: (memory: string, input: { text?: string; category?: string; expected_version?: number; tags?: string[] }) => call<MemoryWrite>("PATCH", `/v1/memories/${enc(memory)}`, { body: input }),
            delete: (memory: string) => call<null>("DELETE", `/v1/memories/${enc(memory)}`),
            archive: (memory: string) => call<EngramindMemory>("POST", `/v1/memories/${enc(memory)}/archive`, { body: {} }),
            restore: (memory: string) => call<EngramindMemory>("POST", `/v1/memories/${enc(memory)}/restore`, { body: {} }),
            pin: (memory: string) => call<EngramindMemory>("POST", `/v1/memories/${enc(memory)}/pin`, { body: {} }),
            unpin: (memory: string) => call<EngramindMemory>("POST", `/v1/memories/${enc(memory)}/unpin`, { body: {} }),
            move: (memory: string, channel: string) => call<EngramindMemory>("POST", `/v1/memories/${enc(memory)}/move`, { body: { channel } }),
            history: (memory: string, query: Query = {}) => call<{ revisions: MemoryRevision[]; next_cursor: string | null }>("GET", `/v1/memories/${enc(memory)}/history`, { query }),
            revert: (memory: string, version: number) => call<EngramindMemory>("POST", `/v1/memories/${enc(memory)}/revert`, { body: { version } }),
            import: (input: { channel: string; memories: unknown[] }, idempotencyKey?: string) => call<ImportResult>("POST", "/v1/memories/import", { body: input, idempotencyKey }),
            search: (input: { query: string; channels?: string[]; categories?: string[]; limit?: number; include_archived?: boolean; exclude_context?: boolean }) => call<SearchResults & { context_version?: string }>("POST", "/v1/memories/search", { body: input }),
        },
        hints: (input: { text: string; channels?: string[]; limit?: number }) => call<{ hints: EngramindHint[] }>("POST", "/v1/hints", { body: input }),
        context: (input: { channels?: string[]; format?: string; focus?: string; ifNoneMatch?: string | null }, request: Pick<CallOptions, "signal" | "timeoutMs"> = {}) =>
            call<ContextView | null>("GET", "/v1/context", { query: { channels: input.channels?.join(","), format: input.format, focus: input.focus }, headers: input.ifNoneMatch ? { "If-None-Match": `"${input.ifNoneMatch}"` } : undefined, ...request }),
        tokens: {
            list: (query: Query = {}) => call<{ tokens: EngramindToken[]; next_cursor: string | null }>("GET", "/v1/tokens", { query }),
            issue: (input: { kind: "agent" | "app" | "admin"; agent?: string; app?: string; scopes: string[]; label?: string; expires_at?: string }) => call<IssuedToken>("POST", "/v1/tokens", { body: input }),
            update: (token: string, input: { label?: string | null; scopes?: string[]; expires_at?: string | null }) => call<EngramindToken>("PATCH", `/v1/tokens/${enc(token)}`, { body: input }),
            revoke: (token: string) => call<EngramindToken>("POST", `/v1/tokens/${enc(token)}/revoke`, { body: {} }),
            rotate: (token: string) => call<IssuedToken>("POST", `/v1/tokens/${enc(token)}/rotate`, { body: {} }),
        },
        apps: {
            get: (app: string) => call<EngramindApp>("GET", `/v1/apps/${enc(app)}`),
            /** `update_app_webhook`: grava ou remove (com `null`) a URL e o segredo do webhook do app. */
            updateWebhook: (app: string, input: { url: string | null; secret?: string | null }) => call<EngramindApp>("PUT", `/v1/apps/${enc(app)}/webhook`, { body: input }),
        },
    }
}

export type EngramindClient = ReturnType<typeof createEngramindClient>
