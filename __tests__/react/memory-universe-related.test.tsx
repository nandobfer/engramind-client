/** @vitest-environment happy-dom */

import { act, fireEvent, render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../helpers/framer-motion"
import { flowItems, xyflowMock } from "../helpers/xyflow"
import { fakeSource } from "../helpers/fake-source"

/** Universo com `links = related` (OPE-164): arestas entre similares, links ao centro por `authorLinks` e objetos estáveis. */

vi.mock("framer-motion", () => ({ ...framerMotionMock(), useReducedMotion: () => false }))
vi.mock("@xyflow/react", () => xyflowMock())
vi.mock("../../src/react/lib/live", () => ({ isLiveAvailable: () => false, subscribeLive: () => () => undefined }))

import { EngramindProvider, MemoryUniverse, type RelatedMap, type UniverseLayoutConfig } from "../../src/react"
import type { NetworkMemory } from "../../src/react/engramind/network/types"

const NOW = Date.parse("2026-11-01T12:00:00Z")
const memory = (index: number, extra: Partial<NetworkMemory> = {}): NetworkMemory => ({
    id: `m${index}`,
    channel: "opex",
    title: `Memória ${index}`,
    text: "texto",
    category: "fact",
    status: "active",
    version: 1,
    createdAt: new Date(NOW - index * 86_400_000).toISOString(),
    updatedAt: new Date(NOW - index * 86_400_000).toISOString(),
    retrievals: 0,
    injections: 0,
    lastRetrievedAt: null,
    verifiedAt: null,
    stale: false,
    author: null,
    ...extra,
})
const MEMORIES = [memory(0, { authorAgent: "opex/dev" }), memory(1), memory(2), memory(3, { status: "archived" }), memory(4)]
const RELATED: RelatedMap = new Map([
    ["m0", [{ id: "m1", score: 0.9 }, { id: "m2", score: 0.8 }, { id: "m4", score: 0.7 }]],
    ["m1", [{ id: "m0", score: 0.9 }]],
    ["m2", [{ id: "m3", score: 0.99 }]],
])
const actions = { onActive: vi.fn(), onPin: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), readOnly: true }

function mount(layout: Partial<UniverseLayoutConfig>, center: { kind: "agent" | "channel"; id: string } = { kind: "agent", id: "opex/dev" }, related: RelatedMap | null = RELATED) {
    const { source } = fakeSource({ channels: [], agents: [], subscriptions: [], memories: [] })
    return render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <EngramindProvider dataSource={source} mode="manager" universeLayout={layout} relatedMemories={related ?? undefined}>
                <MemoryUniverse center={{ ...center, label: "centro" }} memories={MEMORIES} staleAfterDays={90} actions={actions} channelColors={new Map([["opex", "var(--chart-2)"]])} />
            </EngramindProvider>
        </QueryClientProvider>,
    )
}
const edgeIds = (type: string) => flowItems.edges.filter((edge) => edge.type === type).map((edge) => edge.id)
const authored = () => flowItems.edges.filter((edge) => edge.type === "orbit" && (edge.data as { authored?: boolean }).authored).map((edge) => edge.id)

describe("MemoryUniverse com links entre similares", () => {
    it("modo center (padrão): todas com link ao centro, nenhuma aresta entre similares, destaque do autor", () => {
        mount({})
        expect(edgeIds("orbit")).toHaveLength(MEMORIES.length)
        expect(edgeIds("related")).toEqual([])
        expect(authored()).toEqual(["orbit:m0"])
    })

    it("modo center com authorLinks desligado: o link da memória do agente fica igual aos demais", () => {
        mount({ authorLinks: false })
        expect(edgeIds("orbit")).toHaveLength(MEMORIES.length)
        expect(authored()).toEqual([])
    })

    it("modo related: arestas até relatedMax, uma por par, inativas fora; só o link destacado ao centro", () => {
        mount({ links: "related", relatedMax: 2 })
        expect(edgeIds("related")).toEqual(["related:m0|m1", "related:m0|m2"])
        expect(edgeIds("orbit")).toEqual(["orbit:m0"])
        expect(authored()).toEqual(["orbit:m0"])
    })

    it("modo related com authorLinks desligado: nenhum link ao centro", () => {
        mount({ links: "related", authorLinks: false })
        expect(edgeIds("orbit")).toEqual([])
        expect(edgeIds("related")).toEqual(["related:m0|m1", "related:m0|m2", "related:m0|m4"])
    })

    it("universo do canal: nenhum link ao centro e as arestas no roxo primário", () => {
        mount({ links: "related" }, { kind: "channel", id: "opex" })
        expect(edgeIds("orbit")).toEqual([])
        for (const edge of flowItems.edges) expect((edge.data as { color?: string }).color).toBe("var(--color-primary)")
    })

    it("sem similares a rede desenha sem arestas", () => {
        mount({ links: "related" }, undefined, null)
        expect(edgeIds("related")).toEqual([])
        expect(edgeIds("orbit")).toEqual(["orbit:m0"])
    })

    it("passar o cursor e abrir o card reaproveitam os mesmos objetos de nós e arestas", () => {
        mount({ links: "related" })
        const nodes = [...flowItems.nodes]
        const edges = [...flowItems.edges]
        fireEvent.pointerOver(screen.getByTestId("memory-node-m1"))
        act(() => fireEvent.click(screen.getByTestId("memory-node-m1")))
        flowItems.nodes.forEach((node, index) => expect(node).toBe(nodes[index]))
        flowItems.edges.forEach((edge, index) => expect(edge).toBe(edges[index]))
    })
})
