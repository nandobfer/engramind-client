import { describe, expect, it, vi } from "vitest"
import { createEngramindClient } from "../../src/server/client"
import { EngramindError } from "../../src/core/errors"

const failure = (promise: Promise<unknown>) => promise.then(() => { throw new Error("esperava falha") }, (error: unknown) => error as EngramindError)
const reply = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(body === null ? null : typeof body === "string" ? body : JSON.stringify(body), { status, headers })

function setup(response: Response | (() => Response)) {
    const fetch = vi.fn(async () => (typeof response === "function" ? response() : response))
    const client = createEngramindClient({ baseUrl: "https://engramind.test/", token: "eng.tk_1.segredo", fetch: fetch as unknown as typeof globalThis.fetch })
    return { client, fetch, init: () => (fetch.mock.calls[0] as unknown as [string, RequestInit])[1], url: () => (fetch.mock.calls[0] as unknown as [string])[0] }
}

describe("cliente do Engramind", () => {
    it("manda o token e uma Idempotency-Key em toda mutação (GET sem chave)", async () => {
        const post = setup(reply(200, { memory: { id: "m_1" }, duplicate: false, similar: [] }))
        await post.client.memories.create({ channel: "app/global", text: "Fato" })
        const headers = post.init().headers as Record<string, string>
        expect(headers.Authorization).toBe("Bearer eng.tk_1.segredo")
        expect(headers["Idempotency-Key"]).toMatch(/^engramind-client-/)
        expect(post.url()).toBe("https://engramind.test/v1/memories")
        const get = setup(reply(200, { channels: [], next_cursor: null }))
        await get.client.channels.list({ include_archived: true })
        expect((get.init().headers as Record<string, string>)["Idempotency-Key"]).toBeUndefined()
        expect(get.url()).toBe("https://engramind.test/v1/channels?include_archived=true")
    })

    it("contexto com If-None-Match: 304 devolve null", async () => {
        const { client, init } = setup(reply(304, null))
        await expect(client.context({ channels: ["a", "b"], ifNoneMatch: "cv_1" })).resolves.toBeNull()
        expect((init().headers as Record<string, string>)["If-None-Match"]).toBe('"cv_1"')
    })

    it("erro do envelope vira EngramindError pt-BR pelo código (CHANNEL_SHARED)", async () => {
        const { client } = setup(reply(409, { error: { code: "CHANNEL_SHARED", message: "shared" } }))
        const error = await client.channels.archive("app/global").catch((caught: unknown) => caught)
        expect(error).toBeInstanceOf(EngramindError)
        expect((error as EngramindError).code).toBe("ENGRAMIND_CHANNEL_SHARED")
        expect((error as EngramindError).message).toContain("outro app")
    })

    it("401 do Engramind vira 409 (reconfigurar) e 429 guarda o Retry-After", async () => {
        const auth = await failure(setup(reply(401, { error: { code: "AUTH_INVALID" } })).client.whoami())
        expect(auth.status).toBe(409)
        expect(auth.code).toBe("ENGRAMIND_AUTH_INVALID")
        const limited = await failure(setup(reply(429, { error: { code: "RATE_LIMITED" } }, { "retry-after": "12" })).client.whoami())
        expect(limited.retryAfter).toBe(12)
        expect(limited.message).toContain("12 s")
    })

    it("5xx com o corpo trocado pelo Cloudflare é reconhecido", async () => {
        const error = await failure(setup(reply(502, "<html>cloudflare Ray ID: 123</html>")).client.whoami())
        expect(error.code).toBe("ENGRAMIND_PROXY_MASKED")
    })

    it("fora do ar vira ENGRAMIND_UNREACHABLE", async () => {
        const fetch = vi.fn(async () => {
            throw Object.assign(new Error("fetch failed"), { cause: { code: "ECONNREFUSED" } })
        })
        const client = createEngramindClient({ baseUrl: "https://engramind.test", token: "t", fetch: fetch as unknown as typeof globalThis.fetch })
        const error = await failure(client.whoami())
        expect(error.code).toBe("ENGRAMIND_UNREACHABLE")
        expect(error.message).toContain("ECONNREFUSED")
    })
})
