import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { mediaUrl } from '@thebes/sdk'
import { MEDIA_CID } from '../lib/config'

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost'
}
/** Violet is the action accent (and "you" colour) — reserved for primary
 *  actions; everything else stays quiet. */
export function Button({ variant = 'primary', className = '', ...props }: BtnProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed'
  const styles: Record<string, string> = {
    primary: 'bg-[var(--color-you)] text-white hover:brightness-110 active:brightness-95',
    ghost: 'bg-transparent text-ink ring-1 ring-[var(--color-line)] hover:bg-[var(--color-paper)]',
  }
  return <button className={`${base} ${styles[variant]} ${className}`} {...props} />
}

/** A round avatar from a media path; initials fallback when there's no image. */
export function Avatar({ path, name, size = 40, live = false }: { path: string; name: string; size?: number; live?: boolean }) {
  const initials = name.trim().slice(0, 2).toUpperCase() || '??'
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      <span className="avatar block h-full w-full">
        {path ? (
          <img src={mediaUrl(MEDIA_CID, path)} alt={name} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="grid h-full w-full place-items-center bg-[var(--color-them)] text-[var(--color-you-ink)] font-semibold" style={{ fontSize: size * 0.36 }}>
            {initials}
          </span>
        )}
      </span>
      {live && (
        <span
          className="absolute bottom-0 right-0 block rounded-full ring-2 ring-[var(--color-surface)]"
          style={{ width: size * 0.28, height: size * 0.28, background: 'var(--color-live)' }}
        />
      )}
    </span>
  )
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-ink-soft text-sm" role="status">
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-line)] border-t-[var(--color-you)]" />
      {label}…
    </div>
  )
}

export function EmptyState({ title, hint, action }: { title: string; hint: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--color-line)] bg-surface p-10 text-center">
      <p className="font-display text-lg text-ink">{title}</p>
      <p className="mt-1 text-sm text-ink-soft">{hint}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}

export function ErrorNote({ message }: { message: string }) {
  return <p className="rounded-lg bg-red-500/8 px-3 py-2 text-sm text-red-600">{message}</p>
}
