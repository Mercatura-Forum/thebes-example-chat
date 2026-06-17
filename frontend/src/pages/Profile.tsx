import { useRef, useState } from 'react'
import { useQuery, useMediaUpload } from '@thebes/sdk'
import { relTime } from '../lib/config'
import {
  CHAT_CID, M, decodeMyProfile, register, setMyAvatar, type MyProfile,
} from '../lib/chat-api'
import { MEDIA_CID } from '../lib/config'
import { Avatar, Button, Spinner, ErrorNote } from '../components/ui'

export function Profile() {
  const { data, loading, error, refetch } = useQuery<MyProfile | undefined>(
    CHAT_CID, M.myProfile, undefined, decodeMyProfile,
  )
  const media = useMediaUpload(MEDIA_CID)
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string>()
  const [err, setErr] = useState<string>()

  if (loading) return <Spinner label="Loading your profile" />
  if (error) return <ErrorNote message={error} />
  const profile = data
  const displayName = name || profile?.displayName || ''

  async function saveName() {
    if (!displayName.trim()) return
    setBusy(true); setErr(undefined); setNote(undefined)
    try {
      await register(displayName.trim())
      setNote('Saved')
      refetch()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function pickAvatar(file: File | undefined) {
    if (!file) return
    setErr(undefined); setNote(undefined)
    try {
      const r = await media.upload(file, 'avatar')
      await setMyAvatar(r.path)
      setNote('Avatar updated')
      refetch()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="font-display text-2xl font-extrabold">Your profile</h1>
      <p className="mt-1 text-sm text-ink-soft">
        {profile ? `Member since ${relTime(profile.createdAt)}.` : 'Register a name to join the room.'}
      </p>

      <div className="mt-6 flex items-center gap-4">
        <Avatar path={profile?.avatarPath ?? ''} name={displayName || '?'} size={84} />
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="block text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--color-you)] file:px-3 file:py-1.5 file:text-white"
            onChange={(e) => pickAvatar(e.target.files?.[0])}
          />
          {media.busy && <p className="mt-2 text-xs text-ink-soft nums">Uploading… {Math.round(media.progress * 100)}%</p>}
          <p className="mt-1 text-[11px] text-ink-soft">Compressed on-chain to a ≤256px avatar.</p>
        </div>
      </div>

      <label className="mt-6 block text-sm font-semibold">Display name</label>
      <div className="mt-2 flex gap-2">
        <input
          className="flex-1 rounded-xl border border-[var(--color-line)] bg-paper px-3 py-2 text-sm outline-none focus:border-[var(--color-you)]"
          value={displayName}
          onChange={(e) => setName(e.target.value)}
          placeholder="What should the room call you?"
          maxLength={40}
        />
        <Button onClick={saveName} disabled={busy || !displayName.trim()}>{busy ? 'Saving…' : 'Save'}</Button>
      </div>

      {note && <p className="mt-3 text-sm text-[var(--color-you-ink)]">{note}</p>}
      {err && <div className="mt-3"><ErrorNote message={err} /></div>}
    </div>
  )
}
