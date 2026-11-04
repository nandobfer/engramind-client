"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Skeleton } from "../../../components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs"
import { useT } from "../../../lib/config"
import type { EngramindAgent, EngramindApp, EngramindChannel, EngramindSubscription, EngramindToken } from "../../types"
import { useEngramindList, useEngramindRealtime } from "../../hooks/useEngramind"
import { useOwnApp } from "../../hooks/useEngramindNetwork"
import { QueryBoundary } from "../shared/QueryBoundary"
import { AgentDetail } from "./AgentDetail"
import { AgentsCard } from "./AgentsCard"
import { ChannelsCard } from "./ChannelsCard"
import { TokensCard } from "./TokensCard"
import { WebhookCard } from "./WebhookCard"

const fade = { initial: { opacity: 0, y: 4 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.18 } } as const
const slide = { initial: { opacity: 0, x: 12 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -12 }, transition: { duration: 0.18 } } as const

export type AppSettingsTab = "agents" | "channels" | "tokens" | "webhook"

/**
 * Configuração do app no Engramind (modo app, só o token do próprio app): Agentes e assinaturas, Canais,
 * Tokens de agente (o segredo aparece uma única vez) e Webhook. Sem funções de gestor (outros apps,
 * tokens admin ou de app, configurações globais).
 */
export function EngramindAppSettings({ defaultTab = "agents" }: { defaultTab?: AppSettingsTab }) {
    useEngramindRealtime()
    const t = useT()
    const own = useOwnApp()
    const enabled = own.slug !== null
    const agents = useEngramindList<EngramindAgent>("agents", "agents", { app: own.slug }, { all: true, enabled })
    const tokens = useEngramindList<EngramindToken>("tokens", "tokens", { app: own.slug }, { all: true, enabled })
    const subscriptions = useEngramindList<EngramindSubscription>("subscriptions", "subscriptions", {}, { all: true, enabled })
    const channels = useEngramindList<EngramindChannel>("channels", "channels", { include_archived: true }, { all: true, enabled })
    const [agentId, setAgentId] = useState<string | null>(null)
    const app: EngramindApp | null = own.slug ? { id: own.slug, slug: own.slug, name: own.slug, description: null, created_at: "", disabled_at: null, webhook: null } : null
    const apps = app ? [app] : []
    const agentTokens = tokens.items.filter((token) => token.kind === "agent")
    const agent = agentId ? agents.items.find((item) => item.id === agentId) : undefined
    const queries = [agents, tokens, subscriptions, channels]
    const error = own.error ?? queries.find((query) => query.error)?.error ?? null
    return (
        <QueryBoundary isLoading={own.isLoading || queries.some((query) => query.isLoading)} error={error} onRetry={() => queries.forEach((query) => void query.refetch())} skeleton={<AppSettingsSkeleton />}>
            <AnimatePresence mode="wait" initial={false}>
                {agent && app ? (
                    <motion.div key={`agent-${agent.id}`} {...slide}>
                        <AgentDetail agent={agent} apps={apps} agents={agents.items} tokens={tokens.items} subscriptions={subscriptions.items} ownTokenIds={[]} onBack={() => setAgentId(null)} />
                    </motion.div>
                ) : (
                    <motion.div key="tabs" {...slide}>
                        <Tabs defaultValue={defaultTab}>
                            <TabsList className="flex-wrap">
                                <TabsTrigger value="agents">
                                    {t("config.agents.title")} ({agents.items.length})
                                </TabsTrigger>
                                <TabsTrigger value="channels">
                                    {t("config.channels.title")} ({channels.items.length})
                                </TabsTrigger>
                                <TabsTrigger value="tokens">
                                    {t("config.tokens.title")} ({agentTokens.length})
                                </TabsTrigger>
                                <TabsTrigger value="webhook">{t("config.webhook.title")}</TabsTrigger>
                            </TabsList>
                            <TabsContent value="agents">
                                <motion.div {...fade}>
                                    <AgentsCard agents={agents.items} apps={apps} subscriptions={subscriptions.items} onOpen={(item) => setAgentId(item.id)} />
                                </motion.div>
                            </TabsContent>
                            <TabsContent value="channels">
                                <motion.div {...fade}>
                                    <ChannelsCard channels={channels.items} agents={agents.items} subscriptions={subscriptions.items} />
                                </motion.div>
                            </TabsContent>
                            <TabsContent value="tokens">
                                <motion.div {...fade}>
                                    {app && <TokensCard title={t("config.tokens.title")} info="Tokens agent dos agentes do app: alcançam só os canais que o agente assina. O segredo aparece uma única vez." tokens={agentTokens} apps={apps} agents={agents.items} ownTokenIds={[]} issuePreset={{ app: app.slug, agentOnly: true }} emptyDescription="Nenhum token de agente." />}
                                </motion.div>
                            </TabsContent>
                            <TabsContent value="webhook">
                                <motion.div {...fade}>{app && <WebhookCard app={app.slug} />}</motion.div>
                            </TabsContent>
                        </Tabs>
                    </motion.div>
                )}
            </AnimatePresence>
        </QueryBoundary>
    )
}

export function AppSettingsSkeleton() {
    return (
        <div className="flex flex-col gap-4" aria-busy="true" data-testid="app-settings-skeleton">
            <Skeleton className="h-9 w-full max-w-md" />
            <div className="space-y-3 rounded-xl border p-6">
                <Skeleton className="h-5 w-24" />
                {Array.from({ length: 3 }, (_, row) => (
                    <Skeleton key={row} className="h-[4.5rem] w-full" />
                ))}
            </div>
        </div>
    )
}
