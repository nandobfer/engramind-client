/** @vitest-environment happy-dom */

import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Brain } from "lucide-react"
import { framerMotionMock } from "../helpers/framer-motion"
import { xyflowMock } from "../helpers/xyflow"
import { agent, channel, fakeSource, memory, subscription } from "../helpers/fake-source"

/**
 * Cena de carregamento das redes (OPE-157): nó do agente no centro, partículas convergindo, pulsos e os anéis
 * do universo; anúncio ao leitor de tela; com movimento reduzido, a cena fica parada e o layout se mantém.
 */

let reducedMotion = false
vi.mock("framer-motion", () => ({ ...framerMotionMock(), useReducedMotion: () => reducedMotion }))
vi.mock("@xyflow/react", () => xyflowMock())
vi.mock("../../src/react/lib/live", () => ({ isLiveAvailable: () => false, subscribeLive: () => () => undefined }))

import { AgentUniverse, DEFAULT_UNIVERSE_LAYOUT, EngramindProvider, NetworkSkeleton } from "../../src/react"
import { QueryBoundary } from "../../src/react/engramind/components/shared/QueryBoundary"
import { NetworkRevealContext, shouldReveal, useNetworkReveal } from "../../src/react/engramind/components/network/reveal"

beforeEach(() => {
    reducedMotion = false
})

describe("NetworkSkeleton: cena animada (OPE-157)", () => {
    it("anuncia o carregamento ao leitor de tela, com a cena escondida dele", () => {
        render(<NetworkSkeleton />)
        const skeleton = screen.getByTestId("network-skeleton")
        expect(skeleton.getAttribute("role")).toBe("status")
        expect(skeleton.getAttribute("aria-busy")).toBe("true")
        expect(skeleton.querySelector(".sr-only")?.textContent).toBe("Carregando a rede de memórias…")
        expect(screen.getByTestId("network-loading-scene").hasAttribute("aria-hidden")).toBe(true)
    })

    it("nó central, halo, partículas, pulsos e os anéis do universo; sem barras cinzas", () => {
        const { container } = render(<NetworkSkeleton />)
        expect(screen.getAllByTestId("network-skeleton-agent")).toHaveLength(1)
        expect(screen.getByTestId("network-loading-halo")).toBeTruthy()
        expect(screen.getAllByTestId("network-loading-particle").length).toBeGreaterThanOrEqual(8)
        expect(screen.getAllByTestId("network-loading-pulse")).toHaveLength(2)
        expect(screen.getAllByTestId("network-skeleton-channel")).toHaveLength(3)
        expect(container.querySelector(".animate-pulse")).toBeNull()
        expect(screen.getByTestId("network-loading-scene").getAttribute("data-motion")).toBe("on")
    })

    it("movimento reduzido: sem partículas nem pulsos, com o nó e os anéis no mesmo lugar", () => {
        reducedMotion = true
        render(<NetworkSkeleton />)
        expect(screen.queryAllByTestId("network-loading-particle")).toHaveLength(0)
        expect(screen.queryAllByTestId("network-loading-pulse")).toHaveLength(0)
        expect(screen.getByTestId("network-skeleton-agent")).toBeTruthy()
        expect(screen.getAllByTestId("network-skeleton-channel")).toHaveLength(3)
        expect(screen.getByTestId("network-loading-scene").getAttribute("data-motion")).toBe("off")
    })

    it("os anéis seguem o layout de universo configurado no provider", () => {
        const { source } = fakeSource({ channels: [], agents: [], subscriptions: [], memories: [] })
        render(
            <EngramindProvider dataSource={source} universeLayout={{ ...DEFAULT_UNIVERSE_LAYOUT, firstRadius: 100, ringGap: 40 }}>
                <NetworkSkeleton />
            </EngramindProvider>,
        )
        expect(screen.getAllByTestId("network-skeleton-channel").map((ring) => ring.style.width)).toEqual(["200px", "280px", "360px"])
    })

    it("com o agente, o centro mostra o ícone dele (agentIcon do provider); sem agente, o robô genérico", () => {
        const agentIcon = vi.fn(() => Brain)
        const { source } = fakeSource({ channels: [], agents: [], subscriptions: [], memories: [] })
        const { unmount } = render(
            <EngramindProvider dataSource={source} agentIcon={agentIcon}>
                <NetworkSkeleton agent="opex/dev" />
            </EngramindProvider>,
        )
        expect(agentIcon).toHaveBeenCalledWith("opex/dev")
        expect(screen.getByTestId("network-skeleton-agent").querySelector("svg")?.getAttribute("class")).toContain("lucide-brain")
        unmount()
        render(<NetworkSkeleton />)
        expect(screen.getByTestId("network-skeleton-agent").querySelector("svg")?.getAttribute("class")).toContain("lucide-bot")
    })

    it("o AgentUniverse carregando repassa o agente ao skeleton", () => {
        const { source } = fakeSource({ channels: [channel("opex")], agents: [agent("opex", "dev")], subscriptions: [subscription("opex/dev", "opex", ["opex"])], memories: [memory("m_1", "opex")] })
        render(
            <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
                <EngramindProvider dataSource={source} mode="manager">
                    <AgentUniverse agent="opex/dev" />
                </EngramindProvider>
            </QueryClientProvider>,
        )
        expect(screen.getByTestId("network-skeleton-agent").getAttribute("data-agent")).toBe("opex/dev")
    })
})

describe("entrada suave depois do skeleton (OPE-157)", () => {
    function Probe() {
        return <span data-testid="probe">{useNetworkReveal() ? "reveal" : "plain"}</span>
    }

    it("o conteúdo que substitui o skeleton entra com a revelação; montado direto, não", () => {
        const { rerender } = render(
            <QueryBoundary isLoading error={null} onRetry={() => undefined} skeleton={<span data-testid="sk" />}>
                <Probe />
            </QueryBoundary>,
        )
        expect(screen.getByTestId("sk")).toBeTruthy()
        rerender(
            <QueryBoundary isLoading={false} error={null} onRetry={() => undefined} skeleton={<span data-testid="sk" />}>
                <Probe />
            </QueryBoundary>,
        )
        expect(screen.getByTestId("probe").textContent).toBe("reveal")
        render(
            <QueryBoundary isLoading={false} error={null} onRetry={() => undefined} skeleton={<span />}>
                <span data-testid="direct">
                    <Probe />
                </span>
            </QueryBoundary>,
        )
        expect(screen.getByTestId("direct").textContent).toBe("plain")
    })

    it("borda: um canvas que monta bem depois da troca (outro universo) não repete o fade", () => {
        expect(shouldReveal(null, 1000)).toBe(false)
        expect(shouldReveal(1000, 1200)).toBe(true)
        expect(shouldReveal(1000, 5000)).toBe(false)
        render(
            <NetworkRevealContext.Provider value={Date.now() - 60_000}>
                <Probe />
            </NetworkRevealContext.Provider>,
        )
        expect(screen.getByTestId("probe").textContent).toBe("plain")
    })
})
