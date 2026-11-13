import { z } from "zod"

/**
 * Configuração do layout do universo de memórias (OPE-142): disposição, ordem, distâncias, desvio e
 * tamanho das partículas. Módulo puro e isomórfico: o app valida e grava com o mesmo schema que a lib usa
 * para desenhar. O padrão reproduz o desenho original (anéis concêntricos a partir do raio 150, mais novas
 * por dentro, sem desvio).
 */

export const UNIVERSE_LAYOUT_SCHEMA_ID = "engramind-universe-layout"
export const UNIVERSE_LAYOUT_VERSION = 1

export const UNIVERSE_LAYOUTS = ["rings", "spiral"] as const
export const UNIVERSE_ORDERS = ["newest-inside", "newest-outside"] as const
export const UNIVERSE_ORDER_BY = ["created", "updated", "last-use", "uses"] as const
export const UNIVERSE_GROUPINGS = ["none", "channel"] as const
export const UNIVERSE_BALANCES = ["proportional", "fill"] as const
/** `center`: cada memória ligada ao centro; `related`: arestas entre memórias similares (OPE-164). */
export const UNIVERSE_LINKS = ["center", "related"] as const

/** Os campos numéricos: padrão, intervalo (fechado), passo do campo, unidade e se é inteiro. */
export const UNIVERSE_NUMBER_FIELDS = {
    firstRadius: { default: 150, min: 40, max: 800, step: 1, unit: "px" },
    ringGap: { default: 58, min: 16, max: 400, step: 1, unit: "px" },
    slot: { default: 46, min: 12, max: 300, step: 1, unit: "px" },
    minPerRing: { default: 6, min: 1, max: 100, step: 1, unit: "", integer: true },
    ringRotationDeg: { default: 34.95, min: 0, max: 360, step: 0.05, unit: "°" },
    spiralSpacing: { default: 48, min: 12, max: 200, step: 1, unit: "px" },
    spiralAngleDeg: { default: 137.508, min: 1, max: 359, step: 0.001, unit: "°" },
    angleJitter: { default: 0, min: 0, max: 100, step: 1, unit: "%" },
    radiusJitter: { default: 0, min: 0, max: 49, step: 1, unit: "%" },
    jitterSeed: { default: 0, min: 0, max: 999999, step: 1, unit: "", integer: true },
    minDistance: { default: 42, min: 0, max: 200, step: 1, unit: "px" },
    particleMinPx: { default: 10, min: 4, max: 60, step: 1, unit: "px" },
    particleMaxPx: { default: 34, min: 4, max: 120, step: 1, unit: "px" },
    /**
     * Arestas que partem de cada memória no modo `related`. Até 3: o `similar` de `get_memory` do Engramind
     * devolve no máximo 3 memórias do mesmo canal (decisão do dono na OPE-164).
     */
    relatedMax: { default: 3, min: 1, max: 3, step: 1, unit: "", integer: true },
} as const satisfies Record<string, { default: number; min: number; max: number; step: number; unit: string; integer?: boolean }>

export type UniverseNumberField = keyof typeof UNIVERSE_NUMBER_FIELDS

export interface UniverseLayoutConfig {
    /** `rings`: anéis concêntricos; `spiral`: espiral de girassol (sem anéis). */
    layout: (typeof UNIVERSE_LAYOUTS)[number]
    /** `newest-inside`: o maior valor do critério (mais novas, mais recentes, mais usadas) perto do centro. */
    order: (typeof UNIVERSE_ORDERS)[number]
    /** Critério da ordem: criação, atualização, último uso ou uso (consultas + injeções). */
    orderBy: (typeof UNIVERSE_ORDER_BY)[number]
    /** `channel`: as memórias do mesmo canal ficam juntas (setores contíguos). */
    grouping: (typeof UNIVERSE_GROUPINGS)[number]
    /** `proportional`: anéis proporcionais às vagas; `fill`: enche cada anel antes do próximo. */
    balance: (typeof UNIVERSE_BALANCES)[number]
    /** Raio do primeiro anel (e início da espiral), em px. */
    firstRadius: number
    /** Distância entre anéis, em px. */
    ringGap: number
    /** Espaço entre vizinhas no mesmo anel, em px (define quantas cabem). */
    slot: number
    /** Mínimo de vagas de um anel. */
    minPerRing: number
    /** Giro de cada anel em relação ao anterior, em graus. */
    ringRotationDeg: number
    /** Distância aproximada entre vizinhas na espiral, em px. */
    spiralSpacing: number
    /** Ângulo entre memórias consecutivas na espiral, em graus (137,508 = ângulo de ouro). */
    spiralAngleDeg: number
    /** Desvio máximo do ângulo, em % do passo angular. */
    angleJitter: number
    /** Desvio máximo do raio, em % da distância entre anéis (abaixo de 50 %, as faixas dos anéis não se misturam). */
    radiusJitter: number
    /** Número que embaralha o desvio (estável: o mesmo número dá sempre as mesmas posições). */
    jitterSeed: number
    /** Reduz o desvio até a partícula ficar a `minDistance` das outras. */
    avoidOverlap: boolean
    /** Distância mínima entre os centros de duas partículas, em px. */
    minDistance: number
    /** Tamanho da partícula menos usada, em px. */
    particleMinPx: number
    /** Tamanho da partícula mais usada, em px. */
    particleMaxPx: number
    /** `center`: links ao centro; `related`: arestas entre similares, com a ordem do anel aproximando as similares. */
    links: (typeof UNIVERSE_LINKS)[number]
    /** Arestas que partem de cada memória (só com `links = related`). */
    relatedMax: number
    /** Link destacado do agente do centro às memórias que ele criou (nenhum preset muda este campo). */
    authorLinks: boolean
}

