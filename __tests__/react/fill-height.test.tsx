/** @vitest-environment happy-dom */

import React from "react"
import { render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../helpers/framer-motion"
import { xyflowMock } from "../helpers/xyflow"
import { agent, channel, fakeSource, memory, subscription, type FakeData } from "../helpers/fake-source"

/**
 * Altura "preencher" das redes (OPE-148): o canvas cresce até o fim da área que rola (sem faixa vazia
 * embaixo), encolhe até o mínimo quando a página transborda e o `EngramindNetwork` liga o modo em todas as
 * visões. O happy-dom não calcula layout: as medidas da área e do conteúdo são simuladas.
 */

vi.mock("framer-motion", () => ({ ...framerMotionMock(), useReducedMotion: () => false }))
vi.mock("@xyflow/react", () => xyflowMock())
vi.mock("../../src/react/lib/live", () => ({ isLiveAvailable: () => false, subscribeLive: () => () => undefined }))

import { AgentUniverse, EngramindNetwork, EngramindProvider, NETWORK_FILL_MIN_HEIGHT, NetworkSkeleton, nextFillHeight } from "../../src/react"

describe("nextFillHeight (pura)", () => {
    it("cresce exatamente a sobra abaixo do conteúdo", () => {
        expect(nextFillHeight({ current: 448, available: 900, content: 672, min: 320 })).toBe(676)
    })
    it("encolhe quando o conteúdo transborda, nunca abaixo do mínimo", () => {
        expect(nextFillHeight({ current: 676, available: 900, content: 1000, min: 320 })).toBe(576)
        expect(nextFillHeight({ current: 676, available: 600, content: 2000, min: 320 })).toBe(320)
    })
    it("é um ponto fixo e ignora diferença de até 1 px", () => {
        expect(nextFillHeight({ current: 676, available: 900, content: 900, min: 320 })).toBe(676)
        expect(nextFillHeight({ current: 676, available: 900, content: 901, min: 320 })).toBe(676)
    })
})

/** Área que rola de 900 px com padding de 24 px embaixo; o conteúdo é um bloco de 200 px acima do canvas. */
const SCROLLER_HEIGHT = 900
const ABOVE = 200
const CLASS_HEIGHT = 448
const heightOf = (element: HTMLElement) => (element.style.height ? parseFloat(element.style.height) : CLASS_HEIGHT)
const canvasIn = (root: HTMLElement) => root.querySelector<HTMLElement>("[data-testid=network-canvas], [data-testid=network-skeleton]")

/** Medidas simuladas no protótipo (o happy-dom não as tem como getters substituíveis); removidas depois de cada caso. */
const MEASURES = ["offsetParent", "offsetTop", "offsetHeight", "clientHeight"] as const
let scrollerClientHeight = SCROLLER_HEIGHT
const define = (name: (typeof MEASURES)[number], get: (this: HTMLElement) => unknown) => Object.defineProperty(HTMLElement.prototype, name, { configurable: true, get })

beforeEach(() => {
    window.localStorage.clear()
    scrollerClientHeight = SCROLLER_HEIGHT
    define("offsetParent", function () {
        return this.parentElement
    })
    define("offsetTop", () => 0)
    define("offsetHeight", function () {
        if (this.dataset.testid === "scroller") return SCROLLER_HEIGHT
        if (this.dataset.testid === "content") {
            const canvas = canvasIn(this)
            return ABOVE + (canvas ? heightOf(canvas) : 0)
        }
        return heightOf(this)
    })
    define("clientHeight", function () {
        return this.dataset.testid === "scroller" ? scrollerClientHeight : 0
    })
})
afterEach(() => {
    for (const name of MEASURES) delete (HTMLElement.prototype as unknown as Record<string, unknown>)[name]
})

function Page({ children }: { children: React.ReactNode }) {
    return (
        <div data-testid="scroller" style={{ overflowY: "auto", paddingBottom: "24px" }}>
            <div data-testid="content">{children}</div>
        </div>
    )
}

const data = (): FakeData => ({
    channels: [channel("opex"), channel("agentes/dev/global"), channel("agentes/dev/central/a"), channel("agentes/dev/central/b")],
    agents: [agent("opex", "dev")],
    subscriptions: [subscription("opex/dev", "opex", ["opex"]), subscription("opex/dev", "agentes/dev/*", ["agentes/dev/global", "agentes/dev/central/a", "agentes/dev/central/b"])],
    memories: [memory("m_1", "opex"), memory("m_2", "agentes/dev/global"), memory("m_3", "agentes/dev/central/a"), memory("m_4", "agentes/dev/central/b")],
})

function withProvider(node: React.ReactNode, mode: "app" | "manager" = "manager") {
    const { source } = fakeSource(data())
    return (
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <EngramindProvider dataSource={source} mode={mode} app={mode === "manager" ? null : "opex"} events="/api/engramind/events" notify={vi.fn()}>
                {node}
            </EngramindProvider>
        </QueryClientProvider>
    )
}

describe("critério aprovado (OPE-148): a rede ocupa toda a altura disponível", () => {
    it("regressão: com fill, o skeleton cresce até o fim da área que rola (antes ficava na altura fixa)", () => {
        render(
            <Page>
                <NetworkSkeleton fill />
            </Page>,
        )
        // 900 de área − 24 de padding − 200 acima = 676.
        expect(screen.getByTestId("network-skeleton").style.height).toBe("676px")
    })

    it("sem fill, mantém a altura da classe (compatível com a 0.6.0)", () => {
        render(
            <Page>
                <NetworkSkeleton />
            </Page>,
        )
        expect(screen.getByTestId("network-skeleton").style.height).toBe("")
        expect(screen.getByTestId("network-skeleton").hasAttribute("data-fill")).toBe(false)
    })

    it("o mínimo vale quando a página não tem sobra", () => {
        scrollerClientHeight = 300
        render(
            <Page>
                <NetworkSkeleton fill />
            </Page>,
        )
        expect(screen.getByTestId("network-skeleton").style.height).toBe(`${NETWORK_FILL_MIN_HEIGHT}px`)
    })

    it("o universo do agente com fill preenche a altura (canvas e skeleton)", async () => {
        const view = render(withProvider(<Page><AgentUniverse agent="opex/dev" fill /></Page>))
        await waitFor(() => expect(screen.getByTestId("memory-node-m_1")).toBeTruthy())
        const canvas = view.container.querySelector<HTMLElement>("[data-testid=network-canvas]")!
        expect(canvas.getAttribute("data-fill")).toBe("true")
        expect(canvas.style.height).toBe("676px")
    })

    it("o EngramindNetwork com fill liga o modo no canvas da visão", async () => {
        const view = render(withProvider(<Page><EngramindNetwork fill className="min-h-0" /></Page>, "app"))
        await waitFor(() => expect(view.container.querySelector("[data-testid=network-canvas]")).toBeTruthy())
        expect(view.container.querySelector("[data-testid=network-canvas]")!.getAttribute("data-fill")).toBe("true")
    })
})

describe("critério aprovado (OPE-148): includeChannel restringe o universo do agente", () => {
    it("só as memórias dos canais aceitos aparecem", async () => {
        const include = (slug: string) => slug === "opex" || slug === "agentes/dev/global" || slug === "agentes/dev/central/a"
        render(withProvider(<AgentUniverse agent="opex/dev" includeChannel={include} />))
        await waitFor(() => expect(screen.getByTestId("memory-node-m_3")).toBeTruthy())
        expect(screen.getByTestId("memory-node-m_1")).toBeTruthy()
        expect(screen.getByTestId("memory-node-m_2")).toBeTruthy()
        expect(screen.queryByTestId("memory-node-m_4")).toBeNull()
    })

    it("sem filtro, mostra todos os canais assinados", async () => {
        render(withProvider(<AgentUniverse agent="opex/dev" />))
        await waitFor(() => expect(screen.getByTestId("memory-node-m_4")).toBeTruthy())
        expect(screen.getByTestId("memory-node-m_3")).toBeTruthy()
    })
})
