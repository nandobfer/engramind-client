"use client"

import { useEffect, useMemo } from "react"
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query"
import { toast } from "../../lib/toast"
import { activeDataSource, apiErrorCode, apiErrorMessage } from "../../lib/api"
import { useEngramindConfig } from "../../lib/config"
import { subscribeLive } from "../../lib/live"
import { ENGRAMIND_QUERY_KEY } from "../constants"

/**
 * Base dos hooks do Engramind: tudo passa pela fonte de dados do `EngramindProvider` (o proxy montado
 * pelo app; o navegador nunca chama o Engramind). Chave: `["engramind", <1º segmento da rota>, rota, parâmetros]`, invalidada
 * pelo prefixo no tempo real (`useEngramindRealtime`).
 */

export type Params = Record<string, string | number | boolean | undefined | null>

const clean = (params: Params = {}) => Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ""))
export const engramindKey = (route: string, params?: Params): QueryKey => [ENGRAMIND_QUERY_KEY, route.split("/")[0], route, clean(params)]
export const areaKey = (area: string): QueryKey => [ENGRAMIND_QUERY_KEY, area]

/** Caminho do Opex com os segmentos codificados (`channels/eng%2Fglobal/stats`). */
export const route = (...segments: (string | number)[]) => segments.map((segment) => encodeURIComponent(String(segment))).join("/")

export async function engramindGet<T>(path: string, params?: Params): Promise<T> {
    return activeDataSource().request<T>("get", path, { params: clean(params) })
}

export async function engramindSend<T>(method: "post" | "put" | "patch" | "delete", path: string, body?: unknown): Promise<T> {
    return activeDataSource().request<T>(method, path, method === "delete" ? {} : { body: body ?? {} })
}

/** Consulta simples de uma rota do Engramind. */
export function useEngramindQuery<T>(path: string | null, params?: Params, options: { enabled?: boolean; /** Número, `false` ou função dos dados atuais (ex.: polling só enquanto algo carrega). */ refetchInterval?: number | false | ((data: T | undefined) => number | false) } = {}) {
    const interval = options.refetchInterval
    return useQuery({
        queryKey: engramindKey(path ?? "-", params),
        queryFn: () => engramindGet<T>(path!, params),
        enabled: path !== null && options.enabled !== false,
        refetchInterval: typeof interval === "function" ? (query) => interval(query.state.data as T | undefined) : interval,
        retry: (count, error) => count < 1 && apiErrorCode(error) !== "ENGRAMIND_NOT_CONFIGURED",
    })
}

/** Lista paginada por cursor (`next_cursor`). `field` é o nome da lista na resposta do Engramind. */
/** Lista vazia estável (sem dados ainda). */
const EMPTY_ITEMS: never[] = []

export function useEngramindList<T>(path: string | null, field: string, params?: Params, options: { enabled?: boolean; /** Lê todas as páginas (listas pequenas, como apps e tokens). */ all?: boolean } = {}) {
    const query = useInfiniteQuery({
        queryKey: [...engramindKey(path ?? "-", params), "pages"],
        initialPageParam: null as string | null,
        queryFn: async ({ pageParam }) => {
            const page = await engramindGet<Record<string, unknown>>(path!, { ...params, cursor: pageParam ?? undefined, limit: 100 })
            return { items: (page[field] as T[] | undefined) ?? [], nextCursor: (page.next_cursor as string | null | undefined) ?? null, truncated: page.truncated === true }
        },
        getNextPageParam: (last) => last.nextCursor,
        enabled: path !== null && options.enabled !== false,
        retry: (count, error) => count < 1 && apiErrorCode(error) !== "ENGRAMIND_NOT_CONFIGURED",
    })
    const { hasNextPage, isFetchingNextPage, fetchNextPage } = query
    useEffect(() => {
        if (options.all && hasNextPage && !isFetchingNextPage) void fetchNextPage()
    }, [options.all, hasNextPage, isFetchingNextPage, fetchNextPage])
    // Mesma referência enquanto os dados não mudam: as telas derivam layout e nodes de `items`.
    const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? EMPTY_ITEMS, [query.data]) as T[]
    return { ...query, items }
}

interface MutationOptions<V> {
    /** Áreas (1º segmento) a invalidar no sucesso. */
    invalidate: string[]
    success?: string | ((variables: V) => string)
    /** Não mostra o toast de erro (o chamador mostra no formulário). */
    silentError?: boolean
    /** Outras chaves a invalidar (ex.: o detalhe da integração). */
    alsoInvalidate?: readonly QueryKey[]
}

/** Mutação numa rota do Engramind, com toast pt-BR e invalidação das áreas afetadas. */
export function useEngramindMutation<V, T = unknown>(request: (variables: V) => Promise<T>, options: MutationOptions<V>) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: request,
        onSuccess: (_data, variables) => {
            for (const area of options.invalidate) void queryClient.invalidateQueries({ queryKey: areaKey(area) })
            for (const queryKey of options.alsoInvalidate ?? []) void queryClient.invalidateQueries({ queryKey })
            const message = typeof options.success === "function" ? options.success(variables) : options.success
            if (message) toast.success(message)
        },
        onError: (error) => {
            if (!options.silentError) toast.error(apiErrorMessage(error, "Não foi possível concluir a ação no Engramind."))
        },
    })
}

/** Áreas a invalidar por tipo de evento. `memory.consumed` não invalida nada (só anima a rede). */
export function areasForEvent(type: string): string[] {
    if (type === "memory.consumed") return []
    if (type.startsWith("memory.")) return ["memories", "channels", "agent-activity"]
    if (type === "memories.context") return ["agent-activity"]
    if (type === "channel.updated") return ["channels", "memories", "consumer-settings"]
    if (type === "subscription.updated") return ["subscriptions", "agents", "channels", "consumer-settings"]
    if (type === "settings.updated") return ["settings", "channels", "status", "providers", "consumer-settings", "categories"]
    if (type === "identities.updated") return ["apps", "agents", "tokens", "connection", "whoami"]
    if (type === "jobs.updated" || type === "status.updated") return ["jobs", "status"]
    if (type.startsWith("env.")) return ["env", "status", "connection"]
    if (type === "migration.updated") return ["migration"]
    return []
}

/**
 * Tempo real pelo SSE da lib (`events` do provider): cada evento invalida as áreas afetadas e, quando a
 * conexão volta depois de cair, todas as consultas do Engramind são relidas. Sem `events`, nada.
 */
export function useEngramindRealtime(): void {
    const queryClient = useQueryClient()
    const { events } = useEngramindConfig()
    useEffect(() => {
        if (!events) return
        return subscribeLive(events, {
            onEvent: (event) => {
                for (const area of areasForEvent(event.type)) void queryClient.invalidateQueries({ queryKey: areaKey(area) })
            },
            onReconnect: () => void queryClient.invalidateQueries({ queryKey: [ENGRAMIND_QUERY_KEY] }),
        })
    }, [events, queryClient])
}

/** Erro que pede reconfigurar a conexão (token inválido/insuficiente ou sem configuração). */
export function needsReconnect(error: unknown): "configure" | "token" | null {
    const code = apiErrorCode(error)
    if (code === "ENGRAMIND_NOT_CONFIGURED") return "configure"
    if (code === "ENGRAMIND_AUTH_INVALID" || code === "ENGRAMIND_SCOPE_REQUIRED" || code === "ENGRAMIND_TOKEN_INSUFFICIENT") return "token"
    return null
}
