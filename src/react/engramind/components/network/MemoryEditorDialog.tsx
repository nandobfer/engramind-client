"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../../components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select"
import { MemoryEditor } from "../memory/MemoryEditor"
import type { MemoryTextLimits } from "../../memory-text"
import { InfoField } from "../shared/InfoField"
import { ChannelDisplayName } from "./ChannelName"

export interface MemoryEditorTarget {
    mode: "create" | "edit"
    channel: string
    /**
     * Criação com escolha do canal (universo do agente, OPE-130 D11): os canais em que a memória pode ser
     * gravada, o inicial primeiro. Com um canal só (ou sem a lista), o canal fica fixo.
     */
    channels?: readonly string[]
    initial?: { texto: string; categoria: string | null }
}

/**
 * O mesmo editor de memória das listas (texto + categoria, limites do Engramind) num diálogo da rede.
 * `onSave` resolve `true` no sucesso; num conflito de versão o diálogo continua aberto com o texto.
 * Na criação com `channels`, o campo "Canal" escolhe onde gravar (`channel` no `onSave`).
 */
export function MemoryEditorDialog({
    target,
    limits,
    categories,
    onSave,
    onClose,
}: {
    target: MemoryEditorTarget | null
    limits?: MemoryTextLimits
    categories: { key: string; label: string }[]
    onSave: (values: { texto: string; categoria: string; channel: string }) => Promise<boolean>
    onClose: () => void
}) {
    return (
        <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-xl">{target && <EditorBody key={`${target.mode}:${target.channel}`} target={target} limits={limits} categories={categories} onSave={onSave} onClose={onClose} />}</DialogContent>
        </Dialog>
    )
}

function EditorBody({ target, limits, categories, onSave, onClose }: { target: MemoryEditorTarget; limits?: MemoryTextLimits; categories: { key: string; label: string }[]; onSave: (values: { texto: string; categoria: string; channel: string }) => Promise<boolean>; onClose: () => void }) {
    const choices = target.mode === "create" && target.channels && target.channels.length > 1 ? target.channels : null
    const [channel, setChannel] = useState(target.channel)
    return (
        <>
            <DialogHeader>
                <DialogTitle>{target.mode === "edit" ? "Editar memória" : "Nova memória"}</DialogTitle>
                <DialogDescription>{choices ? "Escolha o canal entre os assinados pelo agente." : <>Canal <ChannelDisplayName slug={target.channel} /></>}</DialogDescription>
            </DialogHeader>
            {choices && (
                <InfoField id="memory-editor-channel" label="Canal" info="Só canais ativos assinados pelo agente recebem escrita.">
                    <Select value={channel} onValueChange={setChannel}>
                        <SelectTrigger id="memory-editor-channel" aria-label="Canal" className="bg-transparent">
                            <SelectValue placeholder="Escolha o canal" />
                        </SelectTrigger>
                        <SelectContent>
                            {choices.map((slug) => (
                                <SelectItem key={slug} value={slug}>
                                    <ChannelDisplayName slug={slug} />
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </InfoField>
            )}
            <MemoryEditor
                label="Texto da memória"
                initial={target.initial}
                limits={limits}
                categories={categories}
                onCancel={onClose}
                onSave={(values) => {
                    if (!channel) return
                    void onSave({ ...values, channel }).then((saved) => saved && onClose())
                }}
            />
        </>
    )
}
