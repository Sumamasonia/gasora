import { useCallback, useEffect, useState } from 'react'
import {
  BarChart3, Boxes, Cylinder, Inbox, Landmark, Map as MapIcon, Receipt, Settings, ShieldCheck,
  ShoppingCart, Sparkles, StickyNote, UserCog, Users, RefreshCw, LayoutDashboard, Route as RouteIcon, Clock, MapPin,
} from 'lucide-react'
import Shell from './Shell'
import Overview from './Overview'
import {
  ApiError, assignRoute, createUrgent, getCustomers, getEmpties, getPaths, getPlan, getRoutes, getUrgent, getUsers, publishPlan,
} from './api'
import { BAND_COLOR, VEHICLE_COLORS } from './colors'
import AccountsPage from './AccountsPage'
import AuditPage from './AuditPage'
import CustomersPage from './CustomersPage'
import CylindersPage from './CylindersPage'
import ExpensesPage from './ExpensesPage'
import AssistantPage from './AssistantPage'
import NotesPage from './NotesPage'
import ReportsPage from './ReportsPage'
import RequestsPage from './RequestsPage'
import SalesPage from './SalesPage'
import SettingsPage from './SettingsPage'
import StaffPage from './StaffPage'
import StockPage from './StockPage'
import PlanMap from './PlanMap'
import { EmptiesPanel, PublishedRoutes, UrgentForm } from './OwnerPanels'
import { Badge, SwapTag, UrgentTag } from './ui'

