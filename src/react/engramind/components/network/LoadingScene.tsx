"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Bot } from "lucide-react"
import { cn } from "../../../lib/utils"
import { useEngramindConfig } from "../../../lib/config"
import {
    LOADING_CROWN_RADIUS,
    LOADING_HALO_MS,
    LOADING_PARTICLE_PERIOD_MS,
    LOADING_PULSE_COUNT,
    LOADING_PULSE_MS,
    LOADING_TRAVEL_EASE,
    LOADING_TRAVEL_MS,
    loadingCycleDelay,
    loadingSceneEpoch,
    loadingSceneParticles,
    loadingSceneRings,
    loadingSceneScale,
} from "../../network/loading-scene"
import { UNIVERSE_CENTER_SIZE_CLASS } from "./layout-classes"

const PARTICLES = loadingSceneParticles()

/** Escala da cena pela área disponível (a cena inteira cabe no canvas, inclusive no celular). */
function useSceneScale(radius: number) {
    const ref = useRef<HTMLDivElement>(null)
    const [scale, setScale] = useState(1)
    useEffect(() => {
        const element = ref.current?.parentElement
        if (!element) return
        const measure = () => setScale(loadingSceneScale(element.clientWidth, element.clientHeight, radius))
        measure()
        const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure)
        observer?.observe(element)
        return () => observer?.disconnect()
    }, [radius])
    return { ref, scale }
}

/**
 * Prévia do universo enquanto a rede carrega (OPE-157): o nó do agente no centro com o halo respirando,
 * partículas da coroa viajando até ele, pulsos saindo do centro e os anéis do universo bem tênues. Só
 * `transform`/`opacity` com Framer Motion; com movimento reduzido, a cena fica parada (sem partículas e
 * pulsos) e o layout é o mesmo.
 */
export function LoadingScene({ agent }: { agent?: string }) {
    const config = useEngramindConfig()
    const reducedMotion = useReducedMotion()
    const Icon = agent ? config.agentIcon(agent) : Bot
    const rings = useMemo(() => loadingSceneRings(config.universeLayout), [config.universeLayout])
    const outer = Math.max(LOADING_CROWN_RADIUS, rings[rings.length - 1] ?? 0)
    const { ref, scale } = useSceneScale(outer)
    // Momento do ciclo em que esta cena entra (fixo durante a vida do componente).
    const [elapsed] = useState(() => {
        const now = Date.now()
        return now - loadingSceneEpoch(now)
    })
    const animated = !reducedMotion
    return (
        <div ref={ref} className="relative h-0 w-0" style={scale !== 1 ? { transform: `scale(${scale})` } : undefined} aria-hidden data-testid="network-loading-scene" data-motion={animated ? "on" : "off"}>
            {rings.map((radius) => (
                <span key={radius} className="absolute rounded-full border border-dashed border-foreground/10" style={{ width: radius * 2, height: radius * 2, left: -radius, top: -radius }} data-testid="network-skeleton-channel" />
            ))}
            {animated &&
                Array.from({ length: LOADING_PULSE_COUNT }, (_, index) => (
                    <motion.span
                        key={`pulse-${index}`}
                        className={cn("absolute -ml-8 -mt-8 rounded-full border border-primary/40", UNIVERSE_CENTER_SIZE_CLASS)}
                        initial={{ scale: 1, opacity: 0 }}
                        animate={{ scale: [1, 2.6], opacity: [0.4, 0] }}
                        transition={{ duration: LOADING_PULSE_MS / 1000, ease: "easeOut", repeat: Infinity, delay: loadingCycleDelay((index * LOADING_PULSE_MS) / LOADING_PULSE_COUNT, elapsed, LOADING_PULSE_MS) / 1000 }}
                        data-testid="network-loading-pulse"
                    />
                ))}
            {animated &&
                PARTICLES.map((particle, index) => (
                    <motion.span
                        key={`particle-${index}`}
                        className={cn("absolute rounded-full", particle.light ? "bg-foreground/60" : "bg-primary")}
                        style={{ width: particle.size, height: particle.size, marginLeft: -particle.size / 2, marginTop: -particle.size / 2 }}
                        initial={{ x: particle.x, y: particle.y, opacity: 0, scale: 1 }}
                        animate={{ x: [particle.x, 0], y: [particle.y, 0], opacity: [0, 1, 1, 0], scale: [1, 1, 0.4] }}
                        transition={{
                            duration: LOADING_TRAVEL_MS / 1000,
                            ease: LOADING_TRAVEL_EASE,
                            repeat: Infinity,
                            repeatDelay: (LOADING_PARTICLE_PERIOD_MS - LOADING_TRAVEL_MS) / 1000,
                            delay: loadingCycleDelay(particle.delayMs, elapsed, LOADING_PARTICLE_PERIOD_MS) / 1000,
                        }}
                        data-testid="network-loading-particle"
                    />
                ))}
            <motion.span
                className="absolute -ml-12 -mt-12 h-24 w-24 rounded-full bg-primary/20 blur-xl"
                initial={{ scale: 1, opacity: 0.45 }}
                animate={animated ? { scale: [1, 1.12, 1], opacity: [0.35, 0.6, 0.35] } : { scale: 1, opacity: 0.45 }}
                transition={animated ? { duration: LOADING_HALO_MS / 1000, ease: "easeInOut", repeat: Infinity, delay: loadingCycleDelay(0, elapsed, LOADING_HALO_MS) / 1000 } : { duration: 0 }}
                data-testid="network-loading-halo"
            />
            <span className={cn("absolute -ml-8 -mt-8 flex items-center justify-center rounded-full border-2 border-primary/50 bg-primary/10 text-primary/60", UNIVERSE_CENTER_SIZE_CLASS)} data-testid="network-skeleton-agent" data-agent={agent}>
                <Icon className="h-7 w-7" aria-hidden />
            </span>
        </div>
    )
}
