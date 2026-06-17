import { useMemo, useRef, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useUpdate } from '@thebes/sdk'
import { identity } from '@thebes/sdk'
import { relTime } from '../lib/config'
import {
  CHAT_CID, M, decodeRoster, decodeMessages, rosterArgs, recentArgs, post, seedDemo,
  type RosterEntry, type Message,
} from '../lib/chat-api'
import { Avatar, Button, Spinner, EmptyState, ErrorNote } from '../components/ui'

export function Room() {
  const me = identity()
  const roster = useQuery<RosterEntry[]>(CHAT_CID, M.roster, rosterArgs(), decodeRoster)
  const feed = useQuery<Message[]>(CHAT_CID, M.recent, recentArgs(), decodeMessages)
  const { error: writeErr } = useUpdate()
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [seedErr, setSeedErr] = useState<string>()
  const bottomRef = useRef<HTMLDivElement>(null)

  const byPrincipal = useMemo(() => {
    const m = new Map<string, RosterEntry>()
    ;(roster.data ?? []).forEach((r) => m.set(r.principal, r))
    return m
  }, [roster.data])

  const messages = feed.data ?? []
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length])

  async function send() {
    const text = draft.trim()
    if (!text) return
    setSending(true)
    try {
      await post(text)
      setDraft('')
      feed.refetch()
    } catch {
      /* surfaced via writeErr */
    } finally {
      setSending(false)
    }
  }

  async function seed() {
    setSeeding(true); setSeedErr(undefined)
    try { await seedDemo(); feed.refetch(); roster.refetch() }
    catch (e) { setSeedErr(e instanceof Error ? e.message : String(e)) }
    finally { setSeeding(false) }
  }

  return (
    <div className="grid gap-5 md:grid-cols-[16rem_1fr]">
      {/* Roster pane */}
      <aside className="hidden md:block">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft">
          Members{roster.data ? ` · ${roster.data.length}` : ''}
        </h2>
        <ul className="mt-3 space-y-1">
          {(roster.data ?? []).map((r) => (
            <li key={r.principal} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-surface">
              <Avatar path={r.avatarPath} name={r.displayName} size={34} live />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {r.displayName}
                {r.principal === me && <span className="ml-1 text-[var(--color-you)]">· you</span>}
              </span>
            </li>
          ))}
          {roster.data?.length === 0 && (
            <li className="px-2 text-sm text-ink-soft">No one's here yet.</li>
          )}
        </ul>
      </aside>

      {/* Feed + composer */}
      <section className="flex min-h-[60vh] flex-col rounded-2xl border border-[var(--color-line)] bg-surface">
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {feed.loading ? (
            <Spinner label="Loading the room" />
          ) : feed.error ? (
            <ErrorNote message={feed.error} />
          ) : messages.length === 0 ? (
            <div>
              <EmptyState
                title="The room is quiet"
                hint="Load a demo conversation to see it live, or set a name + avatar in Profile and be the first to post."
                action={
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <Button onClick={seed} disabled={seeding}>{seeding ? 'Loading…' : 'Load demo data'}</Button>
                    <Link to="/me"><Button variant="ghost">Set up profile</Button></Link>
                  </div>
                }
              />
              {seedErr && <div className="mx-auto mt-4 max-w-md"><ErrorNote message={seedErr} /></div>}
            </div>
          ) : (
            messages.map((m, i) => {
              const mine = m.sender === me
              const who = byPrincipal.get(m.sender)
              const name = who?.displayName ?? `${m.sender.slice(0, 6)}…`
              return (
                <div key={i} className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                  {!mine && <Avatar path={who?.avatarPath ?? ''} name={name} size={30} />}
                  <div className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                    {!mine && <span className="mb-0.5 px-1 text-xs font-medium text-ink-soft">{name}</span>}
                    <div className={`bubble ${mine ? 'bubble-you' : 'bubble-them'}`}>{m.text}</div>
                    <span className="mt-0.5 px-1 text-[11px] text-ink-soft nums">{relTime(m.timestamp)}</span>
                  </div>
                </div>
              )
            })
          )}
          <div ref={bottomRef} />
        </div>

        <form
          className="flex items-center gap-2 border-t border-[var(--color-line)] p-3"
          onSubmit={(e) => { e.preventDefault(); send() }}
        >
          <input
            className="flex-1 rounded-xl border border-[var(--color-line)] bg-paper px-3 py-2 text-sm outline-none focus:border-[var(--color-you)]"
            placeholder="Message the room…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={500}
          />
          <Button type="submit" disabled={sending || !draft.trim()}>{sending ? 'Sending…' : 'Send'}</Button>
        </form>
        {writeErr && <div className="px-3 pb-3"><ErrorNote message={writeErr} /></div>}
      </section>
    </div>
  )
}
