/** @vitest-environment happy-dom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../helpers/framer-motion"
import { channel, fakeSource } from "../helpers/fake-source"
import { EngramindError } from "../../src/core/errors"
import type { HttpMethod } from "../../src/react/lib/api"

vi.mock("framer-motion", () => ({ ...framerMotionMock(), useReducedMotion: () => true }))

import { EngramindProvider, SubscribersCard } from "../../src/react"
import { ImportMemoriesDialog } from "../../src/react/engramind/components/page/memories/ImportMemoriesDialog"

/** Assinantes e Importar memórias (antes em `engramind-flows.test.tsx` do Opex). */
function mount(ui: React.ReactNode, overrides: (method: HttpMethod, path: string, body: unknown) => unknown = () => undefined) {
    const { source, calls } = fakeSource({ channels: [], agents: [], subscriptions: [], memories: [] }, overrides)
    render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <EngramindProvider dataSource={source}>{ui}</EngramindProvider>
        </QueryClientProvider>,
    )
    return calls
}

describe("Assinantes", () => {
    it("erro não vira \"Nenhum assinante\": mostra Tentar novamente", async () => {
        mount(<SubscribersCard channel="eng/global" />, (method, path) => (method === "get" && path === "subscriptions" ? new EngramindError(429, "O Engramind limitou as requisições do app; tente de novo em 5 s.", "ENGRAMIND_RATE_LIMITED", undefined, 5) : undefined))
        expect(await screen.findByRole("button", { name: /Tentar novamente/ }, { timeout: 4000 })).toBeTruthy()
        expect(screen.queryByText("Nenhum assinante")).toBeNull()
        expect(screen.getByText(/tente de novo em 5 s/)).toBeTruthy()
    })
})

describe("Importar memórias", () => {
    const channels = [channel("eng/global")]
    const pick = async (content: string, name = "m.json") => {
        fireEvent.change(document.getElementById("import-file")!, { target: { files: [new File([content], name, { type: "application/json" })] } })
        await screen.findByText(new RegExp(`${name.replace(".", "\\.")}|inválido|limite`))
    }
    const importButton = () => screen.getByRole("button", { name: /Importar$/ })

    it("item inválido bloqueia o envio e aponta o índice", async () => {
        mount(<ImportMemoriesDialog channels={channels} maxBatch={100} onOpenChange={vi.fn()} />)
        await pick('[{"text":"ok"},{"texto":"x"}]')
        expect(await screen.findByText(/Item 2:/)).toBeTruthy()
        expect(importButton().hasAttribute("disabled")).toBe(true)
    })

    it("acima de limits.max_batch bloqueia antes do envio", async () => {
        mount(<ImportMemoriesDialog channels={channels} maxBatch={1} onOpenChange={vi.fn()} />)
        await pick('[{"text":"a"},{"text":"b"}]')
        expect(await screen.findByText(/limite por lote é 1/)).toBeTruthy()
        expect(importButton().hasAttribute("disabled")).toBe(true)
    })

    it("arquivo válido (inclusive JSONL de uma linha) envia canal e itens", async () => {
        const calls = mount(<ImportMemoriesDialog channels={channels} maxBatch={10} onOpenChange={vi.fn()} />, (method, path) => (method === "post" && path === "memories/import" ? { created: [{ index: 0, id: "mem_1" }], duplicates: [] } : undefined))
        await pick('{"text":"Rode só os testes afetados."}\n', "m.jsonl")
        await waitFor(() => expect(importButton().hasAttribute("disabled")).toBe(false))
        fireEvent.click(importButton())
        await waitFor(() => expect(calls.find((call) => call.path === "memories/import")?.body).toEqual({ channel: "eng/global", memories: [expect.objectContaining({ text: "Rode só os testes afetados." })] }))
        expect(await screen.findByText(/1 memória\(s\) criada\(s\)/)).toBeTruthy()
    })
})
