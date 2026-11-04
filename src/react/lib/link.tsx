"use client"

import type { AnchorHTMLAttributes, ReactNode } from "react"
import { useEngramindConfig } from "./config"

export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
    href: string
    children?: ReactNode
}

/** Link interno: usa o `renderLink` do provider (ex.: `next/link`) ou um `<a>`. */
export default function Link({ href, children, ...props }: LinkProps) {
    const { renderLink } = useEngramindConfig()
    if (renderLink) return <>{renderLink({ href, children, ...props })}</>
    return (
        <a href={href} {...props}>
            {children}
        </a>
    )
}