function PlanPanel({ plan, published }) {
  const counts = { Normal: 0, High: 0, Critical: 0 }
  plan.risk_table.forEach((r) => { if (counts[r.band] !== undefined) counts[r.band] += 1 })
  const urgentCount = plan.risk_table.filter((r) => r.urgent).length
  return (
    <>
      <h2>{published ? 'New proposal (preview only)' : 'Proposed plan'} for {plan.date}</h2>
      <p className="muted">
        {published
          ? 'The map shows the published routes. This proposal is only a preview of what the planner would do now, and it changes as deliveries are recorded. '
          : ''}
        {plan.settings_note}.{' '}
        {plan.routing === 'road' ? 'Routes on the map follow roads.' : 'Lines on the map are straight lines between stops, not road paths.'}
      </p>
      <div className="counts">
        {Object.keys(counts).map((band) => (
          <div key={band}><Badge band={band} /> {counts[band]}</div>
        ))}
        {urgentCount > 0 && <div><span className="badge" style={{ background: BAND_COLOR.Urgent }}>Urgent</span> {urgentCount}</div>}
      </div>
      {plan.warnings && plan.warnings.map((w) => <p key={w} className="error">{w}</p>)}
      {plan.routes.length === 0 && <p>No deliveries planned for today.</p>}
      {plan.routes.map((route, i) => {
        const color = VEHICLE_COLORS[i % VEHICLE_COLORS.length]
        return (
          <section key={route.vehicle} style={{ borderTop: `4px solid ${color}` }}>
            <h3 className="!mb-3 flex-wrap">
              <span className="chip" style={{ background: color }} />
              Vehicle {route.vehicle}
              <span className="ml-auto flex gap-1.5 text-[11px] font-medium text-slate-600">
                <span className="rounded-full bg-slate-100 px-2 py-0.5">{route.stops.length} stops</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5">{route.minutes} min</span>
                {route.km ? <span className="rounded-full bg-slate-100 px-2 py-0.5">{route.km} km</span> : null}
              </span>
            </h3>
            <ol className="relative !m-0 list-none !p-0">
              {route.stops.map((s, n) => (
                <li key={s.customer_id} className="relative flex gap-3 pb-3 last:pb-0 !leading-snug">
                  {n < route.stops.length - 1 && <span className="absolute left-[11px] top-6 h-full w-0.5" style={{ background: `${color}40` }} />}
                  <span className="z-[1] flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: color }}>{n + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5"><span className="font-medium">{s.name}</span> {s.urgent && <UrgentTag />} {s.swap && <SwapTag />} <Badge band={s.band} /></div>
                    <div className="muted">
                      {Math.round(s.risk * 100)}% risk
                      {s.window_days && ` \u00b7 empty in ${s.window_days[0]} to ${s.window_days[1]} days`}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )
      })}
      {plan.candidates_not_visited.length > 0 && (
        <section>
          <h3>Not visited today ({plan.candidates_not_visited.length})</h3>
          <ul>
            {plan.candidates_not_visited.map((s) => (
              <li key={s.customer_id}>{s.name} <Badge band={s.band} /> <span className="muted">{Math.round(s.risk * 100)}%</span></li>
            ))}
          </ul>
        </section>
      )}
      {plan.no_delivery_history.length > 0 && (
        <section>
          <h3>No delivery history ({plan.no_delivery_history.length})</h3>
          <p className="muted">These customers cannot be predicted yet: {plan.no_delivery_history.map((c) => c.name).join(', ')}</p>
        </section>
      )}
    </>
  )
}

const GROUPS = [
  { label: 'Overview', items: [['overview', 'Overview', LayoutDashboard]] },
  { label: 'Operations', items: [['dispatch', 'Dispatch', MapIcon], ['requests', 'Requests', Inbox], ['sales', 'Sales', ShoppingCart], ['customers', 'Customers', Users]] },
  { label: 'Cylinders & stock', items: [['cylinders', 'Cylinders', Cylinder], ['stock', 'Stock', Boxes]] },
  { label: 'Money', items: [['accounts', 'Accounts', Landmark], ['expenses', 'Expenses', Receipt], ['reports', 'Reports', BarChart3]] },
  { label: 'Tools', items: [['notes', 'Notes & tools', StickyNote], ['assistant', 'Assistant', Sparkles]] },
  { label: 'Admin', items: [['staff', 'Staff', UserCog], ['settings', 'Settings', Settings], ['audit', 'Audit', ShieldCheck]] },
]
const TITLES = Object.fromEntries(GROUPS.flatMap((g) => g.items.map(([k, label]) => [k, label])))

export default function OwnerView({ auth, onSignOut, onExpired, onPassword }) {
  const [plan, setPlan] = useState(null)
  const [coords, setCoords] = useState({})
  const [routes, setRoutes] = useState([])
  const [paths, setPaths] = useState([])
  const [drivers, setDrivers] = useState([])
  const [openUrgent, setOpenUrgent] = useState([])
  const [emptiesInfo, setEmptiesInfo] = useState(null)
  const [seconds, setSeconds] = useState(2)
  const [tab, setTab] = useState('overview')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const guard = useCallback(async (fn) => {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onExpired()
      else if (e instanceof ApiError && e.status === 403) setError('This page is for owner accounts only.')
      else setError(e.message)
    } finally {
      setBusy(false)
    }
  }, [onExpired])

  const loadAll = useCallback(async () => {
    const t = auth.token
    const [customers, p, r, users, u, em] = await Promise.all([
      getCustomers(t), getPlan(t, seconds), getRoutes(t), getUsers(t), getUrgent(t), getEmpties(t),
    ])
    const map = {}
    customers.forEach((c) => { map[c.id] = { lat: c.lat, lon: c.lon, name: c.name } })
    const shown = r.length ? r : p.routes
    const pa = await getPaths(t, shown.map((rt) => rt.stops.map((s) => s.customer_id)))
    setCoords(map); setPlan(p); setRoutes(r); setOpenUrgent(u); setEmptiesInfo(em); setPaths(pa.paths)
    setDrivers(users.filter((x) => x.role === 'driver'))
  }, [auth.token, seconds])

  useEffect(() => { if (tab === 'dispatch') guard(loadAll) }, [guard, loadAll, tab])      // reload when coming back to Dispatch

  return (
    <Shell brand="Gasora" title={TITLES[tab]} groups={GROUPS} tab={tab} setTab={setTab}
      user={{ username: auth.username, role: auth.role, onPassword, onSignOut }}
      actions={tab === 'dispatch' && (
        <>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Solver time
            <select className="!w-auto" value={seconds} onChange={(e) => setSeconds(Number(e.target.value))}>
              <option value={1}>1 s</option>
              <option value={2}>2 s</option>
              <option value={5}>5 s</option>
            </select>
          </label>
          <button disabled={busy} onClick={() => guard(loadAll)}><RefreshCw size={15} className={busy ? 'animate-spin' : ''} />{busy ? 'Working...' : 'Refresh plan'}</button>
        </>
      )}>
      {tab === 'overview' && <Overview auth={auth} onExpired={onExpired} go={setTab} />}
      {tab === 'customers' && <CustomersPage auth={auth} onExpired={onExpired} />}
      {tab === 'cylinders' && <CylindersPage auth={auth} onExpired={onExpired} />}
      {tab === 'accounts' && <AccountsPage auth={auth} onExpired={onExpired} />}
      {tab === 'stock' && <StockPage auth={auth} onExpired={onExpired} />}
      {tab === 'expenses' && <ExpensesPage auth={auth} onExpired={onExpired} />}
      {tab === 'reports' && <ReportsPage auth={auth} onExpired={onExpired} />}
      {tab === 'notes' && <NotesPage auth={auth} onExpired={onExpired} />}
      {tab === 'assistant' && <AssistantPage auth={auth} onExpired={onExpired} />}
      {tab === 'staff' && <StaffPage auth={auth} onExpired={onExpired} />}
      {tab === 'requests' && <RequestsPage auth={auth} onExpired={onExpired} />}
      {tab === 'sales' && <SalesPage auth={auth} onExpired={onExpired} />}
      {tab === 'settings' && <SettingsPage auth={auth} onExpired={onExpired} />}
      {tab === 'audit' && <AuditPage auth={auth} onExpired={onExpired} />}
      {tab === 'dispatch' && error && <p className="error banner m-3">{error}</p>}
      {tab === 'dispatch' && plan && (
        <main className="dispatch">
          <div className="relative flex min-h-[55vh] min-w-0 flex-1 lg:min-h-0">
            <PlanMap plan={plan} coords={coords} published={routes} paths={paths} />
            <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-wrap gap-2 pl-12">
              {[[RouteIcon, `${plan.routes.length} vehicles`], [MapPin, `${plan.routes.reduce((n, r) => n + r.stops.length, 0)} stops`],
                [Clock, `${plan.routes.reduce((n, r) => n + (r.minutes || 0), 0)} min`], [null, `${Math.round(plan.routes.reduce((n, r) => n + (r.km || 0), 0) * 10) / 10} km`]]
                .map(([Icon, text]) => (
                  <span key={text} className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-soft ring-1 ring-slate-200/70 backdrop-blur">
                    {Icon && <Icon size={13} className="text-brand-600" />}{text}
                  </span>
                ))}
            </div>
            <div className="pointer-events-none absolute bottom-6 left-3 z-10 flex gap-3 rounded-xl bg-white/90 px-3 py-2 text-[11px] font-medium text-slate-600 shadow-soft ring-1 ring-slate-200/70 backdrop-blur">
              {Object.entries(BAND_COLOR).map(([k, c]) => <span key={k} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />{k}</span>)}
            </div>
          </div>
          <aside className="panel">
            <PublishedRoutes
              routes={routes} drivers={drivers} busy={busy}
              onAssign={(id, name) => guard(async () => { await assignRoute(auth.token, id, name); await loadAll() })}
              onPublish={() => guard(async () => { await publishPlan(auth.token, seconds); await loadAll() })}
            />
            <UrgentForm
              customers={coords} openUrgent={openUrgent} busy={busy}
              onCreate={(id, note) => guard(async () => { await createUrgent(auth.token, id, note); await loadAll() })}
            />
            <EmptiesPanel empties={emptiesInfo} />
            <PlanPanel plan={plan} published={routes.length > 0} />
          </aside>
        </main>
      )}
    </Shell>
  )
}
