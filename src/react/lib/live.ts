"use client"

import type { LiveEvent } from "../../core/events"

/**
 * Conexão SSE compartilhada por URL (`EventSource`), com contagem de referências. Quando cai, reconecta
 * com espera crescente (1 s → 30 s) e avisa os ouvintes `onReconnect` (a tela relê o que pode ter perdido).
 */
type Listener = (event: LiveEvent) => void
type StatusListener = (connected: boolean) => void

interface LiveConnection {
    refs: number
    listeners: Set<Listener>
    reconnects: Set<() => void>
    status: Set<StatusListener>
    source: EventSource | null
    timer: ReturnType<typeof setTimeout> | null
    attempt: number
    hadError: boolean
}

const connections = new Map<string, LiveConnection>()
const MAX_DELAY_MS = 30_000

export const isLiveAvailable = () => typeof window !== "undefined" && typeof window.EventSource === "function"

function open(url: string, connection: LiveConnection) {
    const source = new EventSource(url, { withCredentials: true })
    connection.source = source
    source.addEventListener("open", () => {
        connection.attempt = 0
        for (const listener of connection.status) listener(true)
        if (connection.hadError) {
            connection.hadError = false
            for (const listener of connection.reconnects) listener()
        }
    })
    source.addEventListener("engramind", (message) => {
        let event: LiveEvent | null = null
        try {
            event = JSON.parse((message as MessageEvent<string>).data) as LiveEvent
        } catch {
            return
        }
        if (!event || typeof event.type !== "string") return
        for (const listener of connection.listeners) listener(event)
    })
    source.addEventListener("error", () => {
        connection.hadError = true
        for (const listener of connection.status) listener(false)
        if (source.readyState !== EventSource.CLOSED) return
        source.close()
        connection.source = null
        const delay = Math.min(MAX_DELAY_MS, 1000 * 2 ** connection.attempt)
        connection.attempt += 1
        connection.timer = setTimeout(() => {
            connection.timer = null
            if (connection.refs > 0) open(url, connection)
        }, delay)
    })
}

export interface LiveSubscription {
    onEvent?: Listener
    onReconnect?: () => void
    onStatus?: StatusListener
}

/** Assina o SSE em `url`; devolve a função que cancela a assinatura. */
export function subscribeLive(url: string, subscription: LiveSubscription): () => void {
    if (!isLiveAvailable()) return () => undefined
    let connection = connections.get(url)
    if (!connection) {
        connection = { refs: 0, listeners: new Set(), reconnects: new Set(), status: new Set(), source: null, timer: null, attempt: 0, hadError: false }
        connections.set(url, connection)
    }
    connection.refs += 1
    if (subscription.onEvent) connection.listeners.add(subscription.onEvent)
    if (subscription.onReconnect) connection.reconnects.add(subscription.onReconnect)
    if (subscription.onStatus) connection.status.add(subscription.onStatus)
    if (!connection.source && !connection.timer) open(url, connection)
    const current = connection
    return () => {
        if (subscription.onEvent) current.listeners.delete(subscription.onEvent)
        if (subscription.onReconnect) current.reconnects.delete(subscription.onReconnect)
        if (subscription.onStatus) current.status.delete(subscription.onStatus)
        current.refs -= 1
        if (current.refs > 0) return
        current.source?.close()
        if (current.timer) clearTimeout(current.timer)
        connections.delete(url)
    }
}
