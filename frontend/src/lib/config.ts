/**
 * Contract ids — overridable at deploy via window globals (the deploy step
 * injects freshly-assigned cids); otherwise fall back to the current cluster
 * cids. Keeping ids out of the bundle means one build serves any deployment.
 */
declare global {
  interface Window {
    CHAT_CID?: number
    MEDIA_CID?: number
  }
}

export const CHAT_CID: number =
  (typeof window !== 'undefined' && window.CHAT_CID) || 191118365568631

export const MEDIA_CID: number =
  (typeof window !== 'undefined' && window.MEDIA_CID) || 258560679726455

/** Short relative time ("just now", "3m", "2h", "Apr 4") from a ns timestamp. */
export function relTime(ns: bigint): string {
  const ms = Number(ns / 1_000_000n)
  const diff = Date.now() - ms
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
