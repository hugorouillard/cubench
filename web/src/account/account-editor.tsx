import { faXmark } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { type FormEvent, useEffect, useRef, useState } from "react"
import { updateAccount } from "../api"
import type { AccountDetails, AccountInput } from "../types"

function fields(account: AccountDetails): AccountInput {
    return { display_name: account.display_name, bio: account.bio }
}

export function AccountEditor({
    open,
    account,
    onClose,
    onSaved,
    onError,
}: {
    open: boolean
    account: AccountDetails
    onClose: () => void
    onSaved: (account: AccountDetails) => void
    onError: (message: string) => void
}) {
    const dialogRef = useRef<HTMLDialogElement>(null)
    const [draft, setDraft] = useState<AccountInput>(() => fields(account))
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        const dialog = dialogRef.current
        if (!dialog) return
        if (open && !dialog.open) {
            setDraft(fields(account))
            dialog.showModal()
        } else if (!open && dialog.open) dialog.close()
    }, [open, account])

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const input = {
            display_name: draft.display_name.trim(),
            bio: draft.bio.trim(),
        }
        if (!input.display_name) return

        setSaving(true)
        try {
            const saved = await updateAccount(input)
            onSaved(saved)
            onClose()
        } catch (error) {
            onError(
                `Could not update account: ${error instanceof Error ? error.message : "Something went wrong"}`,
            )
        } finally {
            setSaving(false)
        }
    }

    return (
        <dialog
            id="account-editor-dialog"
            className="account-editor-dialog"
            ref={dialogRef}
            aria-labelledby="account-editor-title"
            onClose={onClose}
            onCancel={(event) => {
                if (saving) event.preventDefault()
            }}
            onMouseDown={(event) => {
                if (event.target === event.currentTarget && !saving) onClose()
            }}
        >
            <form onSubmit={(event) => void submit(event)}>
                <header>
                    <h2 id="account-editor-title">edit account</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        aria-label="Close account editor"
                    >
                        <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
                    </button>
                </header>
                <label>
                    display name
                    <input
                        autoFocus
                        required
                        maxLength={40}
                        autoComplete="name"
                        value={draft.display_name}
                        onChange={(event) =>
                            setDraft({
                                ...draft,
                                display_name: event.target.value,
                            })
                        }
                    />
                </label>
                <label>
                    bio
                    <textarea
                        maxLength={160}
                        rows={4}
                        value={draft.bio}
                        onChange={(event) =>
                            setDraft({ ...draft, bio: event.target.value })
                        }
                    />
                    <small>{draft.bio.length}/160</small>
                </label>
                <div className="account-editor-actions">
                    <button type="button" onClick={onClose} disabled={saving}>
                        cancel
                    </button>
                    <button type="submit" disabled={saving}>
                        {saving ? "saving..." : "save account"}
                    </button>
                </div>
            </form>
        </dialog>
    )
}
