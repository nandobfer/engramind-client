import { describe, expect, it, vi } from "vitest"
import { createEngramindClient } from "../../src/server/client"
import { createContextCache, invalidatesContext } from "../../src/server/context"
import { engramindMcpConfig } from "../../src/server/mcp"

const view = (version: string) => ({ content: `<memories version="${version}"/>`, version, counts: { full: 1, titles: 0, overflow: 0 }, rendered_tokens: 10, format: "tagged" })

function setup(responses: (() => Response)[]) {
    const fetch = vi.fn(async () => responses.shift()!())
    const client = createEngramindClient({ baseUrl: "https://e.test", token: "agent-token", fetch: fetch as unknown as typeof globalThis.fetch })
    return { fetch, cache: createContextCache({ client: () => client }) }
}

describe("contexto com cache", () => {
    it("revalida com If-None-Match e o 304 devolve o bloco guardado", async () => {
        const { fetch, cache } = setup([() => new Response(JSON.stringify(view("cv_1"))), () => new Response(null, { status: 304 })])
        expect((await cache.getContext("app/dev", { channels: ["b", "a"] })).version).toBe("cv_1")
        const second = await cache.getContext("app/dev", { channels: ["a", "b"] })
        expect(second).toMatchObject({ block: '<memories version="cv_1"/>', source: "live", stale: false })
        expect(((fetch.mock.calls[1] as unknown as [string, RequestInit])[1].headers as Record<string, string>)["If-None-Match"]).toBe('"cv_1"')
    })

    it("Engramind fora do ar: mantém o último bloco (stale)", async () => {
        const { cache } = setup([() => new Response(JSON.stringify(view("cv_2"))), () => new Response(JSON.stringify({ error: { code: "DATABASE_UNAVAILABLE" } }), { status: 503 })])
        await cache.getContext("app/dev")
        const result = await cache.getContext("app/dev")
        expect(result).toMatchObject({ block: '<memories version="cv_2"/>', source: "cache", stale: true })
        expect(result.error).toContain("indisponível")
    })

    it("sem bloco guardado e com falha: vazio, sem lançar", async () => {
        const { cache } = setup([() => new Response(JSON.stringify({ error: { code: "AUTH_INVALID" } }), { status: 401 })])
        expect(await cache.getContext("app/dev")).toMatchObject({ block: "", source: "none", stale: true })
    })

    it("memory.consumed nunca invalida o contexto; os demais memory.* e as assinaturas invalidam", () => {
        expect(invalidatesContext({ type: "memory.consumed" })).toBe(false)
        for (const type of ["memory.created", "memory.updated", "memory.archived", "memory.deleted", "channel.updated", "subscription.updated"]) expect(invalidatesContext({ type })).toBe(true)
        expect(invalidatesContext({ type: "identities.updated" })).toBe(false)
    })

    it("configuração de MCP: POST /mcp com o token do agente e Engramind-Channels", () => {
        expect(engramindMcpConfig({ baseUrl: "https://e.test/", agentToken: "tk", channels: ["app/global", "app/dev"] })).toEqual({ type: "http", url: "https://e.test/mcp", headers: { Authorization: "Bearer tk", "Engramind-Channels": "app/global,app/dev" } })
    })
})
