/**
 * Erros do Engramind traduzidos para pt-BR. Decide pelo `code` estável do envelope
 * `{ error: { code, message, details } }`, nunca pela `message`. Os códigos expostos pela lib levam o
 * prefixo `ENGRAMIND_` (ex.: `ENGRAMIND_CHANNEL_SHARED`), e os erros da própria lib também
 * (`ENGRAMIND_UNREACHABLE`, `ENGRAMIND_PROXY_MASKED`, `ENGRAMIND_NOT_CONFIGURED`).
 */

export interface EngramindErrorBody {
    code: string
    message?: string
    details?: unknown
}

export class EngramindError extends Error {
    readonly status: number
    readonly code: string
    readonly details?: unknown
    /** Segundos de `Retry-After` (429). */
    readonly retryAfter: number | null

    constructor(status: number, message: string, code: string, details?: unknown, retryAfter: number | null = null) {
        super(message)
        this.name = "EngramindError"
        this.status = status
        this.code = code
        this.details = details
        this.retryAfter = retryAfter
    }
}

type Details = Record<string, unknown>
const asDetails = (details: unknown): Details => (details && typeof details === "object" ? (details as Details) : {})
const list = (value: unknown) => (Array.isArray(value) ? value.map(String).join(", ") : "")

const MESSAGES: Record<string, (details: Details, retryAfter: string | null) => string> = {
    AUTH_INVALID: () => "O Engramind recusou o token do app (ausente, inválido, expirado, revogado ou de app desativado). Peça um novo token ao gestor e reconfigure o app.",
    SCOPE_REQUIRED: (d) =>
        `O token do app não tem permissão para esta operação${d.required_kind ? ` (exige ${String(d.required_kind)}` : ""}${d.required_scope ? ` com ${String(d.required_scope)})` : d.required_kind ? ")" : ""}.`,
    FOREIGN_APP: () => "Sem acesso: o registro pertence a outro app.",
    CHANNEL_NOT_SUBSCRIBED: (d) => `Sem acesso: o token não alcança o canal${d.channel ? ` ${String(d.channel)}` : ""}.`,
    CHANNEL_SHARED: () => "O canal é assinado por outro app; só dá para editá-lo ou arquivá-lo enquanto só o app que o criou o assina.",
    LAST_ADMIN_TOKEN: () => "A rede ficaria sem nenhum token admin ativo com write. Emita outro token admin antes.",
    SLUG_ALREADY_EXISTS: () => "Já existe um registro com esse slug. Escolha outro.",
    SUBSCRIPTION_EXISTS: () => "O agente já assina esse alvo.",
    CATEGORY_NOT_FOUND: (d) => `Categoria fora da lista${d.valid ? ` (aceitas: ${list(d.valid)})` : ""}${d.index !== undefined ? `; item ${Number(d.index) + 1}` : ""}.`,
    BATCH_TOO_LARGE: (d) => `O lote passa do limite${d.max !== undefined ? ` (${String(d.received)} de no máximo ${String(d.max)})` : ""}. Divida o arquivo.`,
    IDEMPOTENCY_KEY_REQUIRED: () => "A operação exige uma chave de idempotência.",
    IDEMPOTENCY_KEY_CONFLICT: () => "A chave de idempotência já foi usada com outro conteúdo.",
    RATE_LIMITED: (_d, retryAfter) => `O Engramind limitou as requisições do app${retryAfter ? `; tente de novo em ${retryAfter} s` : ""}.`,
    VALIDATION_ERROR: (d) => `O Engramind recusou os dados${d.index !== undefined ? ` (item ${Number(d.index) + 1})` : ""}${d.field ? ` no campo ${String(d.field)}` : ""}.`,
    CHANNEL_NOT_ARCHIVED: () => "Só um canal arquivado pode ser excluído: arquive antes.",
    CHANNEL_ARCHIVED: () => "O canal está arquivado e não recebe escrita: restaure-o antes.",
    CHANNEL_NOT_FOUND: () => "Canal não encontrado no Engramind.",
    APP_NOT_FOUND: () => "App não encontrado no Engramind.",
    AGENT_NOT_FOUND: () => "Agente não encontrado no Engramind.",
    TOKEN_NOT_FOUND: () => "Token não encontrado no Engramind.",
    SUBSCRIPTION_NOT_FOUND: () => "Assinatura não encontrada no Engramind.",
    MEMORY_NOT_FOUND: () => "Memória não encontrada no Engramind.",
    REVISION_NOT_FOUND: () => "A memória não tem essa versão.",
    MEMORY_VERSION_CONFLICT: () => "Esta memória mudou enquanto você editava. Confira a versão atual.",
    MEMORY_DUPLICATE: (d) => `Já existe uma memória com esse texto no canal${d.existing_id ? ` (${String(d.existing_id)})` : ""}.`,
    MEMORY_KEY_EXISTS: () => "Já existe uma memória com essa chave no canal.",
    PAYLOAD_TOO_LARGE: () => "O corpo passou do limite do Engramind.",
    DATABASE_UNAVAILABLE: () => "O banco do Engramind está indisponível. Tente novamente.",
    MIGRATIONS_PENDING: () => "O Engramind tem migrações pendentes e ainda não recebe tráfego. Tente novamente em instantes.",
    REQUEST_TIMEOUT: () => "O Engramind excedeu o tempo limite da requisição. Tente novamente.",
    INTERNAL_ERROR: () => "Falha inesperada no Engramind. Tente novamente.",
    ROUTE_NOT_FOUND: () => "Operação não disponível neste Engramind.",
}

