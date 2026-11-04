/** @vitest-environment happy-dom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../helpers/framer-motion"
import { channel, fakeSource } from "../helpers/fake-source"
import { EngramindError } from "../../src/core/errors"
import type { HttpMethod } from "../../src/react/lib/api"

vi.mock("framer-motion", () => ({ ...framerMotionMock(), useReducedMotion: () => true }))

import { canEditChannel, ChannelPanel, EngramindProvider, type EngramindMode } from "../../src/react"

/**
 * Painel do canal (lib 0.2.0, Engramind 0.13.0): no modo app, Editar só nos canais que o próprio app criou
 * (`created_by`); Excluir de vez continua só do gestor.
 */
function mount(mode: EngramindMode, target: ReturnType<typeof channel>, overrides: (method: HttpMethod, path: string, body: unknown) => unknown = () => undefined) {
    const { source, calls } = fakeSource({ channels: [target], agents: [], subscriptions: [], memories: [] }, overrides)
    const notify = vi.fn()
    render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <EngramindProvider dataSource={source} mode={mode} app={mode === "app" ? "meu-app" : null} notify={notify}>
                <ChannelPanel channel={target as never} onOpenChange={vi.fn()} />
            </EngramindProvider>
        </QueryClientProvider>,
    )
    return { calls, notify }
}

const editButton = () => screen.queryByRole("button", { name: /Editar/ })

describe("ChannelPanel: Editar e Excluir de vez por modo", () => {
    it("modo app + canal criado pelo próprio app: mostra Editar e salvar manda PATCH channels/<slug>", async () => {
        const { calls } = mount("app", channel("meu-app/global", { created_by: "meu-app", name: "Global" }))
        fireEvent.click(await screen.findByRole("button", { name: /Editar/ }))
        fireEvent.change(await screen.findByLabelText(/Nome/), { target: { value: "Global do app" } })
        fireEvent.click(screen.getByRole("button", { name: "Salvar" }))
        await waitFor(() => expect(calls.find((call) => call.method === "patch")).toMatchObject({ path: "channels/meu-app%2Fglobal", body: expect.objectContaining({ name: "Global do app" }) }))
    })

    it("modo app + canal de outro app ou do admin: não mostra Editar", async () => {
        mount("app", channel("outro/global", { created_by: "outro" }))
        expect(await screen.findByRole("button", { name: /Arquivar/ })).toBeTruthy()
        expect(editButton()).toBeNull()
        expect(canEditChannel(false, { created_by: null }, "meu-app")).toBe(false)
        expect(canEditChannel(false, { created_by: "meu-app" }, null)).toBe(false)
    })

    it("modo app + canal arquivado criado pelo app: Restaurar sim, Excluir de vez não", async () => {
        mount("app", channel("meu-app/velho", { created_by: "meu-app", archived_at: "2026-11-01T00:00:00Z" }))
        expect(await screen.findByRole("button", { name: /Restaurar/ })).toBeTruthy()
        expect(screen.queryByRole("button", { name: /Excluir de vez/ })).toBeNull()
    })

    it("gestor: Editar em qualquer canal e Excluir de vez no arquivado", async () => {
        mount("manager", channel("outro/velho", { created_by: "outro", archived_at: "2026-11-01T00:00:00Z" }))
        expect(await screen.findByRole("button", { name: /Editar/ })).toBeTruthy()
        expect(screen.getByRole("button", { name: /Excluir de vez/ })).toBeTruthy()
    })

    it("409 CHANNEL_SHARED na edição: mensagem pt-BR e o diálogo continua aberto", async () => {
        const shared = new EngramindError(409, "O canal é assinado por outro app; só dá para editá-lo ou arquivá-lo enquanto só o app que o criou o assina.", "ENGRAMIND_CHANNEL_SHARED")
        const { notify } = mount("app", channel("meu-app/global", { created_by: "meu-app" }), (method) => (method === "patch" ? shared : undefined))
        fireEvent.click(await screen.findByRole("button", { name: /Editar/ }))
        fireEvent.click(await screen.findByRole("button", { name: "Salvar" }))
        await waitFor(() => expect(notify).toHaveBeenCalledWith("error", shared.message, undefined))
        expect(screen.getByText("Editar canal meu-app/global")).toBeTruthy()
    })
})
