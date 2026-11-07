import { useContext } from "react"
import { Skeleton } from "../../../components/ui/skeleton"
import { cn } from "../../../lib/utils"
import { AGENT_NODE_SIZE_CLASS, NETWORK_CANVAS_CLASS, NETWORK_FILL_MIN_HEIGHT, NETWORK_SKELETON_AREA_CLASS, NETWORK_STATS_TOGGLE_CLASS } from "./layout-classes"
import { NetworkFillContext, useFillAvailableHeight } from "../../../hooks/useFillAvailableHeight"

/** Agentes em volta do centro e os canais de cada um em órbita ("Canais junto dos agentes", o padrão). */
const SKELETON_AGENTS = [0, 1, 2].map((index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / 3
    return { x: Math.cos(angle) * 150, y: Math.sin(angle) * 120, angle }
})

/**
 * Skeleton com as dimensões da rede: área do canvas (mesmo fundo), a visão inicial na distribuição
 * padrão (agentes em volta do centro, cada um com os seus canais em órbita, OPE-113) e o card de
 * estatísticas (a barra fica fora da carga). No celular, o card aparece recolhido (o botão do canto),
 * como na rede. `fill` preenche a altura disponível, como a rede (OPE-148).
 */
export function NetworkSkeleton({ className, fill: fillProp }: { className?: string; fill?: boolean }) {
    const fillContext = useContext(NetworkFillContext)
    const fill = fillProp ?? fillContext
    const filled = useFillAvailableHeight<HTMLDivElement>(fill, NETWORK_FILL_MIN_HEIGHT)
    return (
        <div ref={filled.ref} className={cn(NETWORK_CANVAS_CLASS, className)} style={filled.height !== null ? { height: filled.height } : undefined} aria-busy="true" data-testid="network-skeleton" data-fill={fill ? "true" : undefined}>
            <div className={NETWORK_SKELETON_AREA_CLASS} data-testid="network-skeleton-area">
                <div className="relative h-0 w-0">
                    {SKELETON_AGENTS.map((agent, index) => (
                        <div key={index}>
                            <Skeleton className={cn("absolute -translate-x-1/2 -translate-y-1/2 rounded-full", AGENT_NODE_SIZE_CLASS)} style={{ left: agent.x, top: agent.y }} data-testid="network-skeleton-agent" />
                            {[-0.7, 0.7].map((turn) => (
                                <Skeleton
                                    key={turn}
                                    className="absolute h-12 w-44 -translate-x-1/2 -translate-y-1/2 rounded-xl"
                                    style={{ left: agent.x + Math.cos(agent.angle + turn) * 150, top: agent.y + Math.sin(agent.angle + turn) * 110 }}
                                    data-testid="network-skeleton-channel"
                                />
                            ))}
                        </div>
                    ))}
                </div>
            </div>
            <div className={NETWORK_STATS_TOGGLE_CLASS} data-testid="network-skeleton-stats-toggle">
                <Skeleton className="h-4 w-40 max-md:w-24" />
            </div>
        </div>
    )
}
