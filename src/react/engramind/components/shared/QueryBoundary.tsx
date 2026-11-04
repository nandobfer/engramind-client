"use client"

import type { ReactNode } from "react"
import { KeyRound, Lock, PlugZap } from "lucide-react"
import { EmptyState } from "../../../components/feedback/EmptyState"
import { ErrorState } from "../../../components/feedback/ErrorState"
import { apiErrorCode, apiErrorMessage } from "../../../lib/api"
import { useEngramindConfig, useT } from "../../../lib/config"
import { needsReconnect } from "../../hooks/useEngramind"

interface QueryBoundaryProps {
    isLoading: boolean
    error: unknown
    onRetry: () => void
    skeleton: ReactNode
    /** Para onde levar quando a conexão precisa ser (re)configurada. */
    onConfigure?: () => void
    children: ReactNode
}

/** Erro de acesso do token de app (registro de outro app ou canal fora das assinaturas). */
export const isNoAccessError = (error: unknown) => {
    const code = apiErrorCode(error)
    return code === "ENGRAMIND_FOREIGN_APP" || code === "ENGRAMIND_CHANNEL_NOT_SUBSCRIBED"
}

/**
 * Carregando (skeleton), erro com "Tentar novamente", "Reconfigure o token" (401 do Engramind), "Sem
 * acesso" (`403 FOREIGN_APP`/`CHANNEL_NOT_SUBSCRIBED`) e o conteúdo. Fora do ar, proxy mascarado e `429`
 * (com o `Retry-After` na mensagem) mostram a mensagem pt-BR com "Tentar novamente".
 */
export function QueryBoundary({ isLoading, error, onRetry, skeleton, onConfigure, children }: QueryBoundaryProps) {
    const config = useEngramindConfig()
    const t = useT()
    const configure = onConfigure ?? config.onConfigure
    const manager = config.mode === "manager"
    if (isLoading) return <>{skeleton}</>
    if (error) {
        const reconnect = needsReconnect(error)
        if (reconnect === "configure") return <EmptyState icon={PlugZap} title="Configure a conexão" description={manager ? "Informe a URL base e o token admin do Engramind na aba Conexão." : "Informe a URL base e o token do app no servidor do app."} actionLabel={configure ? (manager ? "Ir para Conexão" : t("network.configure")) : undefined} onAction={configure} />
        if (reconnect === "token") return <EmptyState icon={KeyRound} title={manager ? "Reconfigure o token" : t("state.configure.title")} description={apiErrorMessage(error, t("state.configure.description"))} actionLabel={configure ? (manager ? "Ir para Conexão" : t("network.configure")) : undefined} onAction={configure} />
        if (isNoAccessError(error)) return <EmptyState icon={Lock} title={t("state.noAccess.title")} description={apiErrorMessage(error, t("state.noAccess.description"))} actionLabel={t("state.retry")} onAction={onRetry} />
        return <ErrorState description={apiErrorMessage(error, "Não foi possível falar com o Engramind.")} onRetry={onRetry} />
    }
    return <>{children}</>
}