/** Status devolvido ao navegador: falha do próprio serviço vira 502 e token recusado vira 409 (reconfigurar). */
export function clientStatus(status: number): number {
    if (status === 401) return 409
    if (status >= 500) return 502
    return status
}

/**
 * Corpo de um 5xx trocado pelo proxy na frente do Engramind (o Cloudflare substitui o corpo das respostas
 * 5xx pela própria página/JSON): devolve o nome do erro do proxy, quando reconhecido.
 */
export function proxyMaskedError(text: string, json: unknown): string | null {
    if (json && typeof json === "object" && ("ray_id" in json || "error_name" in json || "cloudflare_error" in json)) {
        const name = (json as { error_name?: unknown; title?: unknown }).error_name ?? (json as { title?: unknown }).title
        return typeof name === "string" && name ? name : "cloudflare"
    }
    if (/cloudflare/i.test(text) && /ray id|cf-ray|cloudflare/i.test(text)) return "cloudflare"
    return null
}

const parseRetryAfter = (value: string | null): number | null => {
    if (!value) return null
    const seconds = Number(value)
    if (Number.isFinite(seconds) && seconds >= 0) return seconds
    const date = Date.parse(value)
    return Number.isNaN(date) ? null : Math.max(0, Math.round((date - Date.now()) / 1000))
}

export function toEngramindError(status: number, body: EngramindErrorBody | null, retryAfter: string | null = null, masked: string | null = null): EngramindError {
    if (!body && status >= 500 && masked) {
        return new EngramindError(502, `Um proxy (Cloudflare) escondeu a resposta HTTP ${status} do Engramind (${masked}). Chame a URL de origem do Engramind para ver o motivo.`, "ENGRAMIND_PROXY_MASKED", { status, proxyError: masked })
    }
    const code = body?.code ?? (status === 404 ? "ROUTE_NOT_FOUND" : `HTTP_${status}`)
    const message = MESSAGES[code]?.(asDetails(body?.details), retryAfter) ?? body?.message ?? `O Engramind respondeu HTTP ${status}.`
    return new EngramindError(clientStatus(status), message, `ENGRAMIND_${code}`, body?.details ?? undefined, parseRetryAfter(retryAfter))
}

/** Engramind fora do ar ou inalcançável. */
export const unreachableError = (reason: string) =>
    new EngramindError(503, `Não foi possível falar com o Engramind (${reason}). Confira a URL base e se o serviço está no ar.`, "ENGRAMIND_UNREACHABLE")

export const notConfiguredError = () => new EngramindError(409, "Configure a conexão com o Engramind (URL base e token) no servidor do app.", "ENGRAMIND_NOT_CONFIGURED")

/** Código do Engramind (sem o prefixo) de um erro traduzido. */
export const engramindCodeOf = (error: unknown): string | null => (error instanceof EngramindError && error.code.startsWith("ENGRAMIND_") ? error.code.slice("ENGRAMIND_".length) : null)
