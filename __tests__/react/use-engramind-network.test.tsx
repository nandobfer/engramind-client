/** @vitest-environment happy-dom */

import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { describe, expect, it } from "vitest"
import { agent, channel, fakeSource, memory, subscription } from "../helpers/fake-source"
import { consumerSearchFusion, EngramindProvider, resolveStaleAfterDays, searchFusionOf, toNetworkMemory, useEngramindNetwork, type EngramindMode } from "../../src/react"

/** Dados da rede: referências estáveis, modo app (consumer-settings) e modo gestor (settings). */
function setup(mode: EngramindMode, consumer?: Record<string, unknown>) {
    const { source, calls } = fakeSource(
        { channels: [channel("meu-app/global")], agents: [agent("meu-app", "dev")], subscriptions: [subscription("meu-app/dev", "meu-app/global", ["meu-app/global"])], memories: [memory("m_1", "meu-app/global")] },
        (method, path) => (method === "get" && path === "consumer-settings" && consumer ? consumer : undefined),
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={client}>
            <EngramindProvider dataSource={source} mode={mode} app={mode === "app" ? "meu-app" : null}>
                {children}
            </EngramindProvider>
        </QueryClientProvider>
    )
    return { calls, ...renderHook(() => useEngramindNetwork(), { wrapper }) }
}

describe("useEngramindNetwork", () => {
    it("regressão: re-render sem dados novos devolve as mesmas listas (memórias, canais, apps e categorias)", async () => {
        const { result, rerender } = setup("manager")
        await waitFor(() => expect(result.current.memories).toHaveLength(1))
        const before = result.current
        rerender()
        rerender()
        expect(result.current.memories).toBe(before.memories)
        expect(result.current.channels).toBe(before.channels)
        expect(result.current.rawMemories).toBe(before.rawMemories)
        expect(result.current.apps).toBe(before.apps)
        expect(result.current.categories).toBe(before.categories)
    })

    it("modo gestor: o prazo vem de settings (30 dias na fonte falsa)", async () => {
        const { result, calls } = setup("manager")
        await waitFor(() => expect(result.current.staleAfterDays).toBe(30))
        expect(calls.some((call) => call.path === "consumer-settings")).toBe(false)
    })

    it("modo app: limites, prazo e pesos da busca vêm de consumer-settings; sem eles, 90 dias e 1/1/60", async () => {
        const withValues = setup("app", { memory: { text_min: 3, text_max: 500 }, limits: { max_batch: 20 }, context: {}, channels: [], consolidation: { stale_after_days: 45 }, search: { vector_weight: 2, text_weight: 1, rrf_k: 30 } })
        await waitFor(() => expect(withValues.result.current.staleAfterDays).toBe(45))
        expect(withValues.result.current.searchFusion).toEqual({ vectorWeight: 2, textWeight: 1, k: 30 })
        expect(withValues.result.current.limits).toEqual({ textMin: 3, textMax: 500 })
        expect(withValues.result.current.maxBatch).toBe(20)
        expect(withValues.result.current.apps).toEqual([{ slug: "meu-app", name: "meu-app" }])
        expect(withValues.calls.some((call) => call.path === "settings" || call.path === "apps")).toBe(false)
        const without = setup("app")
        await waitFor(() => expect(without.result.current.memories).toHaveLength(1))
        expect(without.result.current.staleAfterDays).toBe(90)
        expect(without.result.current.searchFusion).toEqual({ vectorWeight: 1, textWeight: 1, k: 60 })
    })
})

describe("autor agente, pesos da busca e prazo", () => {
    it("authorAgent vem de author.agent (app/agente); sem agente, null", () => {
        const base = memory("m", "a") as unknown as Parameters<typeof toNetworkMemory>[0]
        expect(toNetworkMemory({ ...base, author: { app: "opex", app_id: "a", agent: "opex/opex", agent_id: "g" } }).authorAgent).toBe("opex/opex")
        expect(toNetworkMemory({ ...base, author: { app: "opex", app_id: "a", agent: null, agent_id: null } })).toMatchObject({ author: "opex", authorAgent: null })
    })

    it("pesos da fusão: configurações do gestor ou consumer-settings, com o padrão 1/1/60", () => {
        expect(searchFusionOf(() => undefined)).toEqual({ vectorWeight: 1, textWeight: 1, k: 60 })
        const settings: Record<string, unknown> = { "search.vector_weight": 2, "search.rrf_k": 30 }
        expect(searchFusionOf((key) => settings[key])).toEqual({ vectorWeight: 2, textWeight: 1, k: 30 })
        expect(consumerSearchFusion({ search: { text_weight: 3 } } as never)).toEqual({ vectorWeight: 1, textWeight: 3, k: 60 })
    })

    it("prazo: o fixado pelo app vence; depois o do Engramind; senão 90", () => {
        expect(resolveStaleAfterDays(10, 45)).toBe(10)
        expect(resolveStaleAfterDays(undefined, 45)).toBe(45)
        expect(resolveStaleAfterDays(undefined, 0)).toBe(90)
    })
})

describe("refetch sem voltar ao skeleton (OPE-157)", () => {
    it("regressão: depois da primeira carga, um refetch que volta a ter página seguinte mantém isLoading false", async () => {
        let paged = false
        const { source } = fakeSource({ channels: [channel("meu-app/global")], agents: [agent("meu-app", "dev")], subscriptions: [subscription("meu-app/dev", "meu-app/global", ["meu-app/global"])], memories: [memory("m_1", "meu-app/global")] })
        const base = source.request
        // Depois da troca, a 1ª página de memórias aponta para uma 2ª que não responde (busca ainda em andamento).
        source.request = ((method, path, options) => {
            if (paged && method === "get" && path === "memories") {
                const cursor = (options as { params?: { cursor?: string } } | undefined)?.params?.cursor
                if (cursor) return new Promise(() => undefined)
                return Promise.resolve({ memories: [memory("m_1", "meu-app/global")], next_cursor: "c2" })
            }
            return base(method, path, options)
        }) as typeof source.request
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <QueryClientProvider client={client}>
                <EngramindProvider dataSource={source} mode="manager">
                    {children}
                </EngramindProvider>
            </QueryClientProvider>
        )
        const { result } = renderHook(() => useEngramindNetwork(), { wrapper })
        expect(result.current.isLoading).toBe(true)
        await waitFor(() => expect(result.current.isLoading).toBe(false))
        paged = true
        result.current.refetch()
        await waitFor(() => expect(client.getQueryCache().findAll().some((query) => JSON.stringify(query.queryKey).includes("memories") && (query.state.data as { pages: { nextCursor: string | null }[] } | undefined)?.pages[0]?.nextCursor === "c2")).toBe(true))
        expect(result.current.isLoading).toBe(false)
        expect(result.current.memories).toHaveLength(1)
    })
})
