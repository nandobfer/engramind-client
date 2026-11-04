"use client"

import Link from "../../../../lib/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "../../../../components/ui/button"
import { Skeleton } from "../../../../components/ui/skeleton"
import { CadastroHeader } from "../../../../components/list/CadastroHeader"
import { useEngramindConfig } from "../../../../lib/config"
import { CHANNEL_HELP } from "../../../help/identities"
import type { EngramindChannel } from "../../../types"
import { route, useEngramindQuery, useEngramindRealtime } from "../../../hooks/useEngramind"
import { HelpBadge } from "../../shared/Badges"
import { QueryBoundary } from "../../shared/QueryBoundary"
import { SubscribersCard } from "./SubscribersCard"

/** Link de volta à rede, com o universo do canal aberto. */
export function networkHref(network: string, params: Record<string, string>): string {
    const query = new URLSearchParams(params).toString()
    return query ? `${network}?${query}` : network
}

/** Detalhe do canal: assinantes e o conteúdo extra do app (`slots.channelDetail`, ex.: configurações do canal). */
export function ChannelDetail({ slug }: { slug: string }) {
    useEngramindRealtime()
    const { hrefs, slots, onConfigure } = useEngramindConfig()
    const channel = useEngramindQuery<EngramindChannel>(route("channels", slug))
    return (
        <div className="flex flex-col gap-6">
            <CadastroHeader title={channel.data?.name ?? slug} description={`Canal ${slug}`}>
                <Button asChild variant="outline" size="sm">
                    <Link href={networkHref(hrefs.network, { universo: `canal:${slug}` })}>
                        <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden /> Rede
                    </Link>
                </Button>
            </CadastroHeader>
            <QueryBoundary
                isLoading={channel.isLoading}
                error={channel.error}
                onRetry={() => void channel.refetch()}
                onConfigure={onConfigure}
                skeleton={
                    <div className="flex flex-col gap-6" aria-busy="true">
                        <Skeleton className="h-48 w-full rounded-xl" />
                        <Skeleton className="h-64 w-full rounded-xl" />
                    </div>
                }
            >
                {channel.data && (
                    <div className="flex flex-col gap-6">
                        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                            {channel.data.description && <span>{channel.data.description}</span>}
                            <HelpBadge value={`prioridade ${channel.data.priority}`} help={CHANNEL_HELP.priority} />
                            <HelpBadge value={`versão ${channel.data.version}`} help={CHANNEL_HELP.version} />
                            {channel.data.archived_at && <HelpBadge value="arquivado" help={CHANNEL_HELP.archived} />}
                        </div>
                        <SubscribersCard channel={channel.data.slug} />
                        {slots.channelDetail?.(channel.data.slug)}
                    </div>
                )}
            </QueryBoundary>
        </div>
    )
}
