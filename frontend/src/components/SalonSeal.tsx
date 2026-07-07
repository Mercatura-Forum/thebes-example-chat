import { useQuery } from '@thebes/sdk'
import { CHAT_CID, M, decodeSeal, type SalonSealRow } from '../lib/chat-api'

/**
 * SalonSeal — the footer's live proof: the books law (kept + trimmed ==
 * everything ever sent) and the full oracle's verdict, straight from the
 * chain on every page load. Anyone can re-run the same check.
 */
export function SalonSeal() {
  const { data, loading } = useQuery<SalonSealRow>(CHAT_CID, M.seal, undefined, decodeSeal)
  if (loading || !data) return null
  const ok = Number(data.violations) === 0
  const trimmed = data.totalEverSent - data.keptMessages
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] nums" data-testid="salon-seal">
      <span className={`inline-block h-2 w-2 rounded-full ${ok ? 'bg-[var(--color-live)]' : 'bg-red-500'}`} />
      {ok ? (
        <span className="text-ink-soft">
          <b className="text-ink">The books balance on-chain</b> · {data.keptMessages.toString()} kept
          + {trimmed.toString()} trimmed = {data.totalEverSent.toString()} ever said
          · {data.roomCount.toString()} room{Number(data.roomCount) === 1 ? '' : 's'}
          · {data.membersHere.toString()} here now · 0 violations
        </span>
      ) : (
        <span className="font-semibold text-red-600">
          The oracle reports {data.violations.toString()} violation(s) — the books do not balance.
        </span>
      )}
    </div>
  )
}
