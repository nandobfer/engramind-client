import { vi } from "vitest"
import type { EngramindDataSource, HttpMethod } from "../../src/react/lib/api"

const now = new Date().toISOString()
export const ref = (id: string, slug: string) => ({ id, slug })
export const channel = (slug: string, extra: Record<string, unknown> = {}) => ({ id: `ch_${slug}`, slug, name: slug, description: null, priority: 0, version: 1, created_at: now, archived_at: null, created_by: null, ...extra })
export const agent = (app: string, slug: string, extra: Record<string, unknown> = {}) => ({ id: `ag_${app}_${slug}`, slug, qualified_slug: `${app}/${slug}`, name: `Agente ${slug}`, description: null, app: ref(`app_${app}`, app), created_at: now, disabled_at: null, ...extra })
export const subscription = (agentSlug: string, target: string, reaches: string[], extra: Record<string, unknown> = {}) => {
    const [app, slug] = agentSlug.split("/")
    return { id: `s_${agentSlug}_${target}`, agent: { ...ref(`ag_${app}_${slug}`, slug!), qualified_slug: agentSlug }, target, is_prefix: target.endsWith("*"), mode: "inject", access: null, priority: null, reaches, created_at: now, ...extra }
}
export const memory = (id: string, channelSlug: string, extra: Record<string, unknown> = {}) => ({
    id, channel: channelSlug, channel_id: "ch", title: `Título ${id}`, title_state: "ready", text: `Texto ${id}`, category: "PROJECT_RULES", status: "active", version: 1,
    author: { app: "meu-app", app_id: "app_1", agent: "meu-app/dev", agent_id: "ag_1" }, embedding_state: "ready", retrieval_count: 1, injected_count: 0, last_retrieved_at: null, verified_at: null, stale_candidate: false,
    created_at: now, updated_at: now, archived_at: null, ...extra,
})

export interface FakeData {
    channels: ReturnType<typeof channel>[]
    agents: ReturnType<typeof agent>[]
    subscriptions: ReturnType<typeof subscription>[]
    memories: ReturnType<typeof memory>[]
    apps?: { id: string; slug: string; name: string; description: null; created_at: string; disabled_at: null; webhook: null }[]
    tokens?: unknown[]
}

/** Fonte de dados em memória (sem rede): responde as rotas da lib e registra as mutações. */
export function fakeSource(data: FakeData, overrides: (method: HttpMethod, path: string, body: unknown) => unknown = () => undefined) {
    const calls: { method: HttpMethod; path: string; params?: unknown; body?: unknown }[] = []
    const request = vi.fn(async (method: HttpMethod, path: string, options: { params?: Record<string, unknown>; body?: unknown } = {}) => {
        calls.push({ method, path, params: options.params, body: options.body })
        const custom = overrides(method, path, options.body)
        if (custom instanceof Error) throw custom
        if (custom !== undefined) return custom
        if (method !== "get") return {}
        if (path === "whoami") return { token_id: "tk_app", kind: "app", scopes: ["read", "write", "delete"], app: ref("app_1", "meu-app"), agent: null, operations: [] }
        if (path === "channels") return { channels: data.channels, next_cursor: null }
        if (path === "agents") return { agents: data.agents, next_cursor: null }
        if (path === "subscriptions") return { subscriptions: data.subscriptions, next_cursor: null }
        if (path === "memories") return { memories: data.memories, next_cursor: null }
        if (path === "apps") return { apps: data.apps ?? [], next_cursor: null }
        if (path === "tokens") return { tokens: data.tokens ?? [], next_cursor: null }
        if (path === "settings") return { settings: [{ key: "consolidation.stale_after_days", value: 30 }] }
        if (path === "consumer-settings") return { memory: { text_min: 3, text_max: 200 }, limits: { max_batch: 100 }, context: { budget_tokens: 1, titles_budget_tokens: 1, default_format: "tagged", text_max_chars: 0 }, channels: [] }
        if (path === "categories") return { categories: [{ key: "PROJECT_RULES", label: "Regras", priority: 1 }] }
        return {}
    })
    const source: EngramindDataSource = { request: request as EngramindDataSource["request"] }
    return { source, request, calls }
}
