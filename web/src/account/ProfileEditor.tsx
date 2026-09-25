import { useEffect, useRef, useState, type FormEvent } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark } from '@fortawesome/free-solid-svg-icons'
import { updateProfile } from '../api'
import type { UserProfile, UserProfileInput } from '../types'

function fields(profile: UserProfile): UserProfileInput {
  return { display_name: profile.display_name, bio: profile.bio }
}

export function ProfileEditor({ open, profile, onClose, onSaved, onError }: {
  open: boolean
  profile: UserProfile
  onClose: () => void
  onSaved: (profile: UserProfile) => void
  onError: (message: string) => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [draft, setDraft] = useState<UserProfileInput>(() => fields(profile))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      setDraft(fields(profile))
      dialog.showModal()
    } else if (!open && dialog.open) dialog.close()
  }, [open, profile])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const input = { display_name: draft.display_name.trim(), bio: draft.bio.trim() }
    if (!input.display_name) return

    setSaving(true)
    try {
      const saved = await updateProfile(input)
      onSaved(saved)
      onClose()
    } catch (error) {
      onError(`Could not update profile: ${error instanceof Error ? error.message : 'Something went wrong'}`)
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
      onCancel={(event) => { if (saving) event.preventDefault() }}
      onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}
    >
      <form onSubmit={(event) => void submit(event)}>
        <header><h2 id="account-editor-title">edit profile</h2>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close profile editor"><FontAwesomeIcon icon={faXmark} aria-hidden="true" /></button>
        </header>
        <label>display name
          <input autoFocus required maxLength={40} autoComplete="name" value={draft.display_name} onChange={(event) => setDraft({ ...draft, display_name: event.target.value })} />
        </label>
        <label>bio
          <textarea maxLength={160} rows={4} value={draft.bio} onChange={(event) => setDraft({ ...draft, bio: event.target.value })} />
          <small>{draft.bio.length}/160</small>
        </label>
        <div className="account-editor-actions">
          <button type="button" onClick={onClose} disabled={saving}>cancel</button>
          <button type="submit" disabled={saving}>{saving ? 'saving...' : 'save profile'}</button>
        </div>
      </form>
    </dialog>
  )
}
