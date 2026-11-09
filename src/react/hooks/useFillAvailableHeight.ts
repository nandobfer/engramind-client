import { createContext, useEffect, useLayoutEffect, useRef, useState } from "react"

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect

/**
 * Padrão do modo `fill` para as redes abaixo (OPE-148): o `EngramindNetwork` liga para todas as visões
 * (skeleton, Apps x canais, Agentes x canais e universos) sem repassar a prop a cada uma.
 */
export const NetworkFillContext = createContext<NetworkFillMode>(false)

/**
 * Modo de altura das redes: `false` (altura da classe), `true` (preenche a sobra da área que rola, OPE-148)
 * ou `"viewport"` (OPE-151): o bloco da rede, da âncora `[data-network-fill-root]` até o fim do canvas,
 * ocupa a altura visível da área que rola, sem contar o conteúdo abaixo dele.
 */
export type NetworkFillMode = boolean | "viewport"

/** Atributo da âncora do modo `"viewport"`: o topo do bloco que, com o canvas, cabe na área visível. */
export const NETWORK_FILL_ROOT_ATTRIBUTE = "data-network-fill-root"
/** Props para marcar a âncora do modo `"viewport"` (ex.: o invólucro de um skeleton fora da lib). */
export const NETWORK_FILL_ROOT_PROPS = { [NETWORK_FILL_ROOT_ATTRIBUTE]: "" } as const
/**
 * Âncora "bloco" do modo `"viewport"` (OPE-151): o elemento inteiro (ex.: o card que envolve a rede, com o
 * cabeçalho em cima e o padding embaixo) cabe na altura visível; o canvas fica com o que sobra dentro dele.
 */
export const NETWORK_FILL_BLOCK_PROPS = { [NETWORK_FILL_ROOT_ATTRIBUTE]: "block" } as const

/**
 * Espaço do bloco fora do canvas no modo `"viewport"`: com a âncora de topo, o que fica entre o topo dela e o
 * topo do canvas; com a âncora "bloco", a altura da âncora menos a do canvas (o que fica acima e abaixo). Sem
 * âncora, zero.
 */
export function fillOutside(element: HTMLElement, anchor: HTMLElement | null, scroller: HTMLElement): number {
    if (!anchor) return 0
    if (anchor.getAttribute(NETWORK_FILL_ROOT_ATTRIBUTE) === "block") return anchor.offsetHeight - element.offsetHeight
    return layoutTop(element, scroller) - layoutTop(anchor, scroller)
}

/** Diferença (px) abaixo da qual a altura não muda: evita oscilar entre medidas arredondadas. */
export const FILL_TOLERANCE_PX = 1

/**
 * Próxima altura do elemento que preenche a área disponível (função pura): cresce a sobra abaixo do
 * conteúdo da área que rola (`available − content`) e encolhe quando o conteúdo transborda, nunca abaixo
 * de `min`. É um ponto fixo: medir de novo depois de aplicar devolve a mesma altura.
 */
export function nextFillHeight({ current, available, content, min }: { current: number; available: number; content: number; min: number }): number {
    const next = Math.max(min, Math.round(current + available - content))
    return Math.abs(next - current) <= FILL_TOLERANCE_PX ? current : next
}

/**
 * Próxima altura do canvas no modo `"viewport"` (função pura, OPE-151): a altura visível da área que rola
 * (`visible`, já sem o padding) menos o que fica acima do canvas dentro do bloco (`above`), nunca abaixo de
 * `min`. Ignora o conteúdo abaixo do canvas, que fica para rolar. Ponto fixo, com a mesma tolerância.
 */
export function viewportFillHeight({ current, visible, above, min }: { current: number; visible: number; above: number; min: number }): number {
    const next = Math.max(min, Math.round(visible - above))
    return Math.abs(next - current) <= FILL_TOLERANCE_PX ? current : next
}

/** Altura visível da área que rola sem o padding de cima e de baixo: a folga do modo `"viewport"` em relação a `100dvh`. */
export function visibleScrollHeight(scroller: HTMLElement): number {
    const style = getComputedStyle(scroller)
    return scroller.clientHeight - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0)
}

/**
 * Topo do elemento no layout (soma de `offsetTop` pela cadeia de `offsetParent` até `stop`), sem o efeito de
 * `transform` das animações de entrada. A diferença entre dois elementos da mesma cadeia é a distância entre eles.
 */
