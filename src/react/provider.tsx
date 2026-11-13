"use client"

import { useMemo, type ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { resolveUniverseLayout, type UniverseLayoutConfig } from "../core/universe-layout"
import { TooltipProvider } from "./components/ui/tooltip"
import { setActiveDataSource, type EngramindDataSource } from "./lib/api"
import { DEFAULT_CONFIG, defaultAgentIcon, EngramindConfigContext, type EngramindConfig, type EngramindHrefs, type ConfigureTarget, type EngramindMode, type FooterContext, type RenderLinkProps } from "./lib/config"
import { mergeMessages, type PartialMessages } from "./lib/messages"
import type { NavigationAdapter } from "./lib/navigation"
import { setNotifier, type Notify } from "./lib/toast"
import type { ChannelLabel } from "./engramind/network/channel-labels"
import type { RelatedMap } from "./engramind/network/related-edges"

export interface EngramindProviderProps {
    /** Fonte de dados: o proxy da lib montado pelo app (`createHttpDataSource({ basePath })`). */
    dataSource: EngramindDataSource
    /** `app` (padrão): token do próprio app. `manager`: só para o gestor da rede (token admin). */
    mode?: EngramindMode
    /** URL do SSE da lib (`createSseHandler`); sem ela, a tela atualiza só pelas próprias ações e ao reconsultar. */
    events?: string | null
    /** Slug do app do token (modo app); sem ele, a lib lê de `whoami`. */
    app?: string | null
    /** Nome exibido do app (modo app). */
    appName?: string
    /** Toasts do app (ex.: `sonner`). */
    notify?: Notify
    /** Navegação do roteador do app (ex.: `next/navigation`); padrão: History API. */
    navigation?: NavigationAdapter
    /** Link interno do app (ex.: `next/link`); padrão: `<a>`. */
    renderLink?: (props: RenderLinkProps) => ReactNode
    hrefs?: Partial<EngramindHrefs>
    agentIcon?: (agent: string) => LucideIcon
    agentWrites?: (agent: string) => { total: number; last7d: number } | null
    channelLabels?: ReadonlyMap<string, ChannelLabel>
    /** Textos sobrescritos (chave ausente usa o padrão pt-BR). */
    messages?: PartialMessages
    staleAfterDays?: number
    onConfigure?: (target?: ConfigureTarget) => void
    slots?: { footer?: (context: FooterContext) => ReactNode; channelDetail?: (slug: string) => ReactNode }
    /** Layout dos universos (parcial: o que faltar assume o padrão; valor inválido cai no padrão). */
    universeLayout?: Partial<UniverseLayoutConfig> | null
    /** Similares de cada memória (id → `{ id, score }[]`): arestas e ordem com `links = "related"` (OPE-164). */
    relatedMemories?: RelatedMap
    storagePrefix?: string
    children: ReactNode
}

/**
 * Raiz dos componentes do Engramind. O app monta dentro do próprio `QueryClientProvider` (TanStack Query)
 * e do próprio login: o provider só leva a fonte de dados (o proxy), o SSE e os adaptadores do app.
 * Uma fonte de dados por página: dois providers com fontes diferentes na mesma tela usam a última montada.
 */
export function EngramindProvider(props: EngramindProviderProps) {
    const { dataSource, notify, children } = props
    setActiveDataSource(dataSource)
    setNotifier(notify ?? null)
    const { mode, events, app, appName, navigation, renderLink, hrefs, agentIcon, agentWrites, channelLabels, messages, staleAfterDays, onConfigure, slots, storagePrefix, universeLayout, relatedMemories } = props
    const layoutKey = JSON.stringify(universeLayout ?? null)
    // A chave serializada evita um objeto novo a cada render do app.
    const resolvedLayout = useMemo(() => resolveUniverseLayout(universeLayout), [layoutKey])
    const config = useMemo<EngramindConfig>(
        () => ({
            ...DEFAULT_CONFIG,
            mode: mode ?? "app",
            events: events ?? null,
            app: app ?? null,
            appName,
            navigation: navigation ?? DEFAULT_CONFIG.navigation,
            renderLink,
            hrefs: { ...DEFAULT_CONFIG.hrefs, ...hrefs },
            agentIcon: agentIcon ?? defaultAgentIcon,
            agentWrites,
            channelLabels: channelLabels ?? DEFAULT_CONFIG.channelLabels,
            messages: mergeMessages(messages),
            staleAfterDays,
            onConfigure,
            slots: slots ?? {},
            universeLayout: resolvedLayout,
            relatedMemories,
            storagePrefix: storagePrefix ?? DEFAULT_CONFIG.storagePrefix,
        }),
        [resolvedLayout, mode, events, app, appName, navigation, renderLink, hrefs, agentIcon, agentWrites, channelLabels, messages, staleAfterDays, onConfigure, slots, storagePrefix, relatedMemories],
    )
    return (
        <EngramindConfigContext.Provider value={config}>
            <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        </EngramindConfigContext.Provider>
    )
}
