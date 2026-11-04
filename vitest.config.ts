import { defineConfig } from "vitest/config"

export default defineConfig({
    test: {
        include: ["__tests__/**/*.test.ts", "__tests__/**/*.test.tsx"],
        environment: "node",
        globals: true,
        setupFiles: ["__tests__/setup.ts"],
        // Ambiente de DOM por arquivo: `@vitest-environment happy-dom`.
    },
})
