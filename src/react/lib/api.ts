import { EngramindError } from "../../core/errors"

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete"
export type Params = Record<string, string | number | boolean | undefined | null>

/**
 * Fonte de dados dos componentes: o caminho é o mesmo do REST do Engramind sem o `/v1`
 * (`channels`, `memories/m_1/pin`). O navegador nunca chama o Engramind direto: a fonte padrão
 * (`createHttpDataSource`) chama o proxy montado pelo app.
 */
export interface EngramindDataSource {
    request<T>(method: HttpMethod, path: string, options?: { params?: Params; body?: unknown; signal?: AbortSignal }): Promise<T>
}

export interface HttpDataSourceOptions {
    /** Prefixo das rotas do proxy no app (ex.: `/api/engramind`). */
    basePath: string
    /** Desembrulha a resposta (padrão: `{ success, data }` → `data`; outro JSON passa como está). */
    unwrap?: (json: unknown) => unknown
    headers?: Record<string, string> | (() => Record<string, string>)
    fetch?: typeof fetch
    credentials?: RequestCredentials
}

const clean = (params: Params = {}) => Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== "") as [string, string | number | boolean][]

const defaultUnwrap = (json: unknown) => (json && typeof json === "object" && "success" in json && "data" in json ? (json as { data: unknown }).data : json)

/** Erro de uma resposta do proxy: `{ success: false, error, code, details }` ou `{ error: { code, message } }`. */
export function errorFromResponse(status: number, json: unknown, retryAfter: string | null = null): EngramindError {
    const body = (json && typeof json === "object" ? json : {}) as { error?: unknown; code?: unknown; details?: unknown; message?: unknown }
    const nested = body.error && typeof body.error === "object" ? (body.error as { code?: unknown; message?: unknown; details?: unknown }) : null
    const message = typeof body.error === "string" ? body.error : typeof nested?.message === "string" ? nested.message : typeof body.message === "string" ? body.message : `Falha na requisição (HTTP ${status}).`
    const code = typeof body.code === "string" ? body.code : typeof nested?.code === "string" ? (nested.code.startsWith("ENGRAMIND_") ? nested.code : `ENGRAMIND_${nested.code}`) : `HTTP_${status}`
    const seconds = retryAfter ? Number(retryAfter) : NaN
    return new EngramindError(status, message, code, body.details ?? nested?.details, Number.isFinite(seconds) ? seconds : null)
}

export function createHttpDataSource(options: HttpDataSourceOptions): EngramindDataSource {
    const base = options.basePath.replace(/\/+$/, "")
    const unwrap = options.unwrap ?? defaultUnwrap
    return {
        async request<T>(method: HttpMethod, path: string, request: { params?: Params; body?: unknown; signal?: AbortSignal } = {}) {
            const query = new URLSearchParams(clean(request.params).map(([key, value]) => [key, String(value)])).toString()
            const url = `${base}/${path.replace(/^\/+/, "")}${query ? `?${query}` : ""}`
            const extra = typeof options.headers === "function" ? options.headers() : (options.headers ?? {})
            const hasBody = method !== "get" && method !== "delete"
            let res: Response
            try {
                res = await (options.fetch ?? fetch)(url, {
                    method: method.toUpperCase(),
                    headers: { Accept: "application/json", ...(hasBody ? { "Content-Type": "application/json" } : {}), ...extra },
                    body: hasBody ? JSON.stringify(request.body ?? {}) : undefined,
                    credentials: options.credentials ?? "same-origin",
                    signal: request.signal,
                })
            } catch (error) {
                throw new EngramindError(0, "Sem conexão com o servidor. Confira a rede e tente novamente.", "NETWORK_ERROR", { reason: error instanceof Error ? error.message : String(error) })
            }
            const text = await res.text()
            let json: unknown = null
            if (text) {
                try {
                    json = JSON.parse(text)
                } catch {
                    json = null
                }
            }
            if (!res.ok) throw errorFromResponse(res.status, json, res.headers.get("retry-after"))
            return unwrap(json) as T
        },
    }
}

let activeSource: EngramindDataSource | null = null

/** Registra a fonte do `EngramindProvider` (uma fonte por página). */
export function setActiveDataSource(source: EngramindDataSource | null) {
    activeSource = source
}

export function activeDataSource(): EngramindDataSource {
    if (!activeSource) throw new EngramindError(0, "Monte os componentes do Engramind dentro de <EngramindProvider>.", "ENGRAMIND_NO_PROVIDER")
    return activeSource
}

/** Código estável de um erro (`ENGRAMIND_CHANNEL_SHARED`...). */
export function apiErrorCode(error: unknown): string | undefined {
    if (error instanceof EngramindError) return error.code
    const code = (error as { code?: unknown } | null)?.code
    return typeof code === "string" ? code : undefined
}

/** Mensagem pt-BR de um erro, com um texto padrão. */
export function apiErrorMessage(error: unknown, fallback = "Não foi possível concluir a ação."): string {
    if (error instanceof EngramindError) return error.message || fallback
    if (error instanceof Error && error.message) return error.message
    return fallback
}

/** Status HTTP de um erro. */
export const apiErrorStatus = (error: unknown): number | undefined => (error instanceof EngramindError ? error.status : undefined)
