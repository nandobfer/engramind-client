import { z } from "zod"
import { MEMORY_STATUSES, SUBSCRIPTION_MODES, TOKEN_KINDS } from "./constants"
import { scopesSchema } from "./scopes"

/**
 * Schemas de entrada das operações que a lib usa (os mesmos do catálogo do Opex): o formulário valida com
 * eles e o proxy valida o corpo antes de chamar o Engramind.
 */

const limit = z.number().int().min(1).max(200).optional().describe("Itens por página (1 a 200, padrão 50)")
const cursor = z.string().trim().min(1).max(500).optional().describe("Cursor da próxima página (next_cursor)")
const page = { cursor, limit }
const isoDate = z.string().trim().datetime({ offset: true, message: "Use data e hora RFC 3339 (ex.: 2026-10-31T12:00:00Z)" })

/** Slug hierárquico do canal (`eng/global`): minúsculas, dígitos e hífens; até 8 segmentos e 120 caracteres. */
export const channelSlugSchema = z
    .string()
    .trim()
    .max(120, "Até 120 caracteres")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*){0,7}$/, "Use segmentos com minúsculas, dígitos e hífens simples, separados por /")
const channelRef = z.string().trim().min(1).max(160).describe("Id (ch_…) ou slug do canal (eng/global)")
const identitySlug = z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use minúsculas, dígitos e hífens simples")
const appRef = z.string().trim().min(1).max(80).describe("Id (app_…) ou slug do app")
const agentRef = z.string().trim().min(1).max(160).describe("Id (ag_…) ou app/agente")
const tokenRef = z.string().trim().min(1).max(40).describe("Id do token (tk_…)")
const memoryRef = z.string().trim().min(1).max(60).describe("Id da memória (m_…)")
const name = z.string().trim().min(1, "Informe o nome").max(120)
const description = z.string().trim().max(1000).nullable().optional()
const priority = z.number().int().min(-1000).max(1000)
const webhookUrl = z.string().trim().url("URL inválida").max(2048).regex(/^https?:\/\//, "Use http:// ou https://").nullable().optional()
const webhookSecret = z.string().min(32, "O segredo do webhook tem de 32 a 256 caracteres").max(256).nullable().optional()
/** Alvo de assinatura: canal exato (`eng/global`) ou prefixo com um segmento completo antes do `*` (`eng/*`, `eng/projeto-*`). */
export function isValidSubscriptionTarget(value: string): boolean {
    if (!value.endsWith("*")) return channelSlugSchema.safeParse(value).success
    const base = value.slice(0, -1)
    const slash = base.lastIndexOf("/")
    if (slash <= 0) return false
    return channelSlugSchema.safeParse(base.slice(0, slash)).success && /^[a-z0-9-]*$/.test(base.slice(slash + 1))
}
const subscriptionTarget = z
    .string()
    .trim()
    .min(1)
    .max(121)
    .refine(isValidSubscriptionTarget, "Canal exato (eng/global) ou prefixo terminado em * depois de um segmento completo (eng/*, eng/projeto-*)")
export const createAgentInput = z.object({ app: appRef, slug: identitySlug, name, description })
export const updateAgentInput = z.object({ agent: agentRef, name: name.optional(), description, disabled: z.boolean().optional() })
export const updateTokenInput = z.object({ token: tokenRef, label: z.string().trim().max(120).nullable().optional(), scopes: scopesSchema.optional(), expires_at: isoDate.nullable().optional() })
export const createChannelInput = z.object({ slug: channelSlugSchema, name, description, priority: priority.optional() })
export const updateChannelInput = z.object({ channel: channelRef, name: name.optional(), description, priority: priority.optional() })
export const subscribeInput = z.object({ agent: agentRef, target: subscriptionTarget, mode: z.enum(SUBSCRIPTION_MODES), access: scopesSchema.nullable().optional(), priority: priority.nullable().optional() })
export const updateSubscriptionInput = z.object({ subscription: z.string().trim().min(1).max(40), mode: z.enum(SUBSCRIPTION_MODES).optional(), access: scopesSchema.nullable().optional(), priority: priority.nullable().optional() })
export const issueTokenInput = z
.object({
    kind: z.enum(TOKEN_KINDS),
    app: appRef.optional(),
    agent: agentRef.optional(),
    scopes: scopesSchema,
    label: z.string().trim().max(120).optional(),
    expires_at: isoDate.optional(),
})
.superRefine((value, ctx) => {
    if (value.kind === "agent" && !value.agent) ctx.addIssue({ code: "custom", path: ["agent"], message: "Token agent exige o agente" })
    if (value.kind === "admin" && !value.app && !value.agent) ctx.addIssue({ code: "custom", path: ["app"], message: "Informe o app do token admin" })
    if (value.kind === "app" && !value.app) ctx.addIssue({ code: "custom", path: ["app"], message: "Informe o app do token de app" })
    if (value.kind === "app" && value.agent) ctx.addIssue({ code: "custom", path: ["agent"], message: "Token de app não tem agente" })
})
    .meta({ examples: [{ kind: "agent", agent: "app-a/curador", scopes: ["read", "write"] }] })

export const createMemoryInput = z.object({ channel: channelRef, text: z.string().min(1), category: z.string().trim().min(1).max(64).optional(), key: z.string().trim().max(200).optional(), tags: z.array(z.string()).optional() })
export const updateMemoryInput = z.object({ text: z.string().min(1).optional(), category: z.string().trim().min(1).max(64).optional(), expected_version: z.number().int().optional(), tags: z.array(z.string()).optional() })
export const moveMemoryInput = z.object({ channel: channelRef })
/** `update_app_webhook`: `url: null` remove a URL e o segredo; URL exige segredo (o enviado ou o já gravado). */
export const appWebhookInput = z.object({ url: webhookUrl, secret: webhookSecret }).strict()
export const memoryStatusSchema = z.enum(MEMORY_STATUSES)
export { memoryRef, tokenRef, agentRef, appRef, channelRef, cursor, limit, page }
