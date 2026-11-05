/** @vitest-environment happy-dom */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../helpers/framer-motion"
import { xyflowMock } from "../helpers/xyflow"
import { agent, channel, fakeSource, memory, subscription, type FakeData } from "../helpers/fake-source"
import type { LiveEvent } from "../../src/core/events"

vi.mock("framer-motion", () => ({ ...framerMotionMock(), useReducedMotion: () => false }))
vi.mock("@xyflow/react", () => xyflowMock())
const live = vi.hoisted(() => ({ listeners: [] as ((event: LiveEvent) => void)[], reconnects: [] as (() => void)[] }))
vi.mock("../../src/react/lib/live", () => ({
    isLiveAvailable: () => true,
    subscribeLive: (_url: string, subscription: { onEvent?: (event: LiveEvent) => void; onReconnect?: () => void }) => {
        if (subscription.onEvent) live.listeners.push(subscription.onEvent)
        if (subscription.onReconnect) live.reconnects.push(subscription.onReconnect)
        return () => {
            live.listeners = live.listeners.filter((listener) => listener !== subscription.onEvent)
        }
    },
}))

import { EngramindNetwork, EngramindProvider, type PartialMessages } from "../../src/react"

const base = (): FakeData => ({
    channels: [channel("meu-app/global"), channel("meu-app/dev"), channel("meu-app/vazio")],
    agents: [agent("meu-app", "dev")],
    subscriptions: [subscription("meu-app/dev", "meu-app/global", ["meu-app/global"]), subscription("meu-app/dev", "meu-app/dev", ["meu-app/dev"]), subscription("meu-app/dev", "meu-app/vazio", ["meu-app/vazio"])],
    memories: [memory("m_1", "meu-app/global"), memory("m_2", "meu-app/dev")],
})

function mount(data: FakeData, options: { mode?: "app" | "manager"; messages?: PartialMessages; onConfigure?: () => void } = {}) {
    const { source, calls } = fakeSource(data)
    const notify = vi.fn()
    const view = render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <EngramindProvider dataSource={source} mode={options.mode ?? "app"} app={options.mode === "manager" ? null : "meu-app"} events="/api/engramind/events" notify={notify} messages={options.messages} onConfigure={options.onConfigure}>
                <EngramindNetwork />
            </EngramindProvider>
        </QueryClientProvider>,
    )
    return { ...view, calls, notify }
}
const emit = (event: LiveEvent) => act(() => live.listeners.forEach((listener) => listener(event)))

beforeEach(() => {
    live.listeners = []
    live.reconnects = []
    window.localStorage.clear()
    window.history.replaceState(null, "", "/")
})

describe("rede no modo app", () => {
    it("a visão inicial é a rede Agentes x canais do app, sem Apps x canais nem apps de fora", async () => {
        const { calls } = mount(base())
        expect(await screen.findByTestId("agent-node-meu-app/dev")).toBeTruthy()
        expect(screen.queryByTestId(/^app-node-/)).toBeNull()
        expect(calls.some((call) => call.path === "apps")).toBe(false)
        expect(calls.some((call) => call.path === "settings")).toBe(false)
        expect(calls.find((call) => call.path === "agents")?.params).toMatchObject({ app: "meu-app" })
    })

    it("canal sem memórias fica fora da rede, na lista \"Sem memórias (N)\"", async () => {
        mount(base())
        await screen.findByTestId("agent-node-meu-app/dev")
        expect(screen.queryByTestId("channel-node-meu-app/vazio")).toBeNull()
        expect(screen.getByTestId("empty-channels").textContent).toContain("Sem memórias (1)")
    })

    it("app sem agentes ativos: estado vazio com a ação de configurar (texto sobrescrito pelo app)", async () => {
        const onConfigure = vi.fn()
        mount({ ...base(), agents: [agent("meu-app", "dev", { disabled_at: new Date().toISOString() })] }, { onConfigure, messages: { "network.noAgents.title": "Nenhum robô ligado" } })
        expect(await screen.findByText("Nenhum robô ligado")).toBeTruthy()
        expect(screen.getByText("Crie ou ative um agente deste app na configuração do Engramind.")).toBeTruthy()
        fireEvent.click(screen.getAllByRole("button", { name: "Configurar" })[0]!)
        expect(onConfigure).toHaveBeenCalled()
    })

    it("um consumo (três eventos por canal) pulsa uma vez; sem agente ou com memória não carregada, nada", async () => {
        mount(base())
        await screen.findByTestId("agent-node-meu-app/dev")
        const consumed = (channelSlug: string, ids: string[], extra: Partial<LiveEvent> = {}): LiveEvent => ({ type: "memory.consumed", channel: channelSlug, memoryIds: ids, consumption: "cns_1", operation: "get_context", agent: "meu-app/dev", ...extra })
        emit(consumed("meu-app/global", ["m_1"]))
        emit(consumed("meu-app/dev", ["m_2"]))
        emit(consumed("meu-app/global", ["m_1"]))
        await waitFor(() => expect(screen.getByTestId("stat-live").getAttribute("data-value")).toBe("1"), { timeout: 2000 })
        emit(consumed("meu-app/global", ["m_1"], { agent: null, consumption: "cns_2" }))
        emit(consumed("meu-app/global", ["m_desconhecida"], { consumption: "cns_3" }))
        await new Promise((resolve) => setTimeout(resolve, 600))
        expect(screen.getByTestId("stat-live").getAttribute("data-value")).toBe("1")
    })

    it("consumo de um agente de outro app num canal visível pulsa o canal (conta uma vez)", async () => {
        mount(base())
        await screen.findByTestId("agent-node-meu-app/dev")
        emit({ type: "memory.consumed", channel: "meu-app/global", memoryIds: ["m_1"], consumption: "cns_9", operation: "search_memories", agent: "outro/bot" })
        await waitFor(() => expect(screen.getByTestId("stat-live").getAttribute("data-value")).toBe("1"), { timeout: 2000 })
    })
})

describe("critério aprovado (OPE-130, D10/D11): universo do agente na rede", () => {
    it("?universo=agente: mostra as memórias dos canais do agente pelo AgentUniverseView, com \"Nova memória\"", async () => {
        window.history.replaceState(null, "", "/?universo=agente:meu-app/dev")
        mount(base())
        await waitFor(() => expect(screen.getByTestId("memory-node-m_1")).toBeTruthy())
        expect(screen.getByTestId("memory-node-m_2")).toBeTruthy()
        expect(screen.getByRole("button", { name: "Nova memória" })).toBeTruthy()
    })
})

describe("rede no modo gestor", () => {
    it("a visão inicial é Apps x canais", async () => {
        const data = { ...base(), apps: [{ id: "app_1", slug: "meu-app", name: "Meu app", description: null, created_at: "", disabled_at: null, webhook: null }] }
        mount(data, { mode: "manager" })
        expect(await screen.findByTestId("app-node-meu-app")).toBeTruthy()
    })
})
