import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@thebes/sdk'
import {
  CHAT_CID, M, decodeRooms, decodeMessages, decodeSeal, messagesArgs,
  createRoom, seedDemo,
  type RoomRow, type MessageRow, type SalonSealRow,
} from '../lib/chat-api'
import { relTime } from '../lib/config'
import { VoicesWall } from '../components/VoicesWall'
import { Button, Spinner, EmptyState, ErrorNote } from '../components/ui'

const inp = 'w-full rounded-xl border border-[var(--color-line)] bg-surface px-3 py-2 text-sm outline-none focus:border-[var(--color-you)]'

export function Salon() {
  const rooms = useQuery<RoomRow[]>(CHAT_CID, M.rooms, undefined, decodeRooms)
  const seal = useQuery<SalonSealRow>(CHAT_CID, M.seal, undefined, decodeSeal)
  // The wall draws from the busiest room's recent messages.
  const first = (rooms.data ?? [])[0]
  const wall = useQuery<MessageRow[]>(
    CHAT_CID, M.messages, messagesArgs(first?.id ?? 1n, 28), decodeMessages, [first?.id?.toString()],
  )
  const [seeding, setSeeding] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [topic, setTopic] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string>()

  async function seed() {
    setSeeding(true); setErr(undefined)
    try { await seedDemo(); rooms.refetch(); wall.refetch(); seal.refetch() }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    finally { setSeeding(false) }
  }

  async function addRoom() {
    setBusy(true); setErr(undefined)
    try {
      await createRoom(name.trim(), topic.trim())
      setName(''); setTopic(''); setCreating(false)
      rooms.refetch()
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  if (rooms.loading) return <Spinner label="Opening the salon" />
  if (rooms.error) return <ErrorNote message={rooms.error} />
  const rows = rooms.data ?? []

  if (rows.length === 0) {
    return (
      <div>
        <EmptyState
          title="The salon is closed up"
          hint="Load the demo salon — two rooms, live voices — or register a name in Profile and open the first room yourself."
          action={
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button onClick={seed} disabled={seeding}>{seeding ? 'Opening…' : 'Open the demo salon'}</Button>
              <Link to="/me"><Button variant="ghost">Set up profile</Button></Link>
            </div>
          }
        />
        {err && <div className="mx-auto mt-4 max-w-md"><ErrorNote message={err} /></div>}
      </div>
    )
  }

  const s = seal.data

  return (
    <div>
      {/* ── Hero: the conversation IS the artwork ── */}
      <section className="hero relative overflow-hidden p-7 sm:p-10">
        <VoicesWall
          messages={wall.data ?? []}
          rooms={rows}
          className="absolute inset-0"
        />
        <div className="pointer-events-none relative max-w-lg">
          <p className="hero-kicker">Live from the chain</p>
          <h1 className="font-display mt-3 text-4xl font-extrabold leading-[1.05] sm:text-5xl">
            A room that keeps <span className="text-[var(--color-you)]">its word</span>
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
            The voices drifting behind this headline are real messages from the
            salon. Each is attributed and ordered on-chain, deletion leaves a
            tombstone, and the books always balance — kept plus trimmed equals
            everything ever said.
          </p>
          {s && (
            <p className="mt-4 text-sm text-ink-soft nums">
              <b className="text-ink">{s.totalEverSent.toString()}</b> things said ·{' '}
              <b className="text-ink">{s.membersHere.toString()}</b> here now ·{' '}
              <b className={Number(s.violations) === 0 ? 'text-[var(--color-live)]' : 'text-red-600'}>
                {Number(s.violations) === 0 ? 'books balanced' : `${s.violations} violations`}
              </b>
            </p>
          )}
        </div>
      </section>

      {/* ── Rooms ── */}
      <div className="mt-8 flex items-baseline justify-between">
        <h2 className="font-display text-2xl font-extrabold">Rooms</h2>
        <button className="text-sm font-semibold text-[var(--color-you-ink)] hover:underline" onClick={() => setCreating(!creating)}>
          {creating ? 'Close' : '+ Open a room'}
        </button>
      </div>

      {creating && (
        <div className="mt-3 rounded-2xl border border-[var(--color-line)] bg-surface p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_1.6fr_auto]">
            <input className={inp} placeholder="Room name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
            <input className={inp} placeholder="What's it about?" value={topic} onChange={(e) => setTopic(e.target.value)} />
            <Button onClick={addRoom} disabled={busy || !name.trim()}>{busy ? 'Opening…' : 'Open'}</Button>
          </div>
          {err && <div className="mt-3"><ErrorNote message={err} /></div>}
        </div>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {rows.map((r) => (
          <Link key={r.id.toString()} to={`/r/${r.id}`} className="plaque">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-display text-lg font-bold">{r.name}</p>
              <p className="text-xs text-ink-soft nums">{relTime(r.lastActivity)}</p>
            </div>
            <p className="mt-1 line-clamp-1 text-sm text-ink-soft">{r.topic}</p>
            <p className="mt-3 text-[11px] text-ink-soft nums">
              <b className="text-ink">{r.keptMessages.toString()}</b> kept
              {r.totalEverSent > r.keptMessages && <> + {(r.totalEverSent - r.keptMessages).toString()} trimmed</>}
              {' '}= {r.totalEverSent.toString()} ever said · on the books
            </p>
          </Link>
        ))}
      </div>
    </div>
  )
}
