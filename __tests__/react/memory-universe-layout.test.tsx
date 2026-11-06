/** @vitest-environment happy-dom */

import { render } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../helpers/framer-motion"
import { flowItems, xyflowMock } from "../helpers/xyflow"
import { fakeSource } from "../helpers/fake-source"

/** Universo com o layout configurável (OPE-142): o provider leva a configuração e o `layoutConfig` da prévia a sobrepõe. */

vi.mock("framer-motion", () => ({ ...framerMotionMock(), useReducedMotion: () => false }))
vi.mock("@xyflow/react", () => xyflowMock())
vi.mock("../../src/react/lib/live", () => ({ isLiveAvailable: () => false, subscribeLive: () => () => undefined }))

import { EngramindProvider, MemoryUniverse, type UniverseLayoutConfig } from "../../src/react"
import type { NetworkMemory } from "../../src/react/engramind/network/types"

const NOW = Date.parse("2026-11-01T12:00:00Z")
const memories = (total: number): NetworkMemory[] =>
    Array.from({ length: total }, (_, index) => ({
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
    }))

const actions = { onActive: vi.fn(), onPin: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), readOnly: true }

function mount(props: { providerLayout?: Partial<UniverseLayoutConfig>; layoutConfig?: Partial<UniverseLayoutConfig>; total?: number }) {
    const { source } = fakeSource({ channels: [], agents: [], subscriptions: [], memories: [] })
    return render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <EngramindProvider dataSource={source} mode="manager" universeLayout={props.providerLayout}>
                <MemoryUniverse center={{ kind: "channel", id: "opex", label: "opex" }} memories={memories(props.total ?? 30)} staleAfterDays={90} actions={actions} layoutConfig={props.layoutConfig} />
            </EngramindProvider>
        </QueryClientProvider>,
    )
}

const radius = (id: string) => {
    const node = flowItems.nodes.find((item) => item.id === id) as unknown as { position: { x: number; y: number } }
    return Math.hypot(node.position.x, node.position.y)
}

describe("MemoryUniverse com o layout configurável", () => {
    it("sem configuração usa o padrão: a mais nova no raio 150 (anéis concêntricos)", () => {
        mount({})
        expect(Math.round(radius("m0"))).toBe(150)
        expect(radius("m29")).toBeGreaterThan(radius("m0"))
    })

    it("o layout do provider vale para o universo (mais novas por fora)", () => {
        mount({ providerLayout: { order: "newest-outside", firstRadius: 200 } })
        expect(Math.round(radius("m29"))).toBe(200)
        expect(radius("m0")).toBeGreaterThan(radius("m29"))
    })

    it("o layoutConfig do universo sobrepõe o do provider (prévia da configuração)", () => {
        mount({ providerLayout: { order: "newest-outside" }, layoutConfig: { order: "newest-inside", firstRadius: 120 } })
        expect(Math.round(radius("m0"))).toBe(120)
    })

    it("valor inválido no provider cai no padrão", () => {
        mount({ providerLayout: { slot: 1 } })
        expect(Math.round(radius("m0"))).toBe(150)
    })

    it("particleMinPx e particleMaxPx chegam às partículas", () => {
        mount({ providerLayout: { particleMinPx: 20, particleMaxPx: 40 } })
        const node = flowItems.nodes.find((item) => item.id === "m0") as unknown as { data: { visual: { size: number } } }
        expect(node.data.visual.size).toBe(20)
    })
})
