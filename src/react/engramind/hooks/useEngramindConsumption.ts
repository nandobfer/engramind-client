"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useReducedMotion } from "framer-motion"
import { createConsumptionGrouper } from "../../../core/events"
import { useEngramindConfig } from "../../lib/config"
import { subscribeLive } from "../../lib/live"
import type { ConsumptionEvent } from "../network/types"
import { areaKey } from "./useEngramind"

/** O Engramind grava os contadores em lote a cada 5 s: a releitura espera um pouco mais. */
export const CONSUMPTION_REFRESH_DELAY_MS = 6_000
/** Espera para juntar os eventos por canal de uma mesma leitura (`consumption`). */
export const CONSUMPTION_GROUP_WINDOW_MS = 400

export function isConsumptionEvent(value: unknown): value is ConsumptionEvent {
    const event = value as Partial<ConsumptionEvent> | null
    return Boolean(event && typeof event.agent === "string" && (event.kind === "context" || event.kind === "search") && Array.isArray(event.channels) && Array.isArray(event.memoryIds))
}

/**
 * Tempo real do consumo de memórias: o webhook `memory.consumed` (Engramind ≥ 0.12.0) chega pelo SSE da
 * lib, um evento por canal; os eventos da mesma leitura são agrupados pelo `consumption` e a tela anima
 * **uma** vez com o `handler` (estado local: brilho cheio e tamanho um pouco maior). Leitura sem agente
 * (token de app ou admin) não anima. Os contadores reais são relidos depois do lote do Engramind; o
 * consumo não invalida o contexto.
 */
export function useEngramindConsumption(handler: (event: ConsumptionEvent) => void): void {
    const queryClient = useQueryClient()
    const { events } = useEngramindConfig()
    const handlerRef = useRef(handler)
    useEffect(() => {
        handlerRef.current = handler
    }, [handler])
    useEffect(() => {
        if (!events) return
        let timer: ReturnType<typeof setTimeout> | null = null
        const grouper = createConsumptionGrouper({
            windowMs: CONSUMPTION_GROUP_WINDOW_MS,
            onGroup: (event) => {
                handlerRef.current(event)
                if (timer) clearTimeout(timer)
                timer = setTimeout(() => void queryClient.invalidateQueries({ queryKey: areaKey("memories") }), CONSUMPTION_REFRESH_DELAY_MS)
            },
        })
        const unsubscribe = subscribeLive(events, { onEvent: (event) => grouper.push(event) })
        return () => {
            unsubscribe()
            grouper.dispose()
            if (timer) clearTimeout(timer)
        }
    }, [events, queryClient])
}

export interface Travel {
    id: string
    /** Aresta por onde a partícula viaja. */
    edge: string
    /** `true`: do alvo para a origem da aresta. */
    reverse: boolean
    /** `success`: criação de memória por um agente (verde). */
    tone: "primary" | "white" | "success"
    delayMs: number
}

let travelSeq = 0
const NO_BUMPS: Record<string, number> = {}

/**
 * Efeitos locais da rede: pulsos por node (contador que remonta o anel), partículas viajando pelas
 * arestas e o leve aumento de tamanho das memórias consumidas (zerado quando o Engramind relê os
 * números). Movimento reduzido: sem pulsos nem viagens; o aumento e o brilho continuam.
 */
export function useLiveEffects(resetKey: unknown) {
    const reducedMotion = useReducedMotion()
    const [pulses, setPulses] = useState<Record<string, number>>({})
    const [travels, setTravels] = useState<Travel[]>([])
    // O aumento vale até a próxima releitura (`resetKey`): o estado guarda a chave em que nasceu.
    const [bumpState, setBumpState] = useState<{ key: unknown; bumps: Record<string, number> }>({ key: resetKey, bumps: {} })
    const bumps = bumpState.key === resetKey ? bumpState.bumps : NO_BUMPS
    const keyRef = useRef(resetKey)
    const [liveCount, setLiveCount] = useState(0)
    const timers = useRef<ReturnType<typeof setTimeout>[]>([])

    useEffect(() => {
        keyRef.current = resetKey
    }, [resetKey])
    useEffect(() => {
        const pending = timers.current
        return () => pending.forEach(clearTimeout)
    }, [])

    const pulse = useCallback(
        (keys: readonly string[], delayMs = 0) => {
            if (reducedMotion || !keys.length) return
            const run = () => setPulses((previous) => Object.fromEntries([...Object.entries(previous), ...keys.map((key) => [key, (previous[key] ?? 0) + 1] as const)]))
            if (delayMs > 0) timers.current.push(setTimeout(run, delayMs))
            else run()
        },
        [reducedMotion],
    )
    const travel = useCallback(
        (items: readonly Omit<Travel, "id">[]) => {
            if (reducedMotion || !items.length) return
            setTravels((previous) => [...previous, ...items.map((item) => ({ ...item, id: `t${(travelSeq += 1)}` }))].slice(-60))
        },
        [reducedMotion],
    )
    const finish = useCallback((id: string) => setTravels((previous) => previous.filter((item) => item.id !== id)), [])
    const bump = useCallback((ids: readonly string[]) => {
        if (!ids.length) return
        setBumpState((previous) => {
            const key = keyRef.current
            const next = { ...(previous.key === key ? previous.bumps : {}) }
            for (const id of ids) next[id] = (next[id] ?? 0) + 1
            return { key, bumps: next }
        })
    }, [])
    const countEvent = useCallback(() => setLiveCount((count) => count + 1), [])
    return { pulses, travels, bumps, liveCount, pulse, travel, finish, bump, countEvent, reducedMotion: Boolean(reducedMotion) }
}

export type LiveEffects = ReturnType<typeof useLiveEffects>
