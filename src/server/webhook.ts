import { createHmac, timingSafeEqual } from "node:crypto"
import { toLiveEvent, type WebhookEvent } from "../core/events"
import type { EventBus } from "./bus"
import type { ContextCache } from "./context"

/**
 * Webhook do Engramind (`POST <webhook_url>`): valida `Engramind-Signature` (`t=<unix>,v1=<hex>`,
 * HMAC-SHA256 do segredo sobre `t + "." + corpo bruto`, janela de 300 s, comparação em tempo constante),
 * descarta o `id` repetido (as retentativas repetem o corpo), marca o contexto do canal como sujo (menos
 * `memory.consumed`) e republica no SSE só ids, slugs e tipos. Assinatura inválida: `401` sem corpo.
 */

export const WEBHOOK_TOLERANCE_SECONDS = 300

export function parseSignatureHeader(header: string | null): { t: number; v1: string[] } | null {
    if (!header) return null
    let t: number | null = null
    const v1: string[] = []
    for (const part of header.split(",")) {
        const [key, ...rest] = part.trim().split("=")
        const value = rest.join("=")
        if (key === "t") t = Number(value)
        if (key === "v1" && value) v1.push(value)
    }
    if (t === null || !Number.isFinite(t) || !v1.length) return null
    return { t, v1 }
}

export function signWebhook(secret: string, timestamp: number, body: string): string {
    return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")
}

export function verifyWebhookSignature(header: string | null, body: string, secret: string, options: { now?: number; toleranceSeconds?: number } = {}): boolean {
    const parsed = parseSignatureHeader(header)
    if (!parsed || !secret) return false
    const now = Math.floor((options.now ?? Date.now()) / 1000)
    if (Math.abs(now - parsed.t) > (options.toleranceSeconds ?? WEBHOOK_TOLERANCE_SECONDS)) return false
    const expected = Buffer.from(signWebhook(secret, parsed.t, body), "hex")
    return parsed.v1.some((candidate) => {
        const given = Buffer.from(candidate, "hex")
        return given.length === expected.length && timingSafeEqual(given, expected)
    })
}

/** Registro dos `id` já processados (retentativas do Engramind). */
export interface DedupeStore {
    /** `true` se o `id` já foi visto (e o marca como visto). */
    seen(id: string): boolean | Promise<boolean>
}

/** Padrão em memória: lembra os últimos `max` ids por `ttlMs` (24 h). */
export function createMemoryDedupe(options: { ttlMs?: number; max?: number } = {}): DedupeStore {
    const ttl = options.ttlMs ?? 24 * 60 * 60_000
    const max = options.max ?? 10_000
    const ids = new Map<string, number>()
    return {
        seen(id) {
            const now = Date.now()
            for (const [key, at] of ids) {
                if (now - at <= ttl && ids.size <= max) break
                ids.delete(key)
            }
            if (ids.has(id)) return true
            ids.set(id, now)
            return false
        },
    }
}

export interface WebhookHandlerOptions {
    /** Segredo do webhook do app (o mesmo gravado no Engramind por `update_app_webhook`). */
    secret: string | (() => string | null | Promise<string | null>)
    bus?: EventBus
    dedupe?: DedupeStore
    /** Contexto em cache dos agentes do app: marca os canais sujos. */
    context?: ContextCache
    /** Depois de validar (ex.: auditoria, outro tempo real do app). Uma falha não muda a resposta. */
    onEvent?: (event: WebhookEvent) => void | Promise<void>
    onError?: (error: unknown) => void
    toleranceSeconds?: number
}

export function createWebhookHandler(options: WebhookHandlerOptions) {
    const dedupe = options.dedupe ?? createMemoryDedupe()
    return async function handle(request: Request): Promise<Response> {
        const body = await request.text()
        const secret = typeof options.secret === "function" ? await options.secret() : options.secret
        if (!secret || !verifyWebhookSignature(request.headers.get("engramind-signature"), body, secret, { toleranceSeconds: options.toleranceSeconds })) return new Response(null, { status: 401 })
        let event: WebhookEvent
        try {
            event = JSON.parse(body) as WebhookEvent
        } catch {
            return new Response(null, { status: 400 })
        }
        if (!event || typeof event.id !== "string" || typeof event.type !== "string") return new Response(null, { status: 400 })
        if (await dedupe.seen(event.id)) return Response.json({ ok: true, duplicate: true })
        try {
            options.context?.handleEvent(event)
            await options.bus?.publish(toLiveEvent(event))
            await options.onEvent?.(event)
        } catch (error) {
            options.onError?.(error)
        }
        return Response.json({ ok: true })
    }
}
