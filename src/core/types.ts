/**
 * Formatos devolvidos pela API do Engramind (contrato 0.12.0, `docs/openapi.json` do repositório
 * `nandobfer/engramind`). Só os campos que a lib usa; o resto passa adiante sem tipagem.
 */

export interface Ref {
    id: string
    slug: string
}

export type EngramindTokenKind = "admin" | "agent" | "app"

export interface WhoAmI {
    token_id: string
    kind: EngramindTokenKind
    scopes: string[]
    app: Ref
    agent: Ref | null
    operations: string[]
}

export interface EngramindApp {
    id: string
    slug: string
    name: string
    description: string | null
    created_at: string
    disabled_at: string | null
    webhook: { url: string; secret: { configured: boolean; updated_at: string | null } } | null
}

export interface EngramindAgent {
    id: string
    slug: string
    qualified_slug: string
    name: string
    description: string | null
    app: Ref
    created_at: string
    disabled_at: string | null
}

export interface EngramindToken {
    id: string
    prefix: string
    kind: EngramindTokenKind
    scopes: string[]
    app: Ref
    agent: Ref | null
    label: string | null
    status: "active" | "expired" | "revoked"
    created_at: string
    expires_at: string | null
    revoked_at: string | null
    last_used_at: string | null
}

export interface IssuedToken {
    token: EngramindToken
    secret?: string | null
}

export interface SettingMeta {
    key: string
    value: unknown
    default: unknown
    type: string
    description: string
    channel_override: boolean
    choices?: string[] | null
    min?: number | null
    max?: number | null
    secret?: boolean
    configured?: boolean | null
    updated_at?: string | null
    updated_by_app?: string | null
}

export interface ChannelSettingMeta {
    key: string
    type: string
    description: string
    value: unknown
    global: unknown
    override: unknown
    min?: number | null
    max?: number | null
}

export interface ChannelSettingsView {
    channel: string
    channel_id: string
    settings: ChannelSettingMeta[]
}

export interface Category {
    key: string
    label: string
    priority: number
}

export interface EngramindChannel {
    id: string
    slug: string
    name: string
    description: string | null
    priority: number
    version: number
    created_at: string
    archived_at: string | null
}

export interface ChannelStats {
    channel: string
    channel_id: string
    memories: { active: number; archived: number; permanent: number; total: number }
    by_category: Record<string, number> | { category: string; count: number }[]
    pending: { embedding: number; title: number }
    retrievals: number
    last_memory_at: string | null
    version: number
}

export interface EngramindSubscription {
    id: string
    agent: Ref & { qualified_slug?: string }
    target: string
    is_prefix: boolean
    mode: "inject" | "search" | "manage"
    access: string[] | null
    priority: number | null
    reaches: string[]
    created_at: string
}

export interface Author {
    app: string | null
    app_id: string | null
    agent: string | null
    agent_id: string | null
}

export interface EngramindMemory {
    id: string
    channel: string
    channel_id: string
    title: string | null
    title_state: "pending" | "ready" | "fallback"
    text: string
    category: string
    status: "active" | "permanent" | "archived"
    version: number
    author: Author
    origin?: { source: string; label?: string | null } | null
    embedding_state: "pending" | "ready" | "failed" | "off"
    retrieval_count: number
    /** Entradas no contexto (gravado em lote; pode atrasar alguns segundos). */
    injected_count?: number
    last_retrieved_at?: string | null
    verified_at?: string | null
    /** Sem uso há mais de `consolidation.stale_after_days` (candidata a esquecimento). */
    stale_candidate?: boolean
    importance?: number | null
    created_at: string
    updated_at: string
    archived_at: string | null
}

export interface MemoryRevision {
    version: number
    text: string
    title: string | null
    category: string
    status: string
    reason: string | null
    author: Author
    created_at: string
}

export interface SearchResults {
    mode: "hybrid" | "text"
    results: { memory: EngramindMemory; rank: number; score: number }[]
}

/** Resposta de `create_memory`/`update_memory`. */
export interface MemoryWrite {
    memory: EngramindMemory
    duplicate: boolean
    similar: { id: string; text?: string; title?: string | null; score?: number }[]
}

/** `GET /v1/context` (o `content` é texto em `markdown`/`tagged`). */
export interface ContextView {
    content: string
    version: string
    counts: { full: number; titles: number; overflow: number }
    rendered_tokens: number
    format: string
    /** Só com `focus` (0.11.0): como o foco foi aplicado. `text`/`none` = degradado (não entra em cache). */
    focus_mode?: "hybrid" | "text" | "none" | null
}

