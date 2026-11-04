/** @vitest-environment happy-dom */

import { act, render } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { describe, expect, it, vi } from "vitest"
import type { LiveEvent } from "../../src/core/events"

const live = vi.hoisted(() => ({ onEvent: null as ((event: LiveEvent) => void) | null, onReconnect: null as (() => void) | null, url: "" }))
vi.mock("../../src/react/lib/live", () => ({
    subscribeLive: (url: string, subscription: { onEvent?: (event: LiveEvent) => void; onReconnect?: () => void }) => {
        live.url = url
        live.onEvent = subscription.onEvent ?? null
        live.onReconnect = subscription.onReconnect ?? null
        return () => undefined
    },
}))

import { areasForEvent, EngramindProvider, mergeMessages, useEngramindRealtime, type EngramindDataSource } from "../../src/react"

function Probe() {
    useEngramindRealtime()
    return null
}

describe("tempo real pelo SSE", () => {
    it("memory.consumed não invalida nada; memory.* invalida memórias e canais; reconectar relê tudo", () => {
        expect(areasForEvent("memory.consumed")).toEqual([])
        expect(areasForEvent("memory.updated")).toEqual(expect.arrayContaining(["memories", "channels"]))
        expect(areasForEvent("subscription.updated")).toEqual(expect.arrayContaining(["subscriptions", "agents"]))
        const client = new QueryClient()
        const invalidate = vi.spyOn(client, "invalidateQueries")
        const source: EngramindDataSource = { request: vi.fn() as EngramindDataSource["request"] }
        render(
            <QueryClientProvider client={client}>
                <EngramindProvider dataSource={source} events="/api/engramind/events">
                    <Probe />
                </EngramindProvider>
            </QueryClientProvider>,
        )
        expect(live.url).toBe("/api/engramind/events")
        act(() => live.onEvent?.({ type: "memory.consumed", channel: "a", memoryIds: ["m_1"], agent: "app/dev" }))
        expect(invalidate).not.toHaveBeenCalled()
        act(() => live.onEvent?.({ type: "memory.created", channel: "a", memoryIds: ["m_1"] }))
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ["engramind", "memories"] })
        invalidate.mockClear()
        act(() => live.onReconnect?.())
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ["engramind"] })
    })

    it("settings.updated (Engramind 0.13.0 manda as chaves de get_consumer_settings ao app) relê consumer-settings", () => {
        expect(areasForEvent("settings.updated")).toEqual(expect.arrayContaining(["consumer-settings", "categories"]))
        const client = new QueryClient()
        const invalidate = vi.spyOn(client, "invalidateQueries")
        const source: EngramindDataSource = { request: vi.fn() as EngramindDataSource["request"] }
        render(
            <QueryClientProvider client={client}>
                <EngramindProvider dataSource={source} mode="app" app="meu-app" events="/api/engramind/events">
                    <Probe />
                </EngramindProvider>
            </QueryClientProvider>,
        )
        act(() => live.onEvent?.({ type: "settings.updated", channel: null, keys: ["consolidation.stale_after_days", "search.rrf_k"] }))
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ["engramind", "consumer-settings"] })
    })

    it("textos: chave sobrescrita vale e chave ausente usa o padrão pt-BR", () => {
        const messages = mergeMessages({ "network.configure": "Ajustar" })
        expect(messages["network.configure"]).toBe("Ajustar")
        expect(messages["network.backToNetwork"]).toBe("Voltar à rede")
    })
})
