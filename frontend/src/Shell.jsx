import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Flame, KeyRound, LogOut, Menu, X } from 'lucide-react'

// Account menu in the top bar: change password and sign out live here (not floating over the page).
export function UserMenu({ username, role, onPassword, onSignOut }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  return (
    <div className="relative" ref={ref}>
      <button className="secondary !gap-2 !px-2.5" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open}>
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-xs font-bold uppercase text-white">
          {(username || '?').slice(0, 1)}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-sm">{username}</span>
          <span className="block text-[11px] font-normal text-slate-500">{role}</span>
        </span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-[2000] mt-2 w-52 overflow-hidden rounded-xl bg-white p-1 shadow-lg ring-1 ring-slate-200">
          <div className="px-3 py-2 text-xs text-slate-500">Signed in as <strong className="text-slate-800">{username}</strong> ({role})</div>
          <button role="menuitem" className="secondary !w-full !justify-start !border-0 !shadow-none !ring-0"
            onClick={() => { setOpen(false); onPassword() }}><KeyRound size={16} /> Change password</button>
          <button role="menuitem" className="secondary !w-full !justify-start !shadow-none !ring-0 !text-red-700"
            onClick={() => { setOpen(false); onSignOut() }}><LogOut size={16} /> Sign out</button>
        </div>
      )}
    </div>
  )
}

// Page frame: left sidebar (when `groups` is given), top bar with title, page actions and the account menu.
// groups = [{ label, items: [[key, label, Icon], ...] }]
export default function Shell({ brand = 'Gasora', title, groups = [], tab, setTab, actions, user, children }) {
  const [drawer, setDrawer] = useState(false)
  const hasNav = groups.length > 0
  const pick = (k) => { setTab(k); setDrawer(false) }
  const nav = (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 pb-6 pt-2">
      {groups.map((g) => (
        <div key={g.label}>
          <div className="mb-1.5 px-3 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-indigo-300/50">{g.label}</div>
          {g.items.map(([k, label, Icon]) => (
            <button key={k} onClick={() => pick(k)} aria-current={tab === k ? 'page' : undefined}
              className={`group !relative !flex !w-full !justify-start !gap-3 !rounded-xl !px-3 !py-2 !font-medium !shadow-none !bg-none ${tab === k
                ? '!bg-white/12 !text-white'
                : '!bg-transparent !text-indigo-200/80 hover:!bg-white/6 hover:!text-white'}`}>
              {tab === k && <span className="absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-400" />}
              {Icon && <Icon size={18} className={tab === k ? 'text-brand-200' : ''} />}{label}
            </button>
          ))}
        </div>
      ))}
    </nav>
  )
  const logo = (
    <div className="flex items-center gap-3 px-5 py-5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-lg shadow-brand-600/40"><Flame size={19} /></span>
      <span className="text-lg font-bold tracking-tight text-white">{brand}</span>
    </div>
  )
  return (
    <div className="flex h-full">
      {hasNav && (
        <aside className="hidden w-64 shrink-0 flex-col bg-gradient-to-b from-ink to-brand-900 lg:flex">{logo}{nav}</aside>
      )}
      {hasNav && drawer && (
        <div className="fixed inset-0 z-[2500] lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-gradient-to-b from-ink to-brand-900 shadow-xl">
            <button className="secondary !absolute right-2 top-4 !p-1.5" aria-label="Close menu" onClick={() => setDrawer(false)}><X size={16} /></button>
            {logo}{nav}
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative z-[1500] flex flex-wrap items-center gap-3 border-b border-slate-200/70 bg-white/80 px-4 py-3 backdrop-blur sm:px-6">
          {hasNav
            ? <button className="secondary !p-2 lg:!hidden" aria-label="Open menu" onClick={() => setDrawer(true)}><Menu size={18} /></button>
            : <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white"><Flame size={18} /></span>}
          <h1 className="m-0 text-lg font-bold tracking-tight">{title}</h1>
          <span className="flex-1" />
          {actions}
          {user && <UserMenu {...user} />}
        </header>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  )
}
