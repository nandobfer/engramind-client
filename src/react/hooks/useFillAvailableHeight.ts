import { createContext, useEffect, useLayoutEffect, useRef, useState } from "react"

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect

/**
 * Padrão do modo `fill` para as redes abaixo (OPE-148): o `EngramindNetwork` liga para todas as visões
 * (skeleton, Apps x canais, Agentes x canais e universos) sem repassar a prop a cada uma.
 */
export const NetworkFillContext = createContext(false)

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
 * Faz o elemento preencher a altura que sobra na área que rola (OPE-148), com um mínimo. Mede antes da
 * pintura e de novo quando a área ou o conteúdo mudam de tamanho. `height` é `null` até a primeira medida
 * (e quando `enabled` é falso: a altura volta à classe).
 */
export function useFillAvailableHeight<T extends HTMLElement>(enabled: boolean, min: number) {
    const ref = useRef<T>(null)
    const [height, setHeight] = useState<number | null>(null)
    useIsomorphicLayoutEffect(() => {
        const element = ref.current
        if (!enabled || !element) {
            setHeight(null)
            return
        }
        const scroller = findScrollParent(element)
        let frame = 0
        const measure = () => {
            // Escondido (aba inativa, `display: none`): sem medida, fica como está.
            if (!element.isConnected || element.offsetParent === null) return
            const current = element.offsetHeight
            const next = nextFillHeight({ current, available: scroller.clientHeight, content: scrollContentHeight(scroller), min })
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
        }
        window.addEventListener("resize", schedule)
        return () => {
            cancelAnimationFrame(frame)
            observer?.disconnect()
            window.removeEventListener("resize", schedule)
        }
    }, [enabled, min])
    return { ref, height }
}
