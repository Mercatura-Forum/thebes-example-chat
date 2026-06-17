/**
 * chat-api.ts — typed reads/writes for the social-room backend, on the thebes
 * SDK. Reads use the backend's flat `*View` methods (+ the already-flat
 * `recent`) so the SPA's flat-record decoder suffices; writes pass Candid args.
 */
import { query, update, encodeArg, encodeArgs, decodeVecRecord } from '@thebes/sdk'
import { CHAT_CID } from './config'

export interface RosterEntry {
  principal: string // hex
  displayName: string
  avatarPath: string // "" when none
  createdAt: bigint
}

export interface Message {
  text: string
  sender: string // principal hex
  timestamp: bigint
}

export interface MyProfile {
  displayName: string
  avatarPath: string
  createdAt: bigint
}

const ROSTER_FIELDS = [
  { name: 'principal', type: 'principal' as const },
  { name: 'displayName', type: 'text' as const },
  { name: 'avatarPath', type: 'text' as const },
  { name: 'createdAt', type: 'int' as const },
]
const MESSAGE_FIELDS = [
  { name: 'text', type: 'text' as const },
  { name: 'sender', type: 'principal' as const },
  { name: 'timestamp', type: 'int' as const },
]
const PROFILE_FIELDS = [
  { name: 'displayName', type: 'text' as const },
  { name: 'avatarPath', type: 'text' as const },
  { name: 'createdAt', type: 'int' as const },
]

export const decodeRoster = (hex: string): RosterEntry[] =>
  decodeVecRecord(hex, ROSTER_FIELDS) as unknown as RosterEntry[]
export const decodeMessages = (hex: string): Message[] =>
  decodeVecRecord(hex, MESSAGE_FIELDS) as unknown as Message[]
/** myProfileView returns a 0-or-1 element vec → first entry, or undefined. */
export const decodeMyProfile = (hex: string): MyProfile | undefined =>
  (decodeVecRecord(hex, PROFILE_FIELDS) as unknown as MyProfile[])[0]

// Query method names + arg builders (paired with the decoders via useQuery).
export const M = {
  roster: 'rosterView',
  recent: 'recent',
  myProfile: 'myProfileView',
} as const

export const rosterArgs = (offset = 0, limit = 200): string =>
  encodeArgs([{ type: 'nat', value: BigInt(offset) }, { type: 'nat', value: BigInt(limit) }])
export const recentArgs = (n = 200): string => encodeArg({ type: 'nat', value: BigInt(n) })

// ── Writes ──
export async function register(displayName: string): Promise<void> {
  await update(CHAT_CID, 'register', encodeArg({ type: 'text', value: displayName }))
}
/** Set the caller's avatar → throws "Register a display name first" if unregistered. */
export async function setMyAvatar(path: string): Promise<void> {
  await update(CHAT_CID, 'setMyAvatarOrTrap', encodeArg({ type: 'text', value: path }))
}
export async function post(text: string): Promise<void> {
  await update(CHAT_CID, 'post', encodeArg({ type: 'text', value: text }))
}
export async function claimOwner(): Promise<void> {
  await update(CHAT_CID, 'claimOwner')
}
/** Seed demo members + messages on a fresh room (no-op once any message exists). */
export async function seedDemo(): Promise<void> {
  await update(CHAT_CID, 'seedDemo')
}

export { query, CHAT_CID }
