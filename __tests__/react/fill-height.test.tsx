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

import { AgentUniverse, EngramindNetwork, EngramindProvider, NETWORK_FILL_BLOCK_PROPS, NETWORK_FILL_MIN_HEIGHT, NETWORK_FILL_ROOT_PROPS, NetworkSkeleton, nextFillHeight, viewportFillHeight } from "../../src/react"

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

describe("viewportFillHeight (pura, OPE-151)", () => {
    it("é a altura visível menos o bloco acima do canvas", () => {
        expect(viewportFillHeight({ current: 448, visible: 852, above: 80, min: 320 })).toBe(772)
    })
    it("nunca fica abaixo do mínimo (janela baixa)", () => {
        expect(viewportFillHeight({ current: 448, visible: 300, above: 80, min: 320 })).toBe(320)
    })
    it("é um ponto fixo e ignora diferença de até 1 px", () => {
        expect(viewportFillHeight({ current: 772, visible: 852, above: 80, min: 320 })).toBe(772)
        expect(viewportFillHeight({ current: 772, visible: 853, above: 80, min: 320 })).toBe(772)
    })
})

/** Área que rola de 900 px com padding de 24 px embaixo; o conteúdo é um bloco de 200 px acima do canvas. */
const SCROLLER_HEIGHT = 900
const ABOVE = 200
const CLASS_HEIGHT = 448
/** Card abaixo da rede ("O que é o Engramind") e trilha + filtros acima do canvas dentro do bloco (OPE-151). */
const ABOUT = 300
let barsHeight = 80
let cardOutside = 130
const heightOf = (element: HTMLElement) => (element.style.height ? parseFloat(element.style.height) : CLASS_HEIGHT)
const canvasIn = (root: HTMLElement) => root.querySelector<HTMLElement>("[data-testid=network-canvas], [data-testid=network-skeleton]")

/** Medidas simuladas no protótipo (o happy-dom não as tem como getters substituíveis); removidas depois de cada caso. */
const MEASURES = ["offsetParent", "offsetTop", "offsetHeight", "clientHeight"] as const
let scrollerClientHeight = SCROLLER_HEIGHT
const define = (name: (typeof MEASURES)[number], get: (this: HTMLElement) => unknown) => Object.defineProperty(HTMLElement.prototype, name, { configurable: true, get })

