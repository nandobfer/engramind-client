/** Prefixo das chaves do TanStack Query da lib (`["engramind", <área>, ...]`). */
export const ENGRAMIND_QUERY_KEY = "engramind"

export const ENGRAMIND_SCOPES = ["read", "write", "delete"] as const
export type EngramindScope = (typeof ENGRAMIND_SCOPES)[number]
export const SCOPE_COMBINATIONS = ["read", "read+write", "read+delete", "read+write+delete"] as const
export type ScopeCombination = (typeof SCOPE_COMBINATIONS)[number]
export const scopesOfCombination = (combination: ScopeCombination): EngramindScope[] => combination.split("+") as EngramindScope[]
export function combinationOf(scopes: readonly string[]): ScopeCombination | null {
    const key = ENGRAMIND_SCOPES.filter((scope) => scopes.includes(scope)).join("+")
    return (SCOPE_COMBINATIONS as readonly string[]).includes(key) && key.split("+").length === scopes.length ? (key as ScopeCombination) : null
}

export const TOKEN_KINDS = ["admin", "app", "agent"] as const
export const SUBSCRIPTION_MODES = ["inject", "search", "manage"] as const
export const MEMORY_STATUSES = ["active", "permanent", "archived"] as const
