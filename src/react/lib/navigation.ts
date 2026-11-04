"use client"

import { useCallback, useMemo, useSyncExternalStore } from "react"
import { useEngramindConfig } from "./config"

/**
 * Navegação dos componentes (`?universo=`, `?app=`, links internos). O app pode passar as funções do
 * próprio roteador (`navigation` no provider, ex.: Next.js); o padrão usa o History API do navegador.
 */
export interface EngramindRouter {
    push(url: string, options?: { scroll?: boolean }): void
    replace(url: string, options?: { scroll?: boolean }): void
}

export interface NavigationAdapter {
    useRouter: () => EngramindRouter
    usePathname: () => string
    useSearchParams: () => { get(name: string): string | null; toString(): string }
}

const CHANGE = "engramind:navigate"
const subscribe = (callback: () => void) => {
    if (typeof window === "undefined") return () => undefined
    window.addEventListener("popstate", callback)
    window.addEventListener(CHANGE, callback)
    return () => {
        window.removeEventListener("popstate", callback)
        window.removeEventListener(CHANGE, callback)
    }
}
const href = () => (typeof window === "undefined" ? "" : window.location.pathname + window.location.search)

function useLocation() {
    return useSyncExternalStore(subscribe, href, () => "")
}

/** Navegação padrão pelo History API (sem roteador). */
export const historyNavigation: NavigationAdapter = {
    useRouter() {
        const go = useCallback((method: "pushState" | "replaceState") => (url: string) => {
            window.history[method](null, "", url)
            window.dispatchEvent(new Event(CHANGE))
        }, [])
        return useMemo(() => ({ push: go("pushState"), replace: go("replaceState") }), [go])
    },
    usePathname() {
        const location = useLocation()
        return location.split("?")[0] ?? ""
    },
    useSearchParams() {
        const location = useLocation()
        return useMemo(() => new URLSearchParams(location.split("?")[1] ?? ""), [location])
    },
}

export function useRouter(): EngramindRouter {
    return useEngramindConfig().navigation.useRouter()
}

export function usePathname(): string {
    return useEngramindConfig().navigation.usePathname()
}

export function useSearchParams() {
    return useEngramindConfig().navigation.useSearchParams()
}
