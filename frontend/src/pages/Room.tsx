import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@thebes/sdk'
import {
  CHAT_CID, M, EMOJI, decodeRooms, decodeMessages, messagesArgs,
  postTo, react, deleteMessage, amAdmin,
  type RoomRow, type MessageRow,
} from '../lib/chat-api'
import { relTime } from '../lib/config'
import { Avatar, Button, Spinner, EmptyState, ErrorNote } from '../components/ui'

const COOLDOWN_MS = 3000

export function Room() {
  const { id } = useParams()
  const roomId = BigInt(id ?? '1')
  const rooms = useQuery<RoomRow[]>(CHAT_CID, M.rooms, undefined, decodeRooms)
  const feed = useQuery<MessageRow[]>(CHAT_CID, M.messages, messagesArgs(roomId, 200), decodeMessages, [id])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [cooledAt, setCooledAt] = useState(0) // wall ms when the next post is allowed
  const [nowTick, setNowTick] = useState(Date.now())
  const [mod, setMod] = useState(false)
  const [err, setErr] = useState<string>()
  const bottomRef = useRef<HTMLDivElement>(null)
  const grew = useRef(0)

  useEffect(() => { amAdmin().then(setMod).catch(() => {}) }, [])

  // Soft live feel: refetch the feed every 8s while visible.
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) feed.refetch() }, 8000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Tick for the breathing ring.
  useEffect(() => {
    if (cooledAt <= Date.now()) return
    const t = setInterval(() => setNowTick(Date.now()), 100)
    return () => clearInterval(t)
  }, [cooledAt])

  const messages = feed.data ?? []
  useEffect(() => {
    if (messages.length !== grew.current) {
      grew.current = messages.length
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [messages.length])

  const room = (rooms.data ?? []).find((r) => r.id === roomId)
  const breathing = Math.max(0, cooledAt - nowTick)

  async function send() {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true); setErr(undefined)
    try {
      await postTo(roomId, text)
      setDraft('')
      setCooledAt(Date.now() + COOLDOWN_MS)
      setNowTick(Date.now())
      feed.refetch()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSending(false)
    }
  }

  async function toggleReact(m: MessageRow, emoji: string) {
    setErr(undefined)
    try { await react(roomId, m.id, emoji); feed.refetch() }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }

  async function remove(m: MessageRow) {
    if (!window.confirm('Remove this message? A tombstone will remain — the record that something was said is never erased.')) return
    setErr(undefined)
    try { await deleteMessage(roomId, m.id); feed.refetch() }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <Link to="/" className="text-sm text-[var(--color-you-ink)] hover:underline">← Salon</Link>
          <h1 className="font-display mt-1 text-2xl font-extrabold">{room?.name ?? `Room ${roomId}`}</h1>
          {room && <p className="text-sm text-ink-soft">{room.topic}</p>}
        </div>
        {room && (
          <p className="text-[11px] text-ink-soft nums" data-testid="room-books">
            <b className="text-ink">{room.keptMessages.toString()}</b> kept
            {room.totalEverSent > room.keptMessages && <> + {(room.totalEverSent - room.keptMessages).toString()} trimmed</>}
            {' '}= {room.totalEverSent.toString()} ever said
          </p>
        )}
      </div>

      <section className="mt-4 flex min-h-[62vh] flex-col rounded-2xl border border-[var(--color-line)] bg-surface">
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {feed.loading && messages.length === 0 ? (
            <Spinner label="Loading the room" />
          ) : feed.error ? (
            <ErrorNote message={feed.error} />
          ) : messages.length === 0 ? (
            <EmptyState title="This room is quiet" hint="Say the first thing — it goes on the books." />
          ) : (
            messages.map((m) => {
              if (m.deleted) {
                return (
                  <p key={m.id.toString()} className="tombstone" data-testid="tombstone">
                    — removed · the record remains · #{m.id.toString()} —
                  </p>
                )
              }
              const reactions = m.reactions ? m.reactions.split('|').map((r) => { const [e, n] = r.split(':'); return { e, n } }) : []
              const mineSet = new Set(m.myReactions ? m.myReactions.split('|') : [])
              return (
                <div key={m.id.toString()} className={`group flex items-end gap-2 ${m.mine ? 'flex-row-reverse' : ''}`}>
                  {!m.mine && <Avatar path={m.avatarPath} name={m.name} size={30} />}
                  <div className={`flex max-w-full flex-col ${m.mine ? 'items-end' : 'items-start'}`}>
                    <span className="mb-0.5 px-1 text-xs font-medium text-ink-soft">
                      {!m.mine && <>{m.name} · </>}{relTime(m.timestamp)}
                    </span>
                    <div className={`bubble ${m.mine ? 'bubble-you' : 'bubble-them'}`}>{m.text}</div>
                    <span className={`mt-1 flex items-center gap-1 px-1 ${m.mine ? 'flex-row-reverse' : ''}`}>
                      {reactions.map(({ e, n }) => (
                        <button key={e} onClick={() => toggleReact(m, e)}
                          className={`rounded-full px-1.5 py-0.5 text-[11px] nums transition ${mineSet.has(e) ? 'bg-[var(--color-you)]/15 ring-1 ring-[var(--color-you)]/40' : 'bg-[var(--color-them)]'}`}>
                          {e} {n}
                        </button>
                      ))}
                      <span className="hidden gap-0.5 group-hover:flex">
                        {EMOJI.filter((e) => !reactions.some((r) => r.e === e)).map((e) => (
                          <button key={e} onClick={() => toggleReact(m, e)}
                            className="rounded-full px-1 py-0.5 text-[11px] opacity-40 transition hover:opacity-100" aria-label={`React ${e}`}>
                            {e}
                          </button>
                        ))}
                        {(m.mine || mod) && (
                          <button onClick={() => remove(m)}
                            className="rounded-full px-1.5 py-0.5 text-[11px] text-ink-soft opacity-40 transition hover:opacity-100 hover:text-red-500"
                            aria-label="Remove message">✕</button>
                        )}
                      </span>
                    </span>
                  </div>
                </div>
              )
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* ── The breathing composer: the cooldown law, made visible ── */}
        <div className="border-t border-[var(--color-line)] p-3">
          {err && <div className="mb-2"><ErrorNote message={err} /></div>}
          <div className="flex items-center gap-2">
            <input
              className="min-w-0 flex-1 rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--color-you)]"
              placeholder={breathing > 0 ? 'The room breathes…' : 'Say something — it goes on the books'}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
              maxLength={2000}
              aria-label="Message"
            />
            <span className="relative inline-block">
              {breathing > 0 && (
                <svg className="pointer-events-none absolute -inset-1" viewBox="0 0 44 44" data-testid="breath-ring">
                  <circle cx="22" cy="22" r="20" fill="none" stroke="var(--color-you)" strokeOpacity="0.25" strokeWidth="2.5" />
                  <circle cx="22" cy="22" r="20" fill="none" stroke="var(--color-you)" strokeWidth="2.5" strokeLinecap="round"
                    strokeDasharray={`${(breathing / COOLDOWN_MS) * 125.6} 125.6`}
                    transform="rotate(-90 22 22)" />
                </svg>
              )}
              {/* Deliberately NOT disabled during the breath — the cooldown is
                  the contract's law, and the contract's own rejection is the
                  demonstration. The ring is guidance, not the guard. */}
              <Button onClick={send} disabled={sending || !draft.trim()} aria-label="Send">
                {sending ? '…' : breathing > 0 ? `${Math.ceil(breathing / 1000)}` : 'Send'}
              </Button>
            </span>
          </div>
          <p className="mt-1.5 px-1 text-[11px] text-ink-soft">
            The contract enforces a 3-second breath between messages — not the client. Try to beat it; the chain says no.
          </p>
        </div>
      </section>
    </div>
  )
}
