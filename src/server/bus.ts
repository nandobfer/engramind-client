import type { LiveEvent } from "../core/events"

/**
 * Barramento dos eventos ao vivo (webhook → SSE). O padrão vive **no processo**: só os navegadores
 * ligados à instância que recebeu o webhook são avisados. Com várias instâncias, passe um `Broadcaster`
 * (ex.: Redis pub/sub, Postgres `NOTIFY`, Pusher) que entregue o evento a todas.
 */
export type LiveListener = (event: LiveEvent) => void

export interface Broadcaster {
    publish(event: LiveEvent): void | Promise<void>
    subscribe(listener: LiveListener): () => void
}

export interface EventBus {
    publish(event: LiveEvent): Promise<void>
    subscribe(listener: LiveListener): () => void
    /** Navegadores ligados nesta instância. */
    readonly size: number
}

export function createEventBus(options: { broadcaster?: Broadcaster; onError?: (error: unknown) => void } = {}): EventBus {
    const listeners = new Set<LiveListener>()
    const deliver = (event: LiveEvent) => {
        for (const listener of listeners) {
            try {
                listener(event)
            } catch (error) {
                options.onError?.(error)
            }
        }
    }
    const remote = options.broadcaster?.subscribe(deliver)
    void remote
    return {
        async publish(event) {
            if (options.broadcaster) await options.broadcaster.publish(event)
            else deliver(event)
        },
        subscribe(listener) {
            listeners.add(listener)
            return () => listeners.delete(listener)
        },
        get size() {
            return listeners.size
        },
    }
}
