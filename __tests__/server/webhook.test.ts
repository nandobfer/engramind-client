import { describe, expect, it, vi } from "vitest"
import { createEventBus } from "../../src/server/bus"
import { createContextCache } from "../../src/server/context"
import { createWebhookHandler, signWebhook, verifyWebhookSignature } from "../../src/server/webhook"
import type { LiveEvent } from "../../src/core/events"

const SECRET = "s".repeat(40)
const now = () => Math.floor(Date.now() / 1000)

function request(body: string, signature: string | null) {
    return new Request("https://app.test/api/engramind/webhook", { method: "POST", body, headers: signature ? { "Engramind-Signature": signature } : {} })
}
const signed = (body: string, t = now()) => `t=${t},v1=${signWebhook(SECRET, t, body)}`

describe("webhook da lib", () => {
    it("assinatura válida passa; inválida, fora da janela ou malformada recebe 401 sem corpo", async () => {
        const body = JSON.stringify({ id: "evt_1", type: "memory.created", channel: "app/global", memory_ids: ["m_1"] })
        const handler = createWebhookHandler({ secret: SECRET })
        expect((await handler(request(body, signed(body)))).status).toBe(200)
        for (const signature of [`t=${now()},v1=${"0".repeat(64)}`, signed(body, now() - 301), "v1=abc", null]) {
            const res = await handler(request(JSON.stringify({ id: `evt_${signature}`, type: "memory.created" }), signature))
            expect(res.status).toBe(401)
            expect(await res.text()).toBe("")
        }
        expect(verifyWebhookSignature(signed(body), body + " ", SECRET)).toBe(false)
    })

    it("repetido pelo id é descartado (não republica)", async () => {
        const bus = createEventBus()
        const events: LiveEvent[] = []
        bus.subscribe((event) => events.push(event))
        const handler = createWebhookHandler({ secret: SECRET, bus })
        const body = JSON.stringify({ id: "evt_9", type: "memory.updated", channel: "app/global", memory_ids: ["m_1"] })
        await handler(request(body, signed(body)))
        const again = await handler(request(body, signed(body)))
        expect(await again.json()).toEqual({ ok: true, duplicate: true })
        expect(events).toHaveLength(1)
    })

    it("republica no SSE só ids, slugs e tipos", async () => {
        const bus = createEventBus()
        const events: LiveEvent[] = []
        bus.subscribe((event) => events.push(event))
        const handler = createWebhookHandler({ secret: SECRET, bus })
        const body = JSON.stringify({ id: "evt_c", type: "memory.consumed", channel: "app/global", memory_ids: ["m_1"], consumption: "cns_1", operation: "get_context", app: "app", agent: "app/dev", title_ids: ["m_2"], context_version: "cv_1", extra: "não passa" })
        await handler(request(body, signed(body)))
        expect(events[0]).toEqual({ id: "evt_c", type: "memory.consumed", channel: "app/global", memoryIds: ["m_1"], consumption: "cns_1", operation: "get_context", app: "app", agent: "app/dev", titleIds: ["m_2"], contextVersion: "cv_1" })
    })

    it("memory.consumed não suja o contexto; memory.updated suja", async () => {
        const context = vi.fn()
        const fetch = vi.fn(async () => new Response(JSON.stringify({ content: "<memories/>", version: "cv_1", counts: { full: 0, titles: 0, overflow: 0 }, rendered_tokens: 0, format: "tagged" })))
        const { createEngramindClient } = await import("../../src/server/client")
        const client = createEngramindClient({ baseUrl: "https://e.test", token: "t", fetch: fetch as unknown as typeof globalThis.fetch })
        const cache = createContextCache({ client: () => client, revalidate: "on-dirty" })
        await cache.getContext("app/dev", { channels: ["app/global"] })
        const handler = createWebhookHandler({ secret: SECRET, context: cache, onEvent: context })
        const consumed = JSON.stringify({ id: "evt_a", type: "memory.consumed", channel: "app/global", memory_ids: ["m_1"], agent: "app/dev" })
        await handler(request(consumed, signed(consumed)))
        expect((await cache.peek("app/dev", ["app/global"]))!.dirty).toBe(false)
        const updated = JSON.stringify({ id: "evt_b", type: "memory.updated", channel: "app/global", memory_ids: ["m_1"] })
        await handler(request(updated, signed(updated)))
        await Promise.resolve()
        expect((await cache.peek("app/dev", ["app/global"]))!.dirty).toBe(true)
        expect(context).toHaveBeenCalledTimes(2)
    })
})
