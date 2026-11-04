import { describe, expect, it } from "vitest"
import { createEventBus } from "../../src/server/bus"
import { createSseHandler } from "../../src/server/sse"

async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, needle: string) {
    const decoder = new TextDecoder()
    let text = ""
    while (!text.includes(needle)) {
        const { value, done } = await reader.read()
        if (done) break
        text += decoder.decode(value)
    }
    return text
}

describe("SSE da lib", () => {
    it("entrega os eventos do barramento como `event: engramind` e fecha no abort", async () => {
        const bus = createEventBus()
        const controller = new AbortController()
        const res = createSseHandler({ bus, heartbeatMs: 20 })(new Request("https://app.test/api/engramind/events", { signal: controller.signal }))
        expect(res.headers.get("content-type")).toContain("text/event-stream")
        const reader = res.body!.getReader()
        expect(await readUntil(reader, "event: ready")).toContain("retry: 3000")
        expect(bus.size).toBe(1)
        await bus.publish({ id: "evt_1", type: "memory.created", channel: "app/global", memoryIds: ["m_1"] })
        const text = await readUntil(reader, "m_1")
        expect(text).toContain('event: engramind\ndata: {"id":"evt_1","type":"memory.created","channel":"app/global","memoryIds":["m_1"]}')
        expect(await readUntil(reader, ": ping")).toContain(": ping")
        controller.abort()
        expect(bus.size).toBe(0)
    })

    it("o filtro decide o que cada navegador recebe", async () => {
        const bus = createEventBus()
        const res = createSseHandler({ bus, filter: (event) => event.channel === "app/global" })(new Request("https://app.test/events"))
        const reader = res.body!.getReader()
        await readUntil(reader, "event: ready")
        await bus.publish({ type: "memory.created", channel: "outro/canal" })
        await bus.publish({ type: "memory.created", channel: "app/global" })
        const text = await readUntil(reader, "app/global")
        expect(text).not.toContain("outro/canal")
    })

    it("broadcaster: o publish vai ao broadcaster e a entrega volta por ele", async () => {
        const listeners = new Set<(event: { type: string }) => void>()
        const published: unknown[] = []
        const bus = createEventBus({ broadcaster: { publish: (event) => void (published.push(event), listeners.forEach((listener) => listener(event))), subscribe: (listener) => (listeners.add(listener), () => listeners.delete(listener)) } })
        const got: unknown[] = []
        bus.subscribe((event) => got.push(event))
        await bus.publish({ type: "channel.updated" })
        expect(published).toHaveLength(1)
        expect(got).toEqual([{ type: "channel.updated" }])
    })
})
