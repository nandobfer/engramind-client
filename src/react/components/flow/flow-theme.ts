import type { CSSProperties } from "react"
import type { BackgroundVariant } from "@xyflow/react"

/**
 * Tema dos canvas React Flow (rede do Engramind e outros canvas do app). Só tokens do tema do app
 * (`var(--color-*)` do Tailwind 4 e `color-mix`), sem cor fixa: a cor primária do app manda.
 *
 * O fundo segue o padrão das páginas (`bg-background`) com um brilho da cor primária bem suave no centro; o
 * React Flow fica transparente. O `colorMode="dark"` da biblioteca pinta o canvas, o minimapa e os
 * controles de cinza neutro fixo por uma folha de estilo fora das camadas do Tailwind: as variáveis no
 * `style` do próprio elemento (`FLOW_THEME_STYLE`) vencem essa folha. Os tipos de nó reservados da
 * biblioteca (`group`, `default`, `input`, `output`) ganham classe com fundo, padding e borda próprios:
 * os canvas usam tipos com prefixo do domínio, e as variáveis abaixo neutralizam o que sobrar.
 *
 * Cor e espessura das arestas vão no `style` inline do `path`: a folha do React Flow é importada fora
 * das camadas do Tailwind, então a regra `.react-flow__edge-path { stroke; stroke-width }` vence
 * qualquer classe utilitária (`stroke-primary`) e o atributo `strokeWidth` do SVG.
 */
export const FLOW_SURFACE_CLASS = "relative overflow-hidden rounded-xl border bg-background bg-[radial-gradient(ellipse_at_center,color-mix(in_oklab,var(--color-primary)_8%,transparent),transparent_70%)]"

/** Cor das linhas das arestas: a primária do tema (aplicar no `style` inline, ver acima). */
export const FLOW_EDGE_PRIMARY_STROKE = "var(--color-primary)"

export const FLOW_THEME_STYLE = {
    "--xy-background-color": "transparent",
    "--xy-background-pattern-color": "color-mix(in oklab, var(--color-muted-foreground) 18%, transparent)",
    "--xy-edge-stroke": "var(--color-border)",
    "--xy-node-background-color": "transparent",
    "--xy-node-border": "0",
    "--xy-node-color": "var(--color-foreground)",
    "--xy-node-group-background-color": "transparent",
    "--xy-node-border-radius": "var(--radius)",
    "--xy-node-boxshadow-hover": "none",
    "--xy-node-boxshadow-selected": "0 0 0 1px color-mix(in oklab, var(--color-primary) 60%, transparent)",
    "--xy-minimap-background-color": "color-mix(in oklab, var(--color-card) 90%, transparent)",
    "--xy-minimap-mask-background-color": "color-mix(in oklab, var(--color-background) 60%, transparent)",
    "--xy-minimap-mask-stroke-color": "color-mix(in oklab, var(--color-primary) 40%, transparent)",
    "--xy-minimap-node-background-color": "color-mix(in oklab, var(--color-primary) 50%, transparent)",
    "--xy-minimap-node-stroke-color": "transparent",
    "--xy-controls-button-background-color": "color-mix(in oklab, var(--color-card) 90%, transparent)",
    "--xy-controls-button-background-color-hover": "color-mix(in oklab, var(--color-primary) 15%, transparent)",
    "--xy-controls-button-color": "var(--color-foreground)",
    "--xy-controls-button-color-hover": "var(--color-foreground)",
    "--xy-controls-button-border-color": "var(--color-border)",
    "--xy-controls-box-shadow": "none",
    "--xy-attribution-background-color": "transparent",
} as CSSProperties

/** Pontos discretos do fundo (`<Background {...FLOW_BACKGROUND_PROPS} />`). */
export const FLOW_BACKGROUND_PROPS = { variant: "dots" as BackgroundVariant, gap: 28, size: 1 }
