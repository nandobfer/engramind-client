"use client"

import { useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { BarChart3, X } from "lucide-react"
import { AnimatedNumber } from "../../../components/motion/AnimatedNumber"
import { Button } from "../../../components/ui/button"
import { useIsMobile } from "../../../hooks/useMediaQuery"
import { NETWORK_STATS_CLASS, NETWORK_STATS_TOGGLE_CLASS } from "./layout-classes"

export interface StatRow {
    label: string
    value: number | string
    testId?: string
}

/**
 * Card de estatísticas do que está sendo visto (todas as visões); números animados. Em qualquer largura
 * começa recolhido num botão com o título e o `summary` (o card aberto cobre parte da rede) e abre por cima
 * do quadro. O estado vive enquanto a visão está montada: atualizações ao vivo, filtros e mudanças de layout
 * não recolhem o card; trocar de visão ou de universo o monta de novo, recolhido.
 */
export function StatsCard({ title, rows, summary, children }: { title: string; rows: StatRow[]; summary?: string; children?: React.ReactNode }) {
    const mobile = useIsMobile()
    const [open, setOpen] = useState(false)
    // O foco acompanha a troca (só depois de um clique): o botão novo só monta quando o antigo termina de sair.
    const interacted = useRef(false)
    const focusAfterSwap = (node: HTMLButtonElement | null) => {
        if (node && interacted.current) node.focus()
    }
    const toggle = (next: boolean) => {
        interacted.current = true
        setOpen(next)
    }
    const card = (
        <section aria-label="Estatísticas" data-testid="network-stats" className={NETWORK_STATS_CLASS}>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <BarChart3 className="h-3.5 w-3.5 text-primary" aria-hidden /> {title}
                <Button ref={focusAfterSwap} type="button" variant="ghost" size="icon" aria-label="Recolher estatísticas" aria-expanded className="ml-auto h-6 w-6 max-md:h-8 max-md:w-8" onClick={() => toggle(false)}>
                    <X className="h-4 w-4" aria-hidden />
                </Button>
            </h3>
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
                {rows.map((row) => (
                    <div key={row.label} className="contents">
                        <dt className="text-muted-foreground">{row.label}</dt>
                        <dd className="text-right font-medium tabular-nums text-foreground" data-testid={row.testId} data-value={row.value}>
                            {typeof row.value === "number" ? <AnimatedNumber value={row.value} /> : row.value}
                        </dd>
                    </div>
                ))}
            </dl>
            {children}
        </section>
    )
    return (
        <AnimatePresence initial={false} mode="wait">
            {open ? (
                <motion.div key="open" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.18 }} style={{ transformOrigin: "top right" }}>
                    {card}
                </motion.div>
            ) : (
                <motion.button
                    key="closed"
                    ref={focusAfterSwap}
                    type="button"
                    data-testid="network-stats-toggle"
                    aria-label={`Abrir estatísticas: ${title}`}
                    aria-expanded={false}
                    className={NETWORK_STATS_TOGGLE_CLASS}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.15 }}
                    style={{ transformOrigin: "top right" }}
                    onClick={() => toggle(true)}
                >
                    <BarChart3 className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                    <span className="max-w-60 truncate">{mobile ? (summary ?? title) : summary ? `${title} · ${summary}` : title}</span>
                </motion.button>
            )}
        </AnimatePresence>
    )
}

/** Lista "nome → total" (por canal, por agente) dentro do card. */
export function StatList({ title, items, colors, testId }: { title: string; items: { key: string; label: string; count: number; node?: React.ReactNode }[]; colors?: Map<string, string>; testId?: string }) {
    if (!items.length) return null
    return (
        <div className="mt-3 border-t pt-2" data-testid={testId}>
            <p className="mb-1 font-semibold text-foreground">{title}</p>
            <ul className="max-h-40 space-y-0.5 overflow-y-auto pr-1">
                {items.map((item) => (
                    <li key={item.key} className="flex items-center gap-1.5">
                        {colors && <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: colors.get(item.key) }} />}
                        {/* `node`: conteúdo no lugar do rótulo (ex.: `ChannelName`). */}
                        {item.node ?? (
                            <span className="min-w-0 flex-1 truncate text-muted-foreground" title={item.label}>
                                {item.label}
                            </span>
                        )}
                        <span className="tabular-nums text-foreground">
                            <AnimatedNumber value={item.count} />
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    )
}
