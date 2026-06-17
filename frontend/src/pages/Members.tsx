import { useQuery } from '@thebes/sdk'
import { identity } from '@thebes/sdk'
import { relTime } from '../lib/config'
import { CHAT_CID, M, decodeRoster, rosterArgs, type RosterEntry } from '../lib/chat-api'
import { Avatar, Spinner, EmptyState, ErrorNote } from '../components/ui'
import { Link } from 'react-router-dom'

/** A restrained bento grid (varied tile sizes, flat colour-blocking — no glow):
 *  the first member reads large, the rest tile evenly. */
export function Members() {
  const me = identity()
  const { data, loading, error } = useQuery<RosterEntry[]>(CHAT_CID, M.roster, rosterArgs(), decodeRoster)
  if (loading) return <Spinner label="Loading members" />
  if (error) return <ErrorNote message={error} />
  const members = data ?? []
  if (members.length === 0) {
    return (
      <EmptyState
        title="No members yet"
        hint="Register a profile to join the room."
        action={<Link to="/me" className="text-[var(--color-you)] font-semibold">Set up your profile →</Link>}
      />
    )
  }
  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold">Members</h1>
      <p className="mt-1 text-sm text-ink-soft nums">{members.length} on the chain</p>
      <div className="mt-5 grid auto-rows-[8.5rem] grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {members.map((m, i) => {
          const big = i === 0
          return (
            <article
              key={m.principal}
              className={`flex flex-col justify-between rounded-2xl border border-[var(--color-line)] bg-surface p-4 ${
                big ? 'col-span-2 row-span-2' : ''
              }`}
            >
              <Avatar path={m.avatarPath} name={m.displayName} size={big ? 88 : 40} live />
              <div className="min-w-0">
                <p className={`truncate font-display font-bold ${big ? 'text-xl' : 'text-sm'}`}>
                  {m.displayName}
                  {m.principal === me && <span className="ml-1 text-[var(--color-you)]">· you</span>}
                </p>
                <p className="text-xs text-ink-soft">joined {relTime(m.createdAt)}</p>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
