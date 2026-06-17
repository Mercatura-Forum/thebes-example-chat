import { NavLink, Outlet } from 'react-router-dom'
import { SignOutChip } from '@thebes/sdk'

const tabs = [
  { to: '/', label: 'Room', end: true },
  { to: '/members', label: 'Members' },
  { to: '/me', label: 'Profile' },
]

/** App shell: a compact header (wordmark + nav). The room itself carries the
 *  page, so chrome stays minimal. */
export function Layout() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-[var(--color-line)] bg-paper/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
          <NavLink to="/" className="font-display text-2xl font-extrabold tracking-tight">
            agora<span className="text-[var(--color-you)]">·</span>
          </NavLink>
          <nav className="flex items-center gap-1">
            {tabs.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                    isActive ? 'bg-[var(--color-you)]/10 text-[var(--color-you-ink)]' : 'text-ink-soft hover:text-ink'
                  }`
                }
              >
                {t.label}
              </NavLink>
            ))}
            <SignOutChip className="ml-2 border-l border-[var(--color-line)] pl-3" />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-6">
        <Outlet />
      </main>

      <footer className="mx-auto max-w-5xl px-5 py-6 text-xs text-ink-soft">
        An on-chain room — profiles, avatars, and every message live on the chain.
      </footer>
    </div>
  )
}
