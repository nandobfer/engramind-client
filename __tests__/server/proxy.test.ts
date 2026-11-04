import { describe, expect, it, vi } from "vitest"
import { createEngramindClient } from "../../src/server/client"
import { createEngramindProxy } from "../../src/server/proxy"

const TOKEN = "eng.tk_app.segredo-do-app-que-nunca-sai"

function setup(mode: "app" | "manager", response: unknown = { ok: true }) {
    const fetch = vi.fn(async () => new Response(JSON.stringify(response), { status: 200 }))
    const client = createEngramindClient({ baseUrl: "https://engramind.test", token: TOKEN, fetch: fetch as unknown as typeof globalThis.fetch })
    const onMutation = vi.fn()
    const onTokenIssued = vi.fn()
    const proxy = createEngramindProxy({ client, mode, basePath: "/api/engramind", onMutation, onTokenIssued })
    const call = (method: string, path: string, body?: unknown) => proxy(new Request(`https://app.test/api/engramind/${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) }))
    return { fetch, call, onMutation, onTokenIssued }
}

describe("proxy da lib", () => {
    it("modo app: rotas de gestor (apps, criar canal, configurações) dão 404 sem chamar o Engramind", async () => {
        const { call, fetch } = setup("app")
        for (const [method, path] of [["GET", "apps"], ["POST", "channels"], ["GET", "settings"], ["DELETE", "channels/a%2Fb"]] as const) {
            const res = await call(method, path, method === "POST" ? {} : undefined)
            expect(res.status).toBe(404)
        }
        expect(fetch).not.toHaveBeenCalled()
    })

    it("modo gestor libera a lista de apps", async () => {
        const { call, fetch } = setup("manager", { apps: [] })
        expect((await call("GET", "apps")).status).toBe(200)
        expect((fetch.mock.calls[0] as unknown as [string])[0]).toBe("https://engramind.test/v1/apps")
    })

    it("decodifica o slug do canal e o recodifica no caminho do Engramind", async () => {
        const { call, fetch } = setup("app", { id: "ch_1" })
        await call("POST", "channels/app%2Fglobal/archive", {})
        expect((fetch.mock.calls[0] as unknown as [string])[0]).toBe("https://engramind.test/v1/channels/app%2Fglobal/archive")
    })

    it("responde { success, data } e nunca devolve o token do servidor", async () => {
        const { call } = setup("app", { token_id: "tk_app", kind: "app" })
        const res = await call("GET", "whoami")
        const text = await res.text()
        expect(JSON.parse(text)).toEqual({ success: true, data: { token_id: "tk_app", kind: "app" } })
        expect(text).not.toContain(TOKEN)
    })

    it("modo app: issue_token força kind agent e recusa token de app", async () => {
        const issued = { token: { id: "tk_2", kind: "agent", app: { slug: "meu-app" }, agent: { slug: "curador" } }, secret: "eng.tk_2.novo" }
        const { call, fetch, onTokenIssued, onMutation } = setup("app", issued)
        const refused = await call("POST", "tokens", { kind: "app", app: "meu-app", scopes: ["read"] })
        expect(refused.status).toBe(403)
        expect(fetch).not.toHaveBeenCalled()
        const res = await call("POST", "tokens", { agent: "meu-app/curador", scopes: ["read"] })
        expect(res.status).toBe(200)
        expect(JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).kind).toBe("agent")
        expect(onTokenIssued).toHaveBeenCalledWith("eng.tk_2.novo", expect.objectContaining({ id: "tk_2", agent: "meu-app/curador", operation: "issue_token" }))
        // A auditoria do app não recebe o segredo.
        expect(JSON.stringify(onMutation.mock.calls[0]![0])).not.toContain("eng.tk_2.novo")
    })

    it("o segredo do webhook não vai para a auditoria do app", async () => {
        const { call, onMutation } = setup("app", { slug: "meu-app" })
        await call("PUT", "apps/meu-app/webhook", { url: "https://app.test/hook", secret: "x".repeat(40) })
        expect(onMutation).toHaveBeenCalledWith(expect.objectContaining({ operation: "update_app_webhook", body: { url: "https://app.test/hook", secret: "[segredo omitido]" } }))
    })

    it("erro do Engramind volta com status, código e mensagem pt-BR", async () => {
        const fetch = vi.fn(async () => new Response(JSON.stringify({ error: { code: "FOREIGN_APP" } }), { status: 403 }))
        const client = createEngramindClient({ baseUrl: "https://engramind.test", token: TOKEN, fetch: fetch as unknown as typeof globalThis.fetch })
        const proxy = createEngramindProxy({ client, basePath: "/api/engramind" })
        const res = await proxy(new Request("https://app.test/api/engramind/agents/outro%2Fagente"))
        expect(res.status).toBe(403)
        expect(await res.json()).toEqual({ success: false, error: "Sem acesso: o registro pertence a outro app.", code: "ENGRAMIND_FOREIGN_APP" })
    })

    it("sem cliente configurado: 409 ENGRAMIND_NOT_CONFIGURED", async () => {
        const proxy = createEngramindProxy({ client: () => null, basePath: "/api/engramind" })
        const res = await proxy(new Request("https://app.test/api/engramind/whoami"))
        expect(res.status).toBe(409)
        expect((await res.json()).code).toBe("ENGRAMIND_NOT_CONFIGURED")
    })
})