/** `POST /v1/hints` (0.11.0): só título, canal e nota; nunca o texto. */
export interface EngramindHint {
    id: string
    title: string
    channel: string
    score: number
    method: "vector" | "text"
    duplicate: boolean
}

/** `POST /v1/consolidation/run`: o plano (`dry_run`) ou os jobs enfileirados. */
export interface ConsolidationPlan {
    channel: string
    skipped: Record<string, string>
    duplicates: { keep: string; archive: string; similarity?: number }[]
    classify: string[]
    stale: { flag: string[]; clear: string[]; archive: string[] }
}

export interface ConsolidationRun {
    dry_run: boolean
    channels: ConsolidationPlan[]
    jobs: { channel: string; job_id: number; already_queued: boolean }[]
}

export interface ImportResult {
    created: { index: number; id: string }[]
    duplicates: { index: number; existing_id: string }[]
}

export interface EngramindJob {
    id: number | string
    kind: string
    state: string
    attempts: number
    outcome: string | null
    last_error: string | null
    payload: unknown
    created_at: string
    run_after: string | null
    finished_at: string | null
}

export interface LlmCall {
    id: number | string
    at: string
    purpose: string
    provider: string
    model: string
    outcome: string
    input_tokens: number | null
    output_tokens: number | null
    cost_usd: number | null
    duration_ms: number | null
    error: string | null
}

export interface UsageReport {
    group_by: string
    since: string
    until: string
    total: { requests: number; memories: number; rendered_tokens: number }
    rows: { key: string; label: string | null; requests: number; memories: number; rendered_tokens: number }[]
}

export interface AuditEvent {
    id: number | string
    at: string
    action: string
    entity: string
    entity_id: string | null
    app_id: string | null
    agent_id: string | null
    token_id: string | null
    before: unknown
    after: unknown
}

/** Estado do modelo local de embedding (download e carga fora da requisição, Engramind 0.10.0). */
export interface LocalModelStatus {
    model: string
    state: "idle" | "downloading" | "loading" | "ready" | "failed"
    started_at: string | null
    /** Tempo decorrido; em `ready` e `failed`, quanto levou. */
    elapsed_ms: number | null
    /** Motivo da falha (`failed`); nova tentativa 30 s depois, na próxima chamada. */
    error: string | null
}

export interface EngramindStatus {
    version: string
    uptime_seconds: number
    database: { status: string; size_bytes: number; migrations?: unknown }
    backup: { enabled: boolean; status: "ok" | "fail" | "skip"; detail: string | null; replica_age_seconds: number | null; last_replica_at: string | null; checked_at: string | null }
    counts: Record<string, number>
    queue: { pending: number; failed: number; by_kind: { kind: string; state: string; count: number }[] }
    redator: { enabled: boolean; configured: boolean; missing: string[]; provider: string | null; model: string | null; last_24h?: { calls: number; failures: number; cost_usd: number | null } }
    embedding: { enabled?: boolean; configured?: boolean; provider: string | null; model: string | null; model_id: string | null; dimensions: number | null; state: "off" | "ready" | "reindexing" | "failed"; total: number | null; done: number | null; missing?: string[]; reindex_started_at: string | null; local?: LocalModelStatus | null }
    webhooks: { enabled: boolean; apps: number; pending: number; delivered_24h: number; failed_24h: number }
    retention: { last_run_at: string; removed?: Record<string, number> } | null
    consolidation?: { enabled_channels: number; schedule: string; queued: number; running: number; last_scheduled_at?: string | null; next_run_at?: string | null; last_24h?: Record<string, number> } | null
}

/** Página de uma lista paginada por cursor (`next_cursor = null` na última). */
export interface CursorPage<T> {
    items: T[]
    nextCursor: string | null
}


/** `get_consumer_settings`: o que a interface do consumidor precisa sem token admin. */
export interface ConsumerSettings {
    memory: { text_min: number; text_max: number }
    limits: { max_batch: number }
    context: { budget_tokens: number; titles_budget_tokens: number; default_format: string; text_max_chars: number }
    channels: { channel: string; memory_text_max: number; budget_tokens: number; category_priorities: Record<string, number>; text_max_chars: number }[]
    /**
     * Prazo de desuso e pesos da busca: pedidos ao Engramind para o modo app (ver
     * `docs/engramind-consumer-settings.md`). Até lá a lib usa os padrões (90 dias, 1/1/60).
     */
    consolidation?: { stale_after_days?: number }
    search?: { vector_weight?: number; text_weight?: number; rrf_k?: number }
}
