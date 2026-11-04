import { afterEach, describe, expect, it, vi } from "vitest"
import { createConsumptionGrouper, mergeConsumption, toLiveEvent, type ConsumptionEvent, type LiveEvent } from "../../src/core/events"

const consumed = (channel: string, ids: string[], extra: Partial<LiveEvent> = {}): LiveEvent => ({ type: "memory.consumed", channel, memoryIds: ids, consumption: "cns_1", operation: "get_context", agent: "app/dev", ...extra })

afterEach(() => vi.useRealTimers())

describe("consumo agrupado", () => {
    it("três eventos (um por canal) da mesma leitura viram um único consumo", () => {
        vi.useFakeTimers()
        const groups: ConsumptionEvent[] = []
        const grouper = createConsumptionGrouper({ windowMs: 100, onGroup: (event) => groups.push(event) })
        grouper.push(consumed("a", ["m_1"], { titleIds: ["m_9"], contextVersion: "cv_1" }))
        grouper.push(consumed("b", ["m_2"]))
        vi.advanceTimersByTime(50)
        grouper.push(consumed("c", ["m_3", "m_1"]))
        vi.advanceTimersByTime(150)
        expect(groups).toEqual([{ agent: "app/dev", kind: "context", channels: ["a", "b", "c"], delivered: ["a", "b", "c"], memoryIds: ["m_1", "m_2", "m_3"], titleIds: ["m_9"], version: "cv_1", consumption: "cns_1", operation: "get_context" }])
    })

    it("retentativa de um consumo já emitido não pulsa de novo", () => {
        vi.useFakeTimers()
        const onGroup = vi.fn()
        const grouper = createConsumptionGrouper({ windowMs: 10, onGroup })
        grouper.push(consumed("a", ["m_1"]))
        vi.advanceTimersByTime(20)
        grouper.push(consumed("a", ["m_1"]))
        vi.advanceTimersByTime(20)
        expect(onGroup).toHaveBeenCalledTimes(1)
    })

    it("leitura sem agente (token de app ou admin) e outros tipos não geram pulso", () => {
        vi.useFakeTimers()
        const onGroup = vi.fn()
        const grouper = createConsumptionGrouper({ windowMs: 10, onGroup })
        grouper.push(consumed("a", ["m_1"], { agent: null, consumption: "cns_2" }))
        grouper.push({ type: "memory.created", channel: "a", memoryIds: ["m_1"], agent: "app/dev" })
        vi.advanceTimersByTime(20)
        expect(onGroup).not.toHaveBeenCalled()
    })

    it("busca vira kind search; sem memórias, nada", () => {
        expect(mergeConsumption([consumed("a", ["m_1"], { operation: "search_memories" })])?.kind).toBe("search")
        expect(mergeConsumption([consumed("a", [])])).toBeNull()
    })

    it("o webhook vira evento ao vivo só com os campos permitidos", () => {
        expect(toLiveEvent({ id: "evt_1", type: "memory.created", channel: "a", memory_ids: ["m_1"], at: "2026-11-01T00:00:00Z", ...({ text: "segredo" } as object) })).toEqual({ id: "evt_1", type: "memory.created", channel: "a", memoryIds: ["m_1"], at: "2026-11-01T00:00:00Z" })
    })
})
