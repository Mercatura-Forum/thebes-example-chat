import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * MemphisGate — Memphis passkey sign-in as the app's web auth, open-demo style.
 *
 * Wrap the app's routes in <MemphisGate>. The gate ALWAYS renders the app and
 * exposes the session via useAuth(), so visitors roam freely and sign in on
 * demand from the header chip. Memphis (cid 921) provides the human identity +
 * display name; the on-chain caller stays the boundary's persisted browser key,
 * so reads — and demo writes — work whether or not you have signed in.
 *
 * This file is identical across every Thebes example — copy it as-is. Only the
 * per-app `--color-accent` token (in index.css) tunes the chip to its host app.
 */
import { createContext, useContext, useState } from 'react';
import { useMemphis } from './useMemphis.js';
const AuthCtx = createContext(null);
/** The Memphis session + sign-in/out. Throws if used outside the gate. */
export function useAuth() {
    const v = useContext(AuthCtx);
    if (!v)
        throw new Error('useAuth must be used inside <MemphisGate>');
    return v;
}
/** Open-demo gate: never blocks the app. `appName`/`tagline` are accepted for
 *  API compatibility with hosted apps but are unused in the open-demo flow. */
export function MemphisGate({ children }) {
    const auth = useMemphis();
    return _jsx(AuthCtx.Provider, { value: auth, children: children });
}
/** Header chip. Signed in → "Signed in as <name>" + Sign out. Guest → a "Sign in"
 *  affordance that expands into a name input + passkey button. Native-looking;
 *  the accent comes from --color-accent. */
export function SignOutChip({ className = '' }) {
    const auth = useAuth();
    const [open, setOpen] = useState(false);
    const [name, setName] = useState('');
    if (auth.signedIn) {
        return (_jsxs("span", { className: `inline-flex items-center gap-2 text-xs ${className}`, children: [_jsxs("span", { className: "opacity-60", children: ["Signed in as ", auth.displayName] }), _jsx("button", { className: "rounded-md px-2 py-1 font-medium opacity-80 hover:opacity-100", style: { color: 'var(--color-accent)' }, onClick: auth.signOut, children: "Sign out" })] }));
    }
    const submit = () => { auth.signIn(name.trim() || 'Guest').catch(() => { }); };
    if (!open) {
        return (_jsx("span", { className: `inline-flex items-center text-xs ${className}`, children: _jsx("button", { className: "rounded-md px-2 py-1 font-medium opacity-80 hover:opacity-100", style: { color: 'var(--color-accent)' }, onClick: () => setOpen(true), children: "Sign in" }) }));
    }
    return (_jsxs("span", { className: `inline-flex items-center gap-1.5 text-xs ${className}`, children: [_jsx("input", { className: "w-28 rounded-md border border-black/10 bg-black/[0.03] px-2 py-1 outline-none focus:border-black/30", placeholder: "Your name", value: name, autoFocus: true, onChange: (e) => setName(e.target.value), onKeyDown: (e) => e.key === 'Enter' && submit() }), _jsx("button", { className: "rounded-md px-2 py-1 font-medium text-white disabled:opacity-50", style: { background: 'var(--color-accent)' }, onClick: submit, disabled: auth.busy, children: auth.busy ? 'Signing in…' : 'Sign in with passkey' }), auth.error && _jsx("span", { className: "max-w-[10rem] truncate text-red-600", title: auth.error, children: auth.error })] }));
}
