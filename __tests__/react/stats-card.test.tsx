/** @vitest-environment happy-dom */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../helpers/framer-motion"
import { xyflowMock } from "../helpers/xyflow"
import { agent, channel, fakeSource, memory, subscription } from "../helpers/fake-source"

/** Card de estatísticas da rede (OPE-142): em qualquer largura começa recolhido, abre e recolhe, e o ao vivo não o recolhe. */

vi.mock("framer-motion", () => ({ ...framerMotionMock(), useReducedMotion: () => true }))
vi.mock("@xyflow/react", () => xyflowMock())
const mobile = vi.hoisted(() => ({ value: false }))
vi.mock("../../src/react/hooks/useMediaQuery", async (original) => ({ ...(await original<object>()), useIsMobile: () => mobile.value }))
const live = vi.hoisted(() => ({ listeners: [] as ((event: unknown) => void)[] }))
vi.mock("../../src/react/lib/live", () => ({
    isLiveAvailable: () => true,
    subscribeLive: (_url: string, subscription: { onEvent?: (event: unknown) => void }) => {
        if (subscription.onEvent) live.listeners.push(subscription.onEvent)
        return () => undefined
    },
}))

import { EngramindNetwork, EngramindProvider } from "../../src/react"
import { StatsCard } from "../../src/react/engramind/components/network/StatsCard"
import { NetworkSkeleton } from "../../src/react/engramind/components/network/NetworkSkeleton"

const data = () => ({
    channels: [channel("meu-app/global"), channel("meu-app/dev")],
    agents: [agent("meu-app", "dev")],
    subscriptions: [subscription("meu-app/dev", "meu-app/global", ["meu-app/global"]), subscription("meu-app/dev", "meu-app/dev", ["meu-app/dev"])],
    memories: [memory("m_1", "meu-app/global"), memory("m_2", "meu-app/dev")],
})
const mount = (search = "") => {
    window.history.replaceState(null, "", `/${search}`)
    const { source } = fakeSource(data())
    return render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <EngramindProvider dataSource={source} mode="app" app="meu-app" events="/api/engramind/events">
                <EngramindNetwork />
            </EngramindProvider>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    mobile.value = false
    live.listeners = []
    window.localStorage.clear()
})
afterEach(cleanup)

describe("card de estatísticas recolhível", () => {
    it.each([
        ["visão inicial da rede", "", /meu-app/],
        ["universo do canal", "?universo=canal:meu-app/global", /Universo do canal/],
        ["universo do agente", "?universo=agente:meu-app/dev", /Universo do agente/],
    ])("%s: no desktop abre recolhido, com o título e o resumo no botão", async (_name, search, title) => {
        mount(search)
        const toggle = await screen.findByTestId("network-stats-toggle")
        expect(screen.queryByTestId("network-stats")).toBeNull()
        expect(toggle.getAttribute("aria-expanded")).toBe("false")
        expect(toggle.textContent).toMatch(title)
        expect(toggle.textContent).toMatch(/·/)
    })

    it("abre com o clique (números e listas) e recolhe pelo botão de recolher, com o foco acompanhando", async () => {
        mount("?universo=agente:meu-app/dev")
        fireEvent.click(await screen.findByTestId("network-stats-toggle"))
        const card = await screen.findByTestId("network-stats")
        expect(card.querySelector('[data-testid="stat-active"]')?.getAttribute("data-value")).toBe("2")
        expect(card.querySelector('[data-testid="channel-legend"]')).toBeTruthy()
        const close = screen.getByRole("button", { name: "Recolher estatísticas" })
        expect(close.getAttribute("aria-expanded")).toBe("true")
        await waitFor(() => expect(document.activeElement).toBe(close))
        fireEvent.click(close)
        const toggle = await screen.findByTestId("network-stats-toggle")
        expect(screen.queryByTestId("network-stats")).toBeNull()
        await waitFor(() => expect(document.activeElement).toBe(toggle))
    })

    it("o foco não é roubado antes de qualquer clique", async () => {
        mount()
        const toggle = await screen.findByTestId("network-stats-toggle")
        expect(document.activeElement).not.toBe(toggle)
    })

    it("aberto, eventos ao vivo não recolhem o card", async () => {
        mount()
        fireEvent.click(await screen.findByTestId("network-stats-toggle"))
        await screen.findByTestId("network-stats")
        act(() => live.listeners.forEach((listener) => listener({ type: "memory.created", channel: "meu-app/global", memory: "m_3" })))
        act(() => live.listeners.forEach((listener) => listener({ type: "memory.consumed", channel: "meu-app/global", memoryIds: ["m_1"], consumption: "c1", operation: "get_context", agent: "meu-app/dev" })))
        await waitFor(() => expect(screen.getByTestId("stat-live").getAttribute("data-value")).toBe("1"))
        expect(screen.getByTestId("network-stats")).toBeTruthy()
        expect(screen.queryByTestId("network-stats-toggle")).toBeNull()
    })

    it("trocar de universo monta o card de novo, recolhido", async () => {
        mount()
        fireEvent.click(await screen.findByTestId("network-stats-toggle"))
        await screen.findByTestId("network-stats")
        fireEvent.click(await screen.findByTestId("agent-node-meu-app/dev"))
        expect(await screen.findByTestId("network-stats-toggle")).toBeTruthy()
        expect(screen.queryByTestId("network-stats")).toBeNull()
    })

    it("no celular o botão mostra só o resumo", async () => {
        mobile.value = true
        mount()
        const toggle = await screen.findByTestId("network-stats-toggle")
        expect(toggle.textContent).toMatch(/1 agente/)
        expect(toggle.textContent).not.toMatch(/meu-app/)
    })

    it("sem resumo, o botão mostra o título", () => {
        render(<StatsCard title="Rede" rows={[{ label: "Ativas", value: 3 }]} />)
        expect(screen.getByTestId("network-stats-toggle").textContent).toBe("Rede")
    })

    it("skeleton: só o botão recolhido, sem o card aberto nem a faixa reservada", () => {
        const { container } = render(<NetworkSkeleton />)
        expect(screen.getByTestId("network-skeleton-stats-toggle")).toBeTruthy()
        expect(container.querySelector("section")).toBeNull()
        expect(container.innerHTML).not.toContain("right-72")
    })
})
