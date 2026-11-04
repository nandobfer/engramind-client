import { createElement } from "react"
import type { LucideIcon } from "lucide-react"
import { useEngramindConfig } from "../../../lib/config"

/** Ícone de cada agente (`agentIcon` do provider; padrão: o robô genérico). */
export function useAgentIcon(): (agent: string) => LucideIcon {
    return useEngramindConfig().agentIcon
}

/** Ícone do agente como elemento (sem criar componente durante o render). */
export const AgentIcon = ({ agent, className }: { agent: string; className?: string }) => {
    const icon = useAgentIcon()
    return createElement(icon(agent), { className, "aria-hidden": true })
}