beforeEach(() => {
    window.localStorage.clear()
    scrollerClientHeight = SCROLLER_HEIGHT
    barsHeight = 80
    cardOutside = 130
    define("offsetParent", function () {
        return this.parentElement
    })
    // Só o modo "viewport" lê o topo: o bloco começa depois do título (200) e o canvas depois da trilha e filtros.
    define("offsetTop", function () {
        if (this.hasAttribute("data-network-fill-root")) return ABOVE
        if (this.dataset.testid === "network-canvas" || this.dataset.testid === "network-skeleton") return barsHeight
        return 0
    })
    define("offsetHeight", function () {
        if (this.dataset.testid === "scroller") return SCROLLER_HEIGHT
        // Card-bloco: cabeçalho e avisos em cima, padding e borda embaixo, em volta do canvas.
        if (this.getAttribute("data-network-fill-root") === "block") {
            const canvas = canvasIn(this)
            return cardOutside + (canvas ? heightOf(canvas) : 0)
        }
        if (this.dataset.testid === "content") {
            const canvas = canvasIn(this)
            return ABOVE + (canvas ? heightOf(canvas) : 0) + (this.querySelector("[data-testid=about]") ? ABOUT : 0)
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

/** Página do `/engramind`: área que rola com padding de 24 px em cima e embaixo, título, bloco da rede e o card "O que é". */
function ViewportPage({ children, about = true }: { children: React.ReactNode; about?: boolean }) {
    return (
        <div data-testid="scroller" style={{ overflowY: "auto", paddingTop: "24px", paddingBottom: "24px" }}>
            <div data-testid="content">
                {children}
                {about ? <div data-testid="about" /> : null}
            </div>
        </div>
    )
}

describe("critério aprovado (OPE-151): o bloco da rede ocupa a altura visível da tela", () => {
    it("o canvas tem a área visível menos o padding e a trilha + filtros, ignorando o card abaixo", () => {
        render(
            <ViewportPage>
                <div {...NETWORK_FILL_ROOT_PROPS}>
                    <NetworkSkeleton fill="viewport" />
                </div>
            </ViewportPage>,
        )
        const skeleton = screen.getByTestId("network-skeleton")
        // 900 − 24 − 24 de padding − 80 de trilha e filtros = 772.
        expect(skeleton.style.height).toBe("772px")
        expect(skeleton.getAttribute("data-fill")).toBe("viewport")
    })

    it("regressão: com fill (sobra), o card abaixo encolhe o canvas; com viewport, não", () => {
        const filled = render(
            <ViewportPage>
                <NetworkSkeleton fill />
            </ViewportPage>,
        )
        // Sobra: 900 − 24 de padding embaixo − 200 − 300 do card = 376 (o canvas pequeno da OPE-148).
        expect(screen.getByTestId("network-skeleton").style.height).toBe("376px")
        filled.unmount()
        render(
            <ViewportPage>
                <div {...NETWORK_FILL_ROOT_PROPS}>
                    <NetworkSkeleton fill="viewport" />
                </div>
            </ViewportPage>,
        )
        expect(parseFloat(screen.getByTestId("network-skeleton").style.height)).toBeGreaterThan(376)
    })

    it("sem âncora, o canvas sozinho ocupa a altura visível", () => {
        barsHeight = 0
        render(
            <ViewportPage>
                <NetworkSkeleton fill="viewport" />
            </ViewportPage>,
        )
        expect(screen.getByTestId("network-skeleton").style.height).toBe("852px")
    })

    it("janela baixa: vale o mínimo", () => {
        scrollerClientHeight = 300
        render(
            <ViewportPage>
                <div {...NETWORK_FILL_ROOT_PROPS}>
                    <NetworkSkeleton fill="viewport" />
                </div>
            </ViewportPage>,
        )
        expect(screen.getByTestId("network-skeleton").style.height).toBe(`${NETWORK_FILL_MIN_HEIGHT}px`)
    })

    it("recalcula ao redimensionar a janela e quando a trilha e os filtros mudam de altura", async () => {
        render(
            <ViewportPage>
                <div {...NETWORK_FILL_ROOT_PROPS}>
                    <NetworkSkeleton fill="viewport" />
                </div>
            </ViewportPage>,
        )
        scrollerClientHeight = 700
        window.dispatchEvent(new Event("resize"))
        await waitFor(() => expect(screen.getByTestId("network-skeleton").style.height).toBe("572px"))
        barsHeight = 120
        window.dispatchEvent(new Event("resize"))
        await waitFor(() => expect(screen.getByTestId("network-skeleton").style.height).toBe("532px"))
    })

    it("o EngramindNetwork com fill=\"viewport\" é a âncora e liga o modo no canvas da visão", async () => {
        const view = render(withProvider(<ViewportPage><EngramindNetwork fill="viewport" /></ViewportPage>, "app"))
        await waitFor(() => expect(view.container.querySelector("[data-testid=network-canvas]")).toBeTruthy())
        const canvas = view.container.querySelector<HTMLElement>("[data-testid=network-canvas]")!
        expect(canvas.getAttribute("data-fill")).toBe("viewport")
        expect(canvas.closest("[data-network-fill-root]")).toBeTruthy()
        expect(canvas.style.height).toBe("772px")
    })
})

describe("critério aprovado (OPE-151): o card da rede ocupa a altura visível em todas as telas", () => {
    it("âncora bloco: o card inteiro cabe na área visível, ignorando o conteúdo abaixo", () => {
        render(
            <ViewportPage>
                <div {...NETWORK_FILL_BLOCK_PROPS}>
                    <NetworkSkeleton fill="viewport" />
                </div>
            </ViewportPage>,
        )
        // 900 − 48 de padding − 130 do card fora do canvas = 722.
        expect(screen.getByTestId("network-skeleton").style.height).toBe("722px")
    })

    it("janela baixa: vale o mínimo", () => {
        scrollerClientHeight = 400
        render(
            <ViewportPage>
                <div {...NETWORK_FILL_BLOCK_PROPS}>
                    <NetworkSkeleton fill="viewport" />
                </div>
            </ViewportPage>,
        )
        expect(screen.getByTestId("network-skeleton").style.height).toBe(`${NETWORK_FILL_MIN_HEIGHT}px`)
    })

    it("um aviso que aparece no card encolhe o canvas na mesma medida", async () => {
        render(
            <ViewportPage>
                <div {...NETWORK_FILL_BLOCK_PROPS}>
                    <NetworkSkeleton fill="viewport" />
                </div>
            </ViewportPage>,
        )
        cardOutside = 190
        window.dispatchEvent(new Event("resize"))
        await waitFor(() => expect(screen.getByTestId("network-skeleton").style.height).toBe("662px"))
    })

    it("o AgentUniverse com fill=\"viewport\" num card-bloco tem a altura visível (canvas)", async () => {
        const view = render(
            withProvider(
                <ViewportPage>
                    <div {...NETWORK_FILL_BLOCK_PROPS}>
                        <AgentUniverse agent="opex/dev" fill="viewport" />
                    </div>
                </ViewportPage>,
            ),
        )
        await waitFor(() => expect(screen.getByTestId("memory-node-m_1")).toBeTruthy())
        const canvas = view.container.querySelector<HTMLElement>("[data-testid=network-canvas]")!
        expect(canvas.getAttribute("data-fill")).toBe("viewport")
        expect(canvas.style.height).toBe("722px")
    })

    it("o skeleton de carregamento do AgentUniverse tem a mesma altura", () => {
        render(
            withProvider(
                <ViewportPage>
                    <div {...NETWORK_FILL_BLOCK_PROPS}>
                        <AgentUniverse agent="opex/dev" fill="viewport" />
                    </div>
                </ViewportPage>,
            ),
        )
        const skeleton = screen.getByTestId("network-skeleton")
        expect(skeleton.getAttribute("data-fill")).toBe("viewport")
        expect(skeleton.style.height).toBe("722px")
    })
})
