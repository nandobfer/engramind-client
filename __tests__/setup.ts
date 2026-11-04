import { afterEach } from "vitest"
import { MotionGlobalConfig } from "framer-motion"

// Sem animação real nos testes (cancelar uma animação no desmonte rejeita uma promise fora do teste).
MotionGlobalConfig.skipAnimations = true

afterEach(async () => {
    if (typeof document !== "undefined") {
        const { cleanup } = await import("@testing-library/react")
        cleanup()
    }
})
