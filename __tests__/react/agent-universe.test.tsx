/** @vitest-environment happy-dom */

import React from "react"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../helpers/framer-motion"
import { flowItems, xyflowMock } from "../helpers/xyflow"
import { agent, channel, fakeSource, memory, subscription, type FakeData } from "../helpers/fake-source"

/**
 * Universo do agente (OPE-130): D10 componente extraído e exportado (`AgentUniverse`), D11 "Nova memória"
 * com a escolha do canal e D12 o nome completo e destacado no hover da partícula.
 */

vi.mock("framer-motion", () => ({ ...framerMotionMock(), useReducedMotion: () => false }))
vi.mock("@xyflow/react", () => xyflowMock())
vi.mock("../../src/react/lib/live", () => ({ isLiveAvailable: () => false, subscribeLive: () => () => undefined }))
// Select do Radix trocado por botões simples (o happy-dom não abre o portal do Radix).
vi.mock("../../src/react/components/ui/select", () => {
    const Ctx = React.createContext<{ value: string; onValueChange: (value: string) => void }>({ value: "", onValueChange: () => undefined })
    return {
        Select: ({ value, onValueChange, children }: { value: string; onValueChange: (value: string) => void; children: React.ReactNode }) => <Ctx.Provider value={{ value: value ?? "", onValueChange }}>{children}</Ctx.Provider>,
        SelectTrigger: ({ id, "aria-label": label }: { id?: string; "aria-label"?: string }) => <span role="combobox" id={id} aria-label={label ?? id} data-value={React.useContext(Ctx).value} />,
        SelectValue: () => null,
        SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
        SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => {
            const ctx = React.useContext(Ctx)
            return <button type="button" data-option={value} onClick={() => ctx.onValueChange(value)}>{children}</button>
        },
    }
})

import { AgentUniverse, EngramindProvider } from "../../src/react"

const LONG_TITLE = "Nunca se candidate a vagas presenciais fora de São Paulo nem a contratos PJ abaixo do piso combinado"

const base = (): FakeData => ({
    channels: [channel("opex"), channel("agentes/rotineiros/global"), channel("agentes/rotineiros/vagas"), channel("velho", { archived_at: new Date().toISOString() }), channel("outro")],
    agents: [agent("opex", "rotineiro-vagas")],
    subscriptions: [
        subscription("opex/rotineiro-vagas", "opex", ["opex"]),
        subscription("opex/rotineiro-vagas", "agentes/rotineiros/global", ["agentes/rotineiros/global"]),
        subscription("opex/rotineiro-vagas", "agentes/rotineiros/vagas", ["agentes/rotineiros/vagas"]),
        subscription("opex/rotineiro-vagas", "velho", ["velho"]),
    ],
    memories: [memory("m_1", "opex"), memory("m_2", "agentes/rotineiros/vagas", { title: LONG_TITLE }), memory("m_3", "outro")],
})

function mount(data: FakeData, props: { agent?: string; defaultCreateChannel?: string } = {}) {
    const { source, calls } = fakeSource(data)
    const view = render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <EngramindProvider dataSource={source} mode="manager" app={null} events="/api/engramind/events" notify={vi.fn()}>
                <AgentUniverse agent={props.agent ?? "opex/rotineiro-vagas"} defaultCreateChannel={props.defaultCreateChannel} />
            </EngramindProvider>
        </QueryClientProvider>,
    )
    return { ...view, calls }
}

beforeEach(() => {
    window.localStorage.clear()
})

describe("critério aprovado (OPE-130, D10): AgentUniverse", () => {
    it("centro no agente e só as memórias dos canais que ele assina", async () => {
        mount(base())
        await waitFor(() => expect(screen.getByTestId("memory-node-m_1")).toBeTruthy())
        expect(screen.getByTestId("memory-node-m_2")).toBeTruthy()
        expect(screen.queryByTestId("memory-node-m_3")).toBeNull()
    })

    it("agente que não existe no Engramind: estado vazio, sem voltar de página", async () => {
        mount(base(), { agent: "opex/rotineiro-nao-existe" })
        await waitFor(() => expect(screen.getByTestId("agent-universe-missing")).toBeTruthy())
        expect(screen.getByText("Agente não encontrado no Engramind")).toBeTruthy()
    })
})

