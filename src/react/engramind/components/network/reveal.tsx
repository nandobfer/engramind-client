"use client"

import { createContext, useContext, useState } from "react"

/** Entrada suave da rede depois do skeleton (OPE-157): a cena some e o canvas aparece em ~250 ms. */
export const NETWORK_REVEAL_MS = 250

/** Janela (ms) depois da troca em que um canvas que monta ainda entra com fade; depois (troca de universo), não. */
export const NETWORK_REVEAL_WINDOW_MS = 1000

/** Momento (`Date.now()`) em que o conteúdo substituiu o skeleton no `QueryBoundary`; `null` sem skeleton antes. */
export const NetworkRevealContext = createContext<number | null>(null)

/** O canvas montado agora entra com fade? Só logo depois do skeleton (decidido uma vez, na montagem). */
export function shouldReveal(revealedAt: number | null, now: number): boolean {
    return revealedAt !== null && now - revealedAt >= 0 && now - revealedAt <= NETWORK_REVEAL_WINDOW_MS
}

export function useNetworkReveal(): boolean {
    const revealedAt = useContext(NetworkRevealContext)
    const [reveal] = useState(() => shouldReveal(revealedAt, Date.now()))
    return reveal
}
