/**
 * Toasts da lib: delegam ao `notify` do `EngramindProvider` (o app liga ao seu sistema de toasts, como o
 * `sonner`). Sem `notify`, nada aparece. Mesma forma do `sonner` (`toast.success(...)`).
 */
export type NotifyKind = "success" | "error" | "info" | "warning"
export type Notify = (kind: NotifyKind, message: string, options?: { description?: string; id?: string | number }) => void

let notifier: Notify | null = null

export function setNotifier(next: Notify | null) {
    notifier = next
}

const send = (kind: NotifyKind) => (message: string, options?: { description?: string; id?: string | number }) => notifier?.(kind, message, options)

export const toast = { success: send("success"), error: send("error"), info: send("info"), warning: send("warning") }
