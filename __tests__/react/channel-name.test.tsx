/** @vitest-environment happy-dom */

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { fakeSource } from "../helpers/fake-source"
import { ChannelDisplayName, ChannelLabelsProvider, ChannelName, EngramindProvider, type ChannelLabel } from "../../src/react"

const slug = "meu-app/campanhas/6ae2827b3a8b66d141966501/jogadores"
const labels = new Map<string, ChannelLabel>([[slug, { title: "Águas de Prata · Jogadores", hint: "Campanha Águas de Prata", prefix: "meu-app/campanhas/" }]])

function mount(children: React.ReactNode) {
    const { source } = fakeSource({ channels: [], agents: [], subscriptions: [], memories: [] })
    render(
        <EngramindProvider dataSource={source} mode="app" app="meu-app" channelLabels={labels}>
            <ChannelLabelsProvider>{children}</ChannelLabelsProvider>
        </EngramindProvider>,
    )
}

describe("ChannelName e ChannelDisplayName com prefix no rótulo", () => {
    it("duas linhas: o prefix do rótulo em cima e o título embaixo, sem o id do meio do slug", () => {
        mount(<ChannelName slug={slug} />)
        const name = screen.getByTestId(`channel-name-${slug}`)
        expect(screen.getByTestId("channel-name-prefix").textContent).toBe("meu-app/campanhas/")
        expect(screen.getByTestId("channel-name-title").textContent).toBe("Águas de Prata · Jogadores")
        expect(name.textContent).not.toContain("6ae2827b3a8b66d141966501")
    })

    it("uma linha: prefix + título, com o slug inteiro na dica", () => {
        mount(<ChannelDisplayName slug={slug} />)
        const name = screen.getByText("meu-app/campanhas/Águas de Prata · Jogadores")
        expect(name.getAttribute("title")).toBe(`Campanha Águas de Prata · ${slug}`)
    })
})
