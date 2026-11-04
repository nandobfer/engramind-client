"use client"

import { createContext, useContext, type ReactNode } from "react"
import { Bot, type LucideIcon } from "lucide-react"
import type { ChannelLabel } from "../engramind/network/channel-labels"
import type { OverviewLayoutMode } from "../engramind/network/overview-layout"
import { DEFAULT_MESSAGES, type Messages } from "./messages"
import { historyNavigation, type NavigationAdapter } from "./navigation"

/**
 * `app`: o token do próprio app (o app, os agentes dele e os canais que eles alcançam), sem funções de
 * gestor. `manager`: só para o gestor da rede (token admin), libera a visão Apps x canais.
 */
export type EngramindMode = "app" | "manager"

export interface EngramindHrefs {
    /** Página da rede (os parâmetros `?app=` e `?universo=` são acrescentados). */
    network: string
    /** Página de detalhe de um canal; `null` esconde o link "Abrir página do canal". */
    channel: ((slug: string) => string) | null
}

export interface RenderLinkProps {
    href: string
    children?: ReactNode
    className?: string
    [key: string]: unknown
}

export interface FooterContext {
    /** Distribuição da visão inicial (só fora dos universos). */
    layout?: { value: OverviewLayoutMode; onChange: (value: OverviewLayoutMode) => void }
}

export interface EngramindConfig {
    mode: EngramindMode
    /** Slug do app do token (modo app); a visão inicial é a rede Agentes x canais dele. */
    app: string | null
    /** Nome exibido do app no modo app (padrão: o slug). */
    appName?: string
    /** URL do SSE da lib montado pelo app (`createSseHandler`); `null` desliga o tempo real. */
    events: string | null
    navigation: NavigationAdapter
    renderLink?: (props: RenderLinkProps) => ReactNode
    hrefs: EngramindHrefs
    /** Ícone de cada agente (`app/agente`); padrão: robô. */
    agentIcon: (agent: string) => LucideIcon
    /** Gravações por agente que o app conhece (selo "gravadas" do node do agente). */
    agentWrites?: (agent: string) => { total: number; last7d: number } | null
    /** Rótulos legíveis de canais (título e dica no lugar da ponta do slug). */
    channelLabels: ReadonlyMap<string, ChannelLabel>
    messages: Messages
    /** Prazo de desuso fixo (sobrepõe o do Engramind). */
    staleAfterDays?: number
    /** Ação "Configurar" (estado de reconfigurar, card do fim da página, apps sem agentes). */
    onConfigure?: () => void
    /** Conteúdo extra: o fim da página da rede e o detalhe do canal. */
    slots: {
        footer?: (context: FooterContext) => ReactNode
        channelDetail?: (slug: string) => ReactNode
    }
    /** Prefixo das chaves do `localStorage` (filtros da rede). */
    storagePrefix: string
}

export const defaultAgentIcon = (): LucideIcon => Bot

export const DEFAULT_CONFIG: EngramindConfig = {
    mode: "app",
    app: null,
    events: null,
    navigation: historyNavigation,
    hrefs: { network: "", channel: null },
    agentIcon: defaultAgentIcon,
    channelLabels: new Map(),
    messages: DEFAULT_MESSAGES,
    slots: {},
    storagePrefix: "engramind",
}

export const EngramindConfigContext = createContext<EngramindConfig>(DEFAULT_CONFIG)

export function useEngramindConfig(): EngramindConfig {
    return useContext(EngramindConfigContext)
}

/** `true` no modo gestor (Apps x canais, apps e configurações globais). */
export const useIsManager = () => useEngramindConfig().mode === "manager"

/** Texto pt-BR (ou o sobrescrito pelo app) de uma chave do dicionário. */
export function useT() {
    const { messages } = useEngramindConfig()
    return (key: keyof Messages, vars?: Record<string, string | number>) => format(messages[key] ?? DEFAULT_MESSAGES[key], vars)
}

export function format(template: string, vars?: Record<string, string | number>): string {
    if (!vars) return template
    return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match))
}
