"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Settings } from "lucide-react"
import { Button } from "../../../components/ui/button"
import { OptionTabs } from "../../../components/ui/option-tabs"
import { useEngramindConfig, useT, type FooterContext } from "../../../lib/config"
import { OVERVIEW_LAYOUT_LABEL, OVERVIEW_LAYOUT_MODES } from "../../network/overview-layout"
import { Section } from "../shared/Section"

const LAYOUT_OPTIONS = OVERVIEW_LAYOUT_MODES.map((mode) => ({ value: mode, label: OVERVIEW_LAYOUT_LABEL[mode] }))

/**
 * Fim da página da rede: o `slots.footer` do app (ex.: o card "O que é o Engramind" do Opex) ou, sem ele,
 * um card com a distribuição da visão inicial (Órbita ou Radial; só fora dos universos) e Configurar.
 */
export function NetworkFooter(context: FooterContext) {
    const { slots, onConfigure } = useEngramindConfig()
    const t = useT()
    if (slots.footer) return <>{slots.footer(context)}</>
    const { layout } = context
    if (!layout && !onConfigure) return null
    return (
        <Section
            title="Rede"
            className="mt-3"
            actions={
                <div data-testid="network-footer-actions" className="flex flex-wrap items-center gap-2">
                    <AnimatePresence initial={false}>
                        {layout && (
                            <motion.div key="layout" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                                <OptionTabs aria-label={t("network.layout")} size="sm" options={LAYOUT_OPTIONS} value={layout.value} onChange={layout.onChange} />
                            </motion.div>
                        )}
                    </AnimatePresence>
                    {onConfigure && (
                        <Button type="button" size="sm" variant="outline" onClick={() => onConfigure("connection")}>
                            <Settings className="mr-1.5 h-3.5 w-3.5" aria-hidden /> {t("network.configure")}
                        </Button>
                    )}
                </div>
            }
        >
            <p className="text-sm text-muted-foreground">Agentes, canais e memórias do app no Engramind.</p>
        </Section>
    )
}
