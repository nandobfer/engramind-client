/** @vitest-environment happy-dom */

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../helpers/framer-motion"
import { agent, channel, fakeSource, subscription, type FakeData } from "../helpers/fake-source"
import { EngramindError } from "../../src/core/errors"
import type { HttpMethod } from "../../src/react/lib/api"

vi.mock("framer-motion", () => ({ ...framerMotionMock(), useReducedMotion: () => true }))

import { EngramindAppSettings, EngramindProvider, generateWebhookSecret } from "../../src/react"

const data = (): FakeData => ({
    channels: [channel("meu-app/global"), channel("compartilhado/geral")],
    agents: [agent("meu-app", "dev")],
    subscriptions: [subscription("meu-app/dev", "meu-app/global", ["meu-app/global"])],
    memories: [],
    tokens: [],
})

function mount(overrides: (method: HttpMethod, path: string, body: unknown) => unknown = () => undefined, tab?: "agents" | "channels" | "tokens" | "webhook") {
    const { source, calls } = fakeSource(data(), overrides)
    const notify = vi.fn()
    render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <EngramindProvider dataSource={source} app="meu-app" notify={notify}>
                <EngramindAppSettings defaultTab={tab} />
            </EngramindProvider>
        </QueryClientProvider>,
    )
    return { calls, notify }
}

beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn(async () => undefined) } })
})

describe("configuração do app", () => {
    it("mostra só as abas do app (Agentes, Canais, Tokens de agente, Webhook), sem funções de gestor", async () => {
        mount()
        expect(await screen.findByRole("tab", { name: /Agentes \(1\)/ })).toBeTruthy()
        expect(screen.getByRole("tab", { name: /Canais \(2\)/ })).toBeTruthy()
        expect(screen.getByRole("tab", { name: /Tokens de agente/ })).toBeTruthy()
        expect(screen.getByRole("tab", { name: /Webhook do app/ })).toBeTruthy()
        expect(screen.queryByText(/Tokens administrativos|Apps x canais|Provedores/)).toBeNull()
    })

    it("token de agente: o segredo aparece uma única vez, com Copiar", async () => {
        const { calls } = mount((method, path) => (method === "post" && path === "tokens" ? { token: { id: "tk_9", kind: "agent" }, secret: "eng.tk_9.segredo-unico" } : undefined), "tokens")
        fireEvent.click((await screen.findAllByRole("button", { name: /Emitir token/ }))[0]!)
        const dialog = await screen.findByRole("dialog")
        fireEvent.click(within(dialog).getByRole("button", { name: /^Emitir/ }))
        expect(await screen.findByText("eng.tk_9.segredo-unico")).toBeTruthy()
        expect(calls.find((call) => call.method === "post" && call.path === "tokens")?.body).toMatchObject({ kind: "agent", agent: "meu-app/dev" })
        fireEvent.click(screen.getByRole("button", { name: /Copiar/ }))
        await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith("eng.tk_9.segredo-unico"))
    })

    it("arquivar um canal compartilhado mostra o 409 CHANNEL_SHARED em pt-BR; sem Editar nem Excluir de vez", async () => {
        const shared = new EngramindError(409, "O canal é assinado por outro app e não pode ser arquivado por este app.", "ENGRAMIND_CHANNEL_SHARED")
        const { notify } = mount((method, path) => (method === "post" && path === "channels/compartilhado%2Fgeral/archive" ? shared : undefined), "channels")
        fireEvent.click(await screen.findByRole("button", { name: "Abrir o canal compartilhado/geral" }))
        const sheet = await screen.findByRole("dialog")
        expect(within(sheet).queryByRole("button", { name: /Editar/ })).toBeNull()
        fireEvent.click(within(sheet).getByRole("button", { name: /Arquivar/ }))
        fireEvent.click(await screen.findByRole("button", { name: "Arquivar" }))
        await waitFor(() => expect(notify).toHaveBeenCalledWith("error", "O canal é assinado por outro app e não pode ser arquivado por este app.", undefined))
    })

    it("webhook: grava a URL e o segredo gerado aparece uma vez", async () => {
        const { calls } = mount((method, path) => (path === "apps/meu-app" && method === "get" ? new EngramindError(403, "Sem acesso", "ENGRAMIND_SCOPE_REQUIRED") : method === "put" ? {} : undefined), "webhook")
        fireEvent.change(await screen.findByPlaceholderText("https://meu-app.com/api/engramind/webhook"), { target: { value: "https://meu-app.test/api/engramind/webhook" } })
        fireEvent.click(screen.getByRole("button", { name: /Gerar novo segredo/ }))
        await waitFor(() => expect(calls.some((call) => call.method === "put")).toBe(true))
        const put = calls.find((call) => call.method === "put")!
        expect(put.path).toBe("apps/meu-app/webhook")
        const secret = (put.body as { secret: string }).secret
        expect(secret).toMatch(/^[0-9a-f]{64}$/)
        expect(await screen.findByText(secret)).toBeTruthy()
        fireEvent.click(screen.getByRole("button", { name: "Já copiei" }))
        await waitFor(() => expect(screen.queryByText(secret)).toBeNull())
    })

    it("salvar a URL sem segredo conhecido gera um (a URL exige segredo)", async () => {
        const { calls } = mount((method, path) => (path === "apps/meu-app" && method === "get" ? new EngramindError(403, "Sem acesso", "ENGRAMIND_SCOPE_REQUIRED") : method === "put" ? { id: "app_1", slug: "meu-app", webhook: { url: "https://meu-app.test/hook", secret: { configured: true, updated_at: new Date().toISOString() } } } : undefined), "webhook")
        fireEvent.change(await screen.findByPlaceholderText("https://meu-app.com/api/engramind/webhook"), { target: { value: "https://meu-app.test/hook" } })
        fireEvent.click(screen.getByRole("button", { name: /Salvar webhook/ }))
        await waitFor(() => expect(calls.some((call) => call.method === "put")).toBe(true))
        expect(calls.find((call) => call.method === "put")!.body).toMatchObject({ url: "https://meu-app.test/hook", secret: expect.stringMatching(/^[0-9a-f]{64}$/) })
        expect(await screen.findByText("Segredo configurado")).toBeTruthy()
    })

    it("o segredo gerado tem 64 caracteres hexadecimais (dentro de 32 a 256)", () => {
        expect(generateWebhookSecret()).toMatch(/^[0-9a-f]{64}$/)
        expect(generateWebhookSecret()).not.toBe(generateWebhookSecret())
    })
})
