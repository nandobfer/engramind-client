import type { LiveEvent } from "../core/events"
import type { EventBus } from "./bus"

/**
 * Endpoint SSE dos componentes (`EventSource`): repassa os eventos do barramento como
 * `event: engramind` com só ids, slugs e tipos, e um comentário de vida a cada `heartbeatMs`. O app monta
 * **atrás do próprio login**; ao cair, o navegador reconecta e relê as telas.
 */
export interface SseOptions {
    bus: EventBus
    heartbeatMs?: number
    /** Filtra o que cada navegador recebe (ex.: por app ou canal). */
    filter?: (event: LiveEvent, request: Request) => boolean
}

const encoder = new TextEncoder()
export const formatSse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

export function createSseHandler(options: SseOptions) {
    const heartbeatMs = options.heartbeatMs ?? 25_000
    return function handle(request: Request): Response {
        let cleanup: (() => void) | null = null
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                const send = (chunk: string) => {
                    try {
                        controller.enqueue(encoder.encode(chunk))
                    } catch {
                        cleanup?.()
                    }
                }
                send(`retry: 3000\n${formatSse("ready", { at: new Date().toISOString() })}`)
                const unsubscribe = options.bus.subscribe((event) => {
                    if (options.filter && !options.filter(event, request)) return
                    send(formatSse("engramind", event))
                })
                const timer = setInterval(() => send(": ping\n\n"), heartbeatMs)
                cleanup = () => {
                    if (!cleanup) return
                    cleanup = null
                    clearInterval(timer)
                    unsubscribe()
                    try {
                        controller.close()
                    } catch {
                        // Já fechado.
                    }
                }
                request.signal.addEventListener("abort", () => cleanup?.(), { once: true })
            },
            cancel() {
                cleanup?.()
            },
        })
        return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } })
    }
}