export const DEFAULT_UNIVERSE_LAYOUT: UniverseLayoutConfig = {
    layout: "rings",
    order: "newest-inside",
    orderBy: "created",
    grouping: "none",
    balance: "proportional",
    firstRadius: UNIVERSE_NUMBER_FIELDS.firstRadius.default,
    ringGap: UNIVERSE_NUMBER_FIELDS.ringGap.default,
    slot: UNIVERSE_NUMBER_FIELDS.slot.default,
    minPerRing: UNIVERSE_NUMBER_FIELDS.minPerRing.default,
    ringRotationDeg: UNIVERSE_NUMBER_FIELDS.ringRotationDeg.default,
    spiralSpacing: UNIVERSE_NUMBER_FIELDS.spiralSpacing.default,
    spiralAngleDeg: UNIVERSE_NUMBER_FIELDS.spiralAngleDeg.default,
    angleJitter: UNIVERSE_NUMBER_FIELDS.angleJitter.default,
    radiusJitter: UNIVERSE_NUMBER_FIELDS.radiusJitter.default,
    jitterSeed: UNIVERSE_NUMBER_FIELDS.jitterSeed.default,
    avoidOverlap: true,
    minDistance: UNIVERSE_NUMBER_FIELDS.minDistance.default,
    particleMinPx: UNIVERSE_NUMBER_FIELDS.particleMinPx.default,
    particleMaxPx: UNIVERSE_NUMBER_FIELDS.particleMaxPx.default,
    links: "center",
    relatedMax: UNIVERSE_NUMBER_FIELDS.relatedMax.default,
    authorLinks: true,
}

const FIELD_LABEL: Record<keyof UniverseLayoutConfig, string> = {
    layout: "Disposição",
    order: "Sentido",
    orderBy: "Critério",
    grouping: "Agrupamento",
    balance: "Distribuição nos anéis",
    firstRadius: "Raio do primeiro anel",
    ringGap: "Distância entre anéis",
    slot: "Espaço entre vizinhas",
    minPerRing: "Mínimo de vagas por anel",
    ringRotationDeg: "Giro de cada anel",
    spiralSpacing: "Espaço entre vizinhas na espiral",
    spiralAngleDeg: "Ângulo da espiral",
    angleJitter: "Desvio do ângulo",
    radiusJitter: "Desvio do raio",
    jitterSeed: "Semente do desvio",
    avoidOverlap: "Evitar sobreposição",
    minDistance: "Distância mínima entre partículas",
    particleMinPx: "Tamanho mínimo da partícula",
    particleMaxPx: "Tamanho máximo da partícula",
    links: "Links",
    relatedMax: "Arestas por memória",
    authorLinks: "Link do agente às memórias que ele criou",
}

export const universeFieldLabel = (field: keyof UniverseLayoutConfig): string => FIELD_LABEL[field]

const numberField = (field: UniverseNumberField) => {
    const spec: { default: number; min: number; max: number; unit: string; integer?: boolean } = UNIVERSE_NUMBER_FIELDS[field]
    const label = FIELD_LABEL[field]
    const unit = spec.unit ? ` ${spec.unit}` : ""
    let schema = z
        .number({ error: `${label}: informe um número` })
        .min(spec.min, `${label}: o mínimo é ${spec.min}${unit}`)
        .max(spec.max, `${label}: o máximo é ${spec.max}${unit}`)
    if (spec.integer) schema = schema.int(`${label}: informe um número inteiro`)
    return schema.default(spec.default)
}

