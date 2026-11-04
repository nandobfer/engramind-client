"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { KeyRound, Loader2, Save, Trash2 } from "lucide-react"
import { Button } from "../../../components/ui/button"
import { ConfirmDialog } from "../../../components/ui/confirm-dialog"
import { Input } from "../../../components/ui/input"
import { SecretReveal } from "../../../components/ui/secret-reveal"
import { apiErrorMessage } from "../../../lib/api"
import { useT } from "../../../lib/config"
import { appWebhookInput } from "../../../../core/schemas"
import type { EngramindApp } from "../../types"
import { engramindSend, route, useEngramindMutation, useEngramindQuery } from "../../hooks/useEngramind"
import { HelpBadge } from "../shared/Badges"
import { formatDateTime } from "../shared/format"
import { InfoField } from "../shared/InfoField"
import { Section } from "../shared/Section"

/** Segredo novo do webhook: 32 bytes aleatórios em hexadecimal (64 caracteres, dentro de 32 a 256). */
export function generateWebhookSecret(): string {
    const bytes = new Uint8Array(32)
    crypto.getRandomValues(bytes)
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

/**
 * Webhook do app (`update_app_webhook`): registrar a URL, gerar ou rotacionar o segredo (mostrado uma
 * única vez, para o app gravar no servidor dele) e remover. A leitura do estado atual usa `get_app`; se o
 * Engramind não a liberar para o token de app, a tela mostra só o que foi gravado nesta visita.
 */
export function WebhookCard({ app }: { app: string }) {
    const t = useT()
    const current = useEngramindQuery<EngramindApp>(route("apps", app), undefined, {})
    const [saved, setSaved] = useState<EngramindApp["webhook"] | undefined>(undefined)
    const webhook = saved !== undefined ? saved : current.data?.webhook
    const [url, setUrl] = useState<string | null>(null)
    const value = url ?? webhook?.url ?? ""
    const [secret, setSecret] = useState<string | null>(null)
    const [removing, setRemoving] = useState(false)
    const parsed = appWebhookInput.safeParse({ url: value.trim() || null })
    const save = useEngramindMutation((body: { url: string | null; secret?: string | null }) => engramindSend<EngramindApp | { app?: EngramindApp }>("put", route("apps", app, "webhook"), body), { invalidate: ["apps"], success: t("config.webhook.saved") })
    const apply = (body: { url: string | null; secret?: string | null }, onDone?: () => void) =>
        save.mutate(body, {
            onSuccess: (result) => {
                const next = (result && "webhook" in result ? result : (result as { app?: EngramindApp } | null)?.app)?.webhook
                setSaved(next ?? (body.url ? { url: body.url, secret: { configured: Boolean(body.secret) || Boolean(webhook?.secret.configured), updated_at: body.secret ? new Date().toISOString() : (webhook?.secret.updated_at ?? null) } } : null))
                setUrl(null)
                onDone?.()
            },
        })
    const rotate = () => {
        const next = generateWebhookSecret()
        apply({ url: value.trim(), secret: next }, () => setSecret(next))
    }
    // A URL exige um segredo (o enviado ou o já gravado): sem segredo conhecido, salvar gera um.
    const saveUrl = () => (webhook?.secret.configured ? apply({ url: value.trim() }) : rotate())
    return (
        <Section title={t("config.webhook.title")} info="Destino dos eventos dos canais que os agentes do app assinam (memórias, consumo, canais, assinaturas e identidades), assinados com HMAC-SHA256.">
            <div className="space-y-4" data-testid="webhook-card">
                {current.isError && saved === undefined && <p className="text-xs text-muted-foreground">Estado atual indisponível para este token ({apiErrorMessage(current.error)}). Gravar continua funcionando.</p>}
                <InfoField id="webhook-url" label={t("config.webhook.url")} info="URL pública do handler de webhook da lib montado pelo app (ex.: https://meu-app.com/api/engramind/webhook)." error={value && !parsed.success ? parsed.error.issues[0]?.message : undefined}>
                    <Input id="webhook-url" value={value} onChange={(event) => setUrl(event.target.value)} placeholder="https://meu-app.com/api/engramind/webhook" />
                </InfoField>
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground" data-testid="webhook-state">
                    {webhook?.url ? (
                        webhook.secret.configured ? (
                            <HelpBadge value={t("config.webhook.configured")} tone="secondary" help={`Gravado em ${formatDateTime(webhook.secret.updated_at)}`} />
                        ) : (
                            <HelpBadge value="sem segredo" tone="warning" help="Sem segredo, o app não consegue validar a assinatura: gere um." />
                        )
                    ) : (
                        t("config.webhook.notConfigured")
                    )}
                </p>
                <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" disabled={!value.trim() || !parsed.success || save.isPending} onClick={saveUrl}>
                        {save.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : <Save className="mr-1.5 h-3.5 w-3.5" aria-hidden />} {t("config.webhook.save")}
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="bg-transparent" disabled={!value.trim() || !parsed.success || save.isPending} onClick={rotate}>
                        <KeyRound className="mr-1.5 h-3.5 w-3.5" aria-hidden /> {t("config.webhook.rotate")}
                    </Button>
                    {webhook?.url && (
                        <Button type="button" size="sm" variant="ghost" disabled={save.isPending} onClick={() => setRemoving(true)}>
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden /> {t("config.webhook.remove")}
                        </Button>
                    )}
                </div>
                <AnimatePresence initial={false}>
                    {secret && (
                        <motion.div key="secret" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} className="space-y-2">
                            <SecretReveal value={secret} noun="Segredo" hint={t("config.webhook.secretOnce")} />
                            <Button type="button" size="sm" variant="ghost" onClick={() => setSecret(null)}>
                                Já copiei
                            </Button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
            <ConfirmDialog
                open={removing}
                onOpenChange={setRemoving}
                title="Remover o webhook do app?"
                description="O app deixa de receber os eventos: sem tempo real nem consumo ao vivo até registrar de novo."
                confirmLabel="Remover"
                variant="destructive"
                pending={save.isPending}
                onConfirm={() => apply({ url: null }, () => setRemoving(false))}
            />
        </Section>
    )
}
