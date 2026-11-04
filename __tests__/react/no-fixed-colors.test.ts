import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = path.resolve(__dirname, "../../src")
const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : /\.(ts|tsx)$/.test(entry.name) ? [path.join(dir, entry.name)] : []))
const PALETTE = "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose"
const FORBIDDEN: [string, RegExp][] = [
    ["cor hexadecimal", /#[0-9a-fA-F]{3,8}\b/],
    ["rgb()/hsl() fixo", /\b(rgba?|hsla?)\(\s*\d/],
    ["hsl(var(--x)) (quebra com tokens oklch do shadcn)", /hsla?\(var\(--/],
    ["classe de paleta do Tailwind", new RegExp(`\\b(bg|text|border|fill|stroke|ring|from|to|via|outline|shadow|accent|caret|divide|decoration)-(${PALETTE})-\\d{2,3}\\b`)],
    ["preto/branco fixo", /\b(bg|text|border|fill|stroke)-(black|white)\b/],
]
/** Linhas de código (comentários fora). */
const codeLines = (file: string) =>
    fs
        .readFileSync(file, "utf8")
        .split("\n")
        .map((line, index) => ({ line, index: index + 1 }))
        .filter(({ line }) => !/^\s*(\/\/|\*|\/\*)/.test(line))

describe("sem cor fixa no pacote", () => {
    it("todo o código usa só tokens do tema do app (var(--color-*), --chart-*, classes por token)", () => {
        const offenders: string[] = []
        for (const file of walk(ROOT)) for (const { line, index } of codeLines(file)) for (const [label, pattern] of FORBIDDEN) if (pattern.test(line)) offenders.push(`${path.relative(ROOT, file)}:${index} (${label})`)
        expect(offenders).toEqual([])
    })
})
