import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, identity } from '@thebes/sdk'
import { relTime } from '../lib/config'
import {
  CHAT_CID, M, decodeRoster, rosterArgs, amAdmin, setBanned, query,
  type RosterRow,
} from '../lib/chat-api'
import { Avatar, Spinner, EmptyState, ErrorNote, Button } from '../components/ui'
import { encodeArg } from '@thebes/sdk'

/** The roster with live presence; moderators see the ban ledger inline. */
export function Members() {
  const me = identity()
  const roster = useQuery<RosterRow[]>(CHAT_CID, M.roster, rosterArgs(), decodeRoster)
  const [mod, setMod] = useState(false)
  const [bans, setBans] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<string>()
  const [err, setErr] = useState<string>()

  useEffect(() => { amAdmin().then(setMod).catch(() => {}) }, [])

  // Moderators see each member's ban state (public query, cheap).
  useEffect(() => {
    if (!mod || !roster.data) return
    ;(async () => {
      const next: Record<string, boolean> = {}
      for (const r of roster.data ?? []) {
        try {
          const resp = await query(CHAT_CID, 'isBanned', encodeArg({ type: 'principal', value: r.principal }))
          next[r.principal] = (resp.reply_hex ?? resp.reply ?? '').endsWith('01')
        } catch { /* leave unknown */ }
      }
      setBans(next)
    })()
  }, [mod, roster.data])

  async function toggleBan(r: RosterRow) {
    const target = !bans[r.principal]
    if (target && !window.confirm(`Ban ${r.displayName} from the salon? They can no longer post, react or open rooms until unbanned.`)) return
    setBusy(r.principal); setErr(undefined)
    try {
      await setBanned(r.principal, target)
      setBans((b) => ({ ...b, [r.principal]: target }))
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setBusy(undefined) }
  }

  if (roster.loading) return <Spinner label="Loading members" />
  if (roster.error) return <ErrorNote message={roster.error} />
  const rows = roster.data ?? []
  if (rows.length === 0) {
    return <EmptyState title="No members yet" hint="Register a display name in Profile to appear on the roster." action={<Link to="/me"><Button>Set up profile</Button></Link>} />
  }

  const here = rows.filter((r) => r.here).length

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-2xl font-bold">Members</h1>
        <p className="text-sm text-ink-soft nums">
          <span className="inline-block h-2 w-2 rounded-full bg-[var(--color-live)]" /> {here} here now · {rows.length} total
        </p>
      </div>
      {err && <div className="mt-3"><ErrorNote message={err} /></div>}
      <ul className="mt-5 space-y-2">
        {rows.map((r) => (
          <li key={r.principal} className={`flex items-center gap-3 rounded-2xl border border-[var(--color-line)] bg-surface p-3 ${bans[r.principal] ? 'opacity-60' : ''}`}>
            <Avatar path={r.avatarPath} name={r.displayName} size={40} live={r.here} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {r.displayName}
                {r.principal === me && <span className="ml-1 text-[var(--color-you)]">· you</span>}
                {bans[r.principal] && <span className="ml-2 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-500">BANNED</span>}
              </p>
              <p className="text-xs text-ink-soft nums">joined {relTime(r.createdAt)}{r.here ? ' · here now' : ''}</p>
            </div>
            {mod && r.principal !== me && (
              <Button variant="ghost" disabled={busy === r.principal} onClick={() => toggleBan(r)}>
                {bans[r.principal] ? 'Unban' : 'Ban'}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
