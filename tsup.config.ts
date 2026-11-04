import { defineConfig } from "tsup"

/** ESM + tipos. O pacote React leva `"use client"` no topo (Next.js App Router). */
export default defineConfig([
    {
        entry: { index: "src/index.ts", server: "src/server/index.ts", ai: "src/ai/index.ts" },
        format: ["esm"],
        dts: true,
        sourcemap: true,
        clean: true,
        target: "es2022",
        platform: "node",
        splitting: true,
    },
    {
        entry: { react: "src/react/index.ts" },
        format: ["esm"],
        dts: true,
        sourcemap: true,
        target: "es2022",
        platform: "browser",
        banner: { js: '"use client";' },
    },
])
