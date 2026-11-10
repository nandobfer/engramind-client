import { useContext } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { cn } from "../../../lib/utils"
import { useT } from "../../../lib/config"
import { NETWORK_CANVAS_CLASS, NETWORK_FILL_MIN_HEIGHT, NETWORK_SKELETON_AREA_CLASS, NETWORK_STATS_TOGGLE_CLASS } from "./layout-classes"
import { NetworkFillContext, useFillAvailableHeight, type NetworkFillMode } from "../../../hooks/useFillAvailableHeight"
import { LoadingScene } from "./LoadingScene"

/**
 * Carregamento da rede (OPE-157): a área do canvas (mesmo fundo e altura) com a prévia animada do universo
 * (`LoadingScene`: nó do agente, partículas convergindo, pulsos e anéis tênues) e o card de estatísticas
 * recolhido no canto, como na rede. `fill` preenche a altura disponível, como a rede (OPE-148/OPE-151);
 * `agent` (`app/agente`) mostra o ícone do agente no centro. Anuncia o carregamento ao leitor de tela.
 */
export function NetworkSkeleton({ className, fill: fillProp, agent }: { className?: string; fill?: NetworkFillMode; agent?: string }) {
    const t = useT()
    const reducedMotion = useReducedMotion()
    const fillContext = useContext(NetworkFillContext)
    const fill = fillProp ?? fillContext
    const filled = useFillAvailableHeight<HTMLDivElement>(fill, NETWORK_FILL_MIN_HEIGHT)
    return (
        <div ref={filled.ref} className={cn(NETWORK_CANVAS_CLASS, className)} style={filled.height !== null ? { height: filled.height } : undefined} role="status" aria-busy="true" aria-live="polite" data-testid="network-skeleton" data-fill={fill ? String(fill) : undefined}>
            <span className="sr-only">{t("network.loading")}</span>
            <div className={NETWORK_SKELETON_AREA_CLASS} data-testid="network-skeleton-area">
                <LoadingScene agent={agent} />
            </div>
            <div className={NETWORK_STATS_TOGGLE_CLASS} aria-hidden data-testid="network-skeleton-stats-toggle">
                <motion.span
                    className="h-2 w-2 rounded-full bg-primary"
                    initial={{ opacity: 0.6 }}
                    animate={reducedMotion ? { opacity: 0.6 } : { opacity: [0.35, 1, 0.35] }}
                    transition={reducedMotion ? { duration: 0 } : { duration: 1.6, ease: "easeInOut", repeat: Infinity }}
                />
                <span className="text-muted-foreground">{t("network.loadingShort")}</span>
            </div>
        </div>
    )
}