const choice = <T extends readonly [string, ...string[]]>(field: keyof UniverseLayoutConfig, values: T, fallback: T[number]) =>
    z.enum(values, { error: `${FIELD_LABEL[field]}: use ${values.map((value) => `"${value}"`).join(", ")}` }).default(fallback)

/** Schema da configuração: campo ausente assume o padrão; campo desconhecido ou fora do intervalo é recusado. */
export const universeLayoutSchema = z
    .strictObject({
        layout: choice("layout", UNIVERSE_LAYOUTS, DEFAULT_UNIVERSE_LAYOUT.layout),
        order: choice("order", UNIVERSE_ORDERS, DEFAULT_UNIVERSE_LAYOUT.order),
        orderBy: choice("orderBy", UNIVERSE_ORDER_BY, DEFAULT_UNIVERSE_LAYOUT.orderBy),
        grouping: choice("grouping", UNIVERSE_GROUPINGS, DEFAULT_UNIVERSE_LAYOUT.grouping),
        balance: choice("balance", UNIVERSE_BALANCES, DEFAULT_UNIVERSE_LAYOUT.balance),
        firstRadius: numberField("firstRadius"),
        ringGap: numberField("ringGap"),
        slot: numberField("slot"),
        minPerRing: numberField("minPerRing"),
        ringRotationDeg: numberField("ringRotationDeg"),
        spiralSpacing: numberField("spiralSpacing"),
        spiralAngleDeg: numberField("spiralAngleDeg"),
        angleJitter: numberField("angleJitter"),
        radiusJitter: numberField("radiusJitter"),
        jitterSeed: numberField("jitterSeed"),
        avoidOverlap: z.boolean({ error: `${FIELD_LABEL.avoidOverlap}: use verdadeiro ou falso` }).default(DEFAULT_UNIVERSE_LAYOUT.avoidOverlap),
        minDistance: numberField("minDistance"),
        particleMinPx: numberField("particleMinPx"),
        particleMaxPx: numberField("particleMaxPx"),
        links: choice("links", UNIVERSE_LINKS, DEFAULT_UNIVERSE_LAYOUT.links),
        relatedMax: numberField("relatedMax"),
        authorLinks: z.boolean({ error: `${FIELD_LABEL.authorLinks}: use verdadeiro ou falso` }).default(DEFAULT_UNIVERSE_LAYOUT.authorLinks),
    })
    .refine((value) => value.particleMaxPx >= value.particleMinPx, { path: ["particleMaxPx"], error: "Tamanho máximo da partícula: não pode ser menor que o mínimo" })

export type UniverseLayoutInput = z.input<typeof universeLayoutSchema>

/** Completa com o padrão o que faltar e descarta o que é inválido (chave desconhecida ou valor fora do intervalo cai no padrão). */
export function resolveUniverseLayout(partial?: Partial<UniverseLayoutConfig> | null): UniverseLayoutConfig {
    if (!partial) return DEFAULT_UNIVERSE_LAYOUT
    const parsed = universeLayoutSchema.safeParse(partial)
    return parsed.success ? parsed.data : DEFAULT_UNIVERSE_LAYOUT
}

export interface UniverseLayoutIssue {
    /** Campo (vazio = o texto inteiro). */
    path: string
    message: string
}

export type UniverseLayoutParseResult = { ok: true; config: UniverseLayoutConfig } | { ok: false; errors: UniverseLayoutIssue[] }

/** Erros do schema em pt-BR, um por campo (chave desconhecida vira "Campo desconhecido"). */
export function universeLayoutIssues(error: z.ZodError): UniverseLayoutIssue[] {
    const issues: UniverseLayoutIssue[] = []
    for (const issue of error.issues) {
        if (issue.code === "unrecognized_keys") {
            for (const key of issue.keys) issues.push({ path: key, message: `Campo desconhecido: "${key}"` })
            continue
        }
        issues.push({ path: issue.path.map(String).join("."), message: issue.message })
    }
    return issues
}

/** Valida um objeto já lido (corpo da API); campos ausentes assumem o padrão. */
export function parseUniverseLayout(value: unknown): UniverseLayoutParseResult {
    const parsed = universeLayoutSchema.safeParse(value)
    return parsed.success ? { ok: true, config: parsed.data } : { ok: false, errors: universeLayoutIssues(parsed.error) }
}

/**
 * Importação: recebe o JSON exportado (ou só os campos que o dono quer mudar). `$schema` e `version` são
 * aceitos; o resto passa pelo schema. JSON inválido ou fora do schema devolve a lista de erros e nada mais.
 */