describe("critério aprovado (OPE-130, D11): Nova memória escolhe o canal", () => {
    it("abre com o canal inicial e grava no canal escolhido", async () => {
        const { calls } = mount(base(), { defaultCreateChannel: "agentes/rotineiros/vagas" })
        fireEvent.click(await screen.findByRole("button", { name: "Nova memória" }))
        const select = await screen.findByRole("combobox", { name: "Canal" })
        expect(select.getAttribute("data-value")).toBe("agentes/rotineiros/vagas")
        const options = [...document.querySelectorAll("[data-option]")].map((item) => item.getAttribute("data-option"))
        expect(options).toEqual(expect.arrayContaining(["agentes/rotineiros/vagas", "opex", "agentes/rotineiros/global"]))
        expect(options).not.toContain("velho")
        fireEvent.click(document.querySelector('[data-option="agentes/rotineiros/global"]')!)
        expect(select.getAttribute("data-value")).toBe("agentes/rotineiros/global")
        fireEvent.change(screen.getByLabelText("Texto da memória"), { target: { value: "Prefira vagas remotas sempre" } })
        await waitFor(() => expect((screen.getByRole("button", { name: /Salvar/ }) as HTMLButtonElement).disabled).toBe(false))
        fireEvent.click(screen.getByRole("button", { name: /Salvar/ }))
        await waitFor(() => expect(calls.find((call) => call.method === "post" && call.path === "memories")).toBeTruthy())
        expect(calls.find((call) => call.method === "post" && call.path === "memories")!.body).toMatchObject({ channel: "agentes/rotineiros/global", text: "Prefira vagas remotas sempre" })
    })
})

describe("critério aprovado (OPE-130, D12): nome completo e destacado no hover", () => {
    it("sem hover, o nome curto cortado; com o cursor, o nome completo destacado no lugar; ao sair, volta", async () => {
        mount(base())
        const node = await screen.findByTestId("memory-node-m_2")
        expect(screen.getByTestId("memory-short-label-m_2").className).toContain("truncate")
        expect(screen.queryByTestId("memory-hover-label")).toBeNull()
        const before = flowItems.nodes
        fireEvent.pointerOver(node, { pointerType: "mouse" })
        const label = await screen.findByTestId("memory-hover-label")
        expect(label.textContent).toBe(LONG_TITLE)
        expect(label.className).not.toContain("truncate")
        expect(label.className).toContain("font-medium")
        expect(label.className).toContain("pointer-events-none")
        expect(screen.queryByTestId("memory-short-label-m_2")).toBeNull()
        fireEvent.pointerOut(node, { pointerType: "mouse" })
        await waitFor(() => expect(screen.queryByTestId("memory-hover-label")).toBeNull())
        expect(screen.getByTestId("memory-short-label-m_2")).toBeTruthy()
        // Regressão do piscar: o hover não recria os objetos dos nodes.
        expect(flowItems.nodes.find((item) => item.id === "m_2")).toBe(before.find((item) => item.id === "m_2"))
    })

    it("toque não mostra o rótulo do hover; com o card aberto, também não", async () => {
        mount(base())
        const node = await screen.findByTestId("memory-node-m_2")
        fireEvent.pointerOver(node, { pointerType: "touch" })
        expect(screen.queryByTestId("memory-hover-label")).toBeNull()
        fireEvent.pointerOver(node, { pointerType: "mouse" })
        await screen.findByTestId("memory-hover-label")
        act(() => {
            fireEvent.click(node.closest("[data-node-id]")!)
        })
        await waitFor(() => expect(screen.queryByTestId("memory-hover-label")).toBeNull())
    })
})
