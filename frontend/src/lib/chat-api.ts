/**
 * chat-api.ts — typed reads/writes for the Agora salon backend. Reads use the
 * backend's flat `*View` methods; writes use trap-carrying updates so a
 * rejected guard (cooldown, ban, bad emoji) surfaces as a thrown reason.
 */
import { query, update, encodeArg, encodeArgs, decodeVecRecord, decodeNat } from '@thebes/sdk'
import { CHAT_CID } from './config'
import { calibrate } from './chainTime'

export interface RoomRow {
  id: bigint
  name: string
  topic: string
  keptMessages: bigint
  totalEverSent: bigint
  lastActivity: bigint
}

export interface MessageRow {
  id: bigint
  sender: string // principal hex
  name: string
  avatarPath: string
  text: string
  timestamp: bigint
  deleted: boolean
  mine: boolean
  reactions: string // "👍:2|🔥:1"
  myReactions: string // "🔥"
  nowNs: bigint
}

export interface RosterRow {
  principal: string
  displayName: string
  avatarPath: string
  createdAt: bigint
  here: boolean
}

export interface SalonSealRow {
  roomCount: bigint
  keptMessages: bigint
  totalEverSent: bigint
  membersHere: bigint
  violations: bigint
  checkedAt: bigint
}

export interface ViolationRow {
  roomId: bigint
  rule: string
  detail: string
}

export interface MyProfile {
  displayName: string
  avatarPath: string
  createdAt: bigint
}

type F = { name: string; type: 'nat' | 'int' | 'bool' | 'text' | 'principal' }
const nat = (name: string): F => ({ name, type: 'nat' })
const int = (name: string): F => ({ name, type: 'int' })
const text = (name: string): F => ({ name, type: 'text' })
const bool = (name: string): F => ({ name, type: 'bool' })
const principal = (name: string): F => ({ name, type: 'principal' })

const ROOM_FIELDS: F[] = [
  nat('id'), text('name'), text('topic'), nat('keptMessages'), nat('totalEverSent'), int('lastActivity'),
]
const MESSAGE_FIELDS: F[] = [
  nat('id'), principal('sender'), text('name'), text('avatarPath'), text('text'),
  int('timestamp'), bool('deleted'), bool('mine'), text('reactions'), text('myReactions'), int('nowNs'),
]
const ROSTER_FIELDS: F[] = [
  principal('principal'), text('displayName'), text('avatarPath'), int('createdAt'), bool('here'),
]
const SEAL_FIELDS: F[] = [
  nat('roomCount'), nat('keptMessages'), nat('totalEverSent'), nat('membersHere'), nat('violations'), int('checkedAt'),
]
const VIOLATION_FIELDS: F[] = [nat('roomId'), text('rule'), text('detail')]
const PROFILE_FIELDS: F[] = [text('displayName'), text('avatarPath'), int('createdAt')]

export const decodeRooms = (h: string) => decodeVecRecord(h, ROOM_FIELDS) as unknown as RoomRow[]
export const decodeMessages = (h: string) => {
  const rows = decodeVecRecord(h, MESSAGE_FIELDS) as unknown as MessageRow[]
  if (rows.length > 0) calibrate(rows[0].nowNs)
  return rows
}
export const decodeRoster = (h: string) => decodeVecRecord(h, ROSTER_FIELDS) as unknown as RosterRow[]
export const decodeSeal = (h: string) => {
  const rows = decodeVecRecord(h, SEAL_FIELDS) as unknown as SalonSealRow[]
  if (rows.length > 0) calibrate(rows[0].checkedAt)
  return rows[0]
}
export const decodeViolations = (h: string) => decodeVecRecord(h, VIOLATION_FIELDS) as unknown as ViolationRow[]
export const decodeMyProfile = (h: string) => (decodeVecRecord(h, PROFILE_FIELDS) as unknown as MyProfile[])[0]

export const M = {
  rooms: 'roomsView',
  messages: 'messagesView',
  roster: 'rosterView',
  seal: 'salonSealView',
  invariants: 'invariantReportView',
  myProfile: 'myProfileView',
} as const

export const messagesArgs = (roomId: bigint, n = 200): string =>
  encodeArgs([{ type: 'nat', value: roomId }, { type: 'nat', value: BigInt(n) }])
export const rosterArgs = (offset = 0, limit = 200): string =>
  encodeArgs([{ type: 'nat', value: BigInt(offset) }, { type: 'nat', value: BigInt(limit) }])

// ── Writes ──

export async function register(displayName: string): Promise<void> {
  await update(CHAT_CID, 'register', encodeArg({ type: 'text', value: displayName }))
}
export async function setMyAvatar(path: string): Promise<void> {
  await update(CHAT_CID, 'setMyAvatarOrTrap', encodeArg({ type: 'text', value: path }))
}
/** Post to a room → new message id; throws on cooldown / ban / unregistered. */
export async function postTo(roomId: bigint, textValue: string): Promise<bigint> {
  const r = await update(CHAT_CID, 'postTo', encodeArgs([
    { type: 'nat', value: roomId }, { type: 'text', value: textValue },
  ]))
  return decodeNat(r.reply_hex ?? r.reply ?? '')
}
export async function createRoom(name: string, topic: string): Promise<bigint> {
  const r = await update(CHAT_CID, 'createRoom', encodeArgs([
    { type: 'text', value: name }, { type: 'text', value: topic },
  ]))
  return decodeNat(r.reply_hex ?? r.reply ?? '')
}
/** Toggle one of the fixed emoji on a message. */
export async function react(roomId: bigint, messageId: bigint, emoji: string): Promise<void> {
  await update(CHAT_CID, 'react', encodeArgs([
    { type: 'nat', value: roomId }, { type: 'nat', value: messageId }, { type: 'text', value: emoji },
  ]))
}
/** Tombstone a message (author or moderator). */
export async function deleteMessage(roomId: bigint, messageId: bigint): Promise<void> {
  await update(CHAT_CID, 'deleteMessage', encodeArgs([
    { type: 'nat', value: roomId }, { type: 'nat', value: messageId },
  ]))
}
export async function presenceBeat(): Promise<void> {
  await update(CHAT_CID, 'presenceBeat')
}
export async function setBanned(principalHex: string, value: boolean): Promise<void> {
  await update(CHAT_CID, 'setBanned', encodeArgs([
    { type: 'principal', value: principalHex }, { type: 'bool', value },
  ]))
}
export async function amAdmin(): Promise<boolean> {
  const r = await query(CHAT_CID, 'amAdmin')
  const hex = r.reply_hex ?? r.reply ?? ''
  // bool reply: DIDL header + type table + a trailing 01/00 byte
  return hex.endsWith('01')
}
export async function claimOwner(): Promise<void> {
  await update(CHAT_CID, 'claimOwner')
}
export async function seedDemo(): Promise<void> {
  await update(CHAT_CID, 'seedDemo')
}

/** One-shot chain-clock calibration on mount (the seal carries checkedAt). */
export async function calibrateChainClock(): Promise<void> {
  const r = await query(CHAT_CID, M.seal)
  decodeSeal(r.reply_hex ?? r.reply ?? '')
}

export const EMOJI = ['👍', '❤️', '😂', '🔥'] as const

export { query, CHAT_CID }