export function parseUniverseLayoutJson(text: string): UniverseLayoutParseResult {
    let raw: unknown
    try {
        raw = JSON.parse(text)
    } catch (error) {
        const reason = error instanceof Error ? error.message : "formato inesperado"
        return { ok: false, errors: [{ path: "", message: `JSON inválido: ${reason}` }] }
    }
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, errors: [{ path: "", message: "O JSON precisa ser um objeto com os campos da configuração" }] }
    const { $schema, version, ...fields } = raw as Record<string, unknown>
    if ($schema !== undefined && $schema !== UNIVERSE_LAYOUT_SCHEMA_ID) return { ok: false, errors: [{ path: "$schema", message: `Esse JSON não é uma configuração do universo ("${UNIVERSE_LAYOUT_SCHEMA_ID}")` }] }
    if (version !== undefined && version !== UNIVERSE_LAYOUT_VERSION) return { ok: false, errors: [{ path: "version", message: `Versão não suportada: use ${UNIVERSE_LAYOUT_VERSION}` }] }
    return parseUniverseLayout(fields)
}

/** JSON para exportar: indentado, com o identificador do formato e a versão. */
export function formatUniverseLayoutJson(config: UniverseLayoutConfig): string {
    return JSON.stringify({ $schema: UNIVERSE_LAYOUT_SCHEMA_ID, version: UNIVERSE_LAYOUT_VERSION, ...config }, null, 2)
}

/** Dois configs iguais campo a campo. */
export const sameUniverseLayout = (a: UniverseLayoutConfig, b: UniverseLayoutConfig): boolean => (Object.keys(DEFAULT_UNIVERSE_LAYOUT) as (keyof UniverseLayoutConfig)[]).every((key) => a[key] === b[key])

export interface UniverseLayoutPreset {
    id: string
    label: string
    description: string
    config: UniverseLayoutConfig
}

const preset = (overrides: Partial<UniverseLayoutConfig>): UniverseLayoutConfig => ({ ...DEFAULT_UNIVERSE_LAYOUT, ...overrides })

/** Pontos de partida prontos (todos passam pelo schema). */
export const UNIVERSE_LAYOUT_PRESETS: readonly UniverseLayoutPreset[] = [
    { id: "rings", label: "Anéis (padrão)", description: "Anéis concêntricos perfeitos, as mais novas por dentro.", config: DEFAULT_UNIVERSE_LAYOUT },
    {
        id: "loose-rings",
        label: "Anéis soltos",
        description: "Mais espaço, desvio leve de ângulo e raio e as mais novas por fora.",
        config: preset({ ringGap: 84, slot: 68, angleJitter: 35, radiusJitter: 32, order: "newest-outside" }),
    },
    { id: "spiral", label: "Espiral", description: "Espiral de girassol, sem anéis visíveis.", config: preset({ layout: "spiral" }) },
    {
        id: "related",
        label: "Relacionadas",
        description: "Anéis largos com desvio, as mais novas por fora; memórias similares lado a lado, ligadas entre si.",
        // Valores fixos: a configuração salva no Opex em 13/11/2026 (OPE-164), mais os links entre similares.
        config: preset({
            layout: "rings",
            orderBy: "created",
            order: "newest-outside",
            grouping: "none",
            balance: "proportional",
            firstRadius: 150,
            ringGap: 200,
            slot: 120,
            minPerRing: 6,
            ringRotationDeg: 34.95,
            spiralSpacing: 48,
            spiralAngleDeg: 137.508,
            angleJitter: 35,
            radiusJitter: 32,
            jitterSeed: 0,
            avoidOverlap: true,
            minDistance: 42,
            particleMinPx: 10,
            particleMaxPx: 34,
            links: "related",
            relatedMax: 3,
        }),
    },
]

/** Campos que aplicar um preset não muda (ficam como estão no formulário). */
export const PRESET_KEPT_FIELDS = ["authorLinks"] as const satisfies readonly (keyof UniverseLayoutConfig)[]

/** Configuração do preset, mantendo de `values` os campos que nenhum preset muda (`authorLinks`). */
export function applyUniverseLayoutPreset(values: UniverseLayoutConfig, preset: Pick<UniverseLayoutPreset, "config">): UniverseLayoutConfig {
    const next: UniverseLayoutConfig = { ...preset.config }
    for (const field of PRESET_KEPT_FIELDS) (next as unknown as Record<string, unknown>)[field] = values[field]
    return next
}

/** `values` é o preset (ignorando os campos que nenhum preset muda)? */
export function matchesUniverseLayoutPreset(values: UniverseLayoutConfig, preset: Pick<UniverseLayoutPreset, "config">): boolean {
    return sameUniverseLayout(applyUniverseLayoutPreset(values, preset), values)
}
