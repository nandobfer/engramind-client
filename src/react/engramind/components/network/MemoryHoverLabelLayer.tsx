"use client"

import { useLayoutEffect, useRef, useState } from "react"
import { useStore } from "@xyflow/react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { clampLabelRect, HOVER_LABEL_MAX_WIDTH, type Point } from "../../network/network-math"
import type { ParticleVisual } from "../../network/particles"
import type { NetworkMemory } from "../../network/types"

/** Estimativa antes da primeira medida (uma linha). */
const FALLBACK_SIZE = { width: HOVER_LABEL_MAX_WIDTH, height: 28 }

/**
 * Nome completo da memória sob o cursor (D12, OPE-130), destacado: no lugar do nome curto cortado da
 * partícula. Fica numa camada FORA da área com zoom (filho do React Flow, irmão do viewport), como o card
 * da memória: o tamanho e a fonte não dependem do zoom, nenhuma partícula vizinha o cobre e ele não muda
 * os objetos dos nodes (o hover vem do contexto). Sempre inteiro no quadro (`clampLabelRect`); sem
 * eventos de ponteiro, para não roubar o hover nem o clique da partícula.
 */
export function MemoryHoverLabelLayer({ memory, visual, point }: { memory: NetworkMemory | null; visual?: ParticleVisual; point?: Point }) {
    const reducedMotion = useReducedMotion()
    return (
        <AnimatePresence>
            {memory && visual && point && (
                <HoverLabel key={memory.id} memory={memory} visual={visual} point={point} reducedMotion={reducedMotion === true} />
            )}
        </AnimatePresence>
    )
}

function HoverLabel({ memory, visual, point, reducedMotion }: { memory: NetworkMemory; visual: ParticleVisual; point: Point; reducedMotion: boolean }) {
    const tx = useStore((state) => state.transform[0])
    const ty = useStore((state) => state.transform[1])
    const zoom = useStore((state) => state.transform[2])
    const canvasWidth = useStore((state) => state.width)
    const canvasHeight = useStore((state) => state.height)
    const ref = useRef<HTMLDivElement>(null)
    const [size, setSize] = useState(FALLBACK_SIZE)
    useLayoutEffect(() => {
        const element = ref.current
        if (!element) return
        const measured = { width: element.offsetWidth || FALLBACK_SIZE.width, height: element.offsetHeight || FALLBACK_SIZE.height }
        setSize((current) => (current.width === measured.width && current.height === measured.height ? current : measured))
    }, [memory.title])
    const anchor = { x: point.x * zoom + tx, y: point.y * zoom + ty }
    const particle = Math.max(visual.size * zoom * 1.35, 6)
    const rect = clampLabelRect(anchor, particle, size, { width: canvasWidth || size.width + 16, height: canvasHeight || size.height + 16 })
    const offset = rect.placement === "below" ? -4 : 4
    return (
        <motion.div
            ref={ref}
            role="tooltip"
            data-testid="memory-hover-label"
            data-placement={rect.placement}
            className="pointer-events-none absolute z-20 w-max rounded-md border bg-popover/95 px-2 py-1 text-xs font-medium leading-snug text-foreground shadow-lg"
            style={{ left: rect.x, top: rect.y, maxWidth: HOVER_LABEL_MAX_WIDTH, borderLeftWidth: 3, borderLeftColor: visual.archived ? undefined : visual.color }}
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: offset }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: offset }}
            transition={{ duration: reducedMotion ? 0 : 0.15, ease: "easeOut" }}
        >
            <span className="whitespace-normal break-words">{memory.title}</span>
        </motion.div>
    )
}