export function layoutTop(element: HTMLElement, stop: HTMLElement): number {
    let top = 0
    let node: HTMLElement | null = element
    while (node && node !== stop) {
        top += node.offsetTop
        node = node.offsetParent as HTMLElement | null
    }
    return top
}

const SCROLLABLE = /(auto|scroll|overlay)/

/** Ancestral que rola na vertical (ou o documento). */
export function findScrollParent(element: HTMLElement): HTMLElement {
    let node = element.parentElement
    while (node && node !== document.body && node !== document.documentElement) {
        if (SCROLLABLE.test(getComputedStyle(node).overflowY)) return node
        node = node.parentElement
    }
    return (document.scrollingElement as HTMLElement | null) ?? document.documentElement
}

/**
 * Altura do conteúdo da área que rola: o fim do filho mais baixo (com a margem) mais o padding de baixo.
 * Usa `offsetTop`/`offsetHeight` quando o filho se posiciona na própria área (sem efeito de `transform`
 * das animações de entrada); senão, a caixa na tela.
 */
export function scrollContentHeight(scroller: HTMLElement): number {
    const style = getComputedStyle(scroller)
    const paddingBottom = parseFloat(style.paddingBottom) || 0
    const document_ = scroller === document.scrollingElement || scroller === document.documentElement
    const children = Array.from((document_ ? document.body : scroller).children) as HTMLElement[]
    const rect = scroller.getBoundingClientRect()
    let bottom = 0
    for (const child of children) {
        const childStyle = getComputedStyle(child)
        if (childStyle.position === "absolute" || childStyle.position === "fixed" || childStyle.display === "none") continue
        const margin = parseFloat(childStyle.marginBottom) || 0
        const end = child.offsetParent === scroller ? child.offsetTop + child.offsetHeight : child.getBoundingClientRect().bottom - rect.top - scroller.clientTop + scroller.scrollTop
        bottom = Math.max(bottom, end + margin)
    }
    return bottom + paddingBottom
}

/**
 * Faz o elemento preencher a altura da área que rola (OPE-148), com um mínimo: a sobra abaixo do conteúdo
 * (`true`) ou a altura visível menos o bloco acima do canvas (`"viewport"`, OPE-151). Mede antes da pintura e
 * de novo quando a área, o conteúdo ou o bloco mudam de tamanho. `height` é `null` até a primeira medida (e
 * quando o modo é `false`: a altura volta à classe).
 */
export function useFillAvailableHeight<T extends HTMLElement>(mode: NetworkFillMode, min: number) {
    const ref = useRef<T>(null)
    const [height, setHeight] = useState<number | null>(null)
    useIsomorphicLayoutEffect(() => {
        const element = ref.current
        if (!mode || !element) {
            setHeight(null)
            return
        }
        const scroller = findScrollParent(element)
        const anchor = mode === "viewport" ? element.closest<HTMLElement>(`[${NETWORK_FILL_ROOT_ATTRIBUTE}]`) : null
        let frame = 0
        const measure = () => {
            // Escondido (aba inativa, `display: none`): sem medida, fica como está.
            if (!element.isConnected || element.offsetParent === null) return
            const current = element.offsetHeight
            const next =
                mode === "viewport"
                    ? viewportFillHeight({ current, visible: visibleScrollHeight(scroller), above: fillOutside(element, anchor, scroller), min })
                    : nextFillHeight({ current, available: scroller.clientHeight, content: scrollContentHeight(scroller), min })
            if (next === current) return
            element.style.height = `${next}px`
            setHeight(next)
        }
        measure()
        const schedule = () => {
            cancelAnimationFrame(frame)
            frame = requestAnimationFrame(measure)
        }
        const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule)
        if (observer) {
            observer.observe(scroller)
            const root = scroller === document.scrollingElement || scroller === document.documentElement ? document.body : scroller
            for (const child of Array.from(root.children)) observer.observe(child)
            // Trilha e filtros que mudam de altura (quebra de linha, erro de busca) movem o topo do canvas.
            if (anchor) observer.observe(anchor)
        }
        window.addEventListener("resize", schedule)
        return () => {
            cancelAnimationFrame(frame)
            observer?.disconnect()
            window.removeEventListener("resize", schedule)
        }
    }, [mode, min])
    return { ref, height }
}
