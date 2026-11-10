import { useCallback, useEffect, useState } from 'react'
import {
  ApiError, assignRoute, createUrgent, getCustomers, getPaths, getPlan, getRoutes, getUrgent, getUsers, publishPlan,
} from './api'
import { BAND_COLOR, VEHICLE_COLORS } from './colors'
import PlanMap from './PlanMap'
import { PublishedRoutes, UrgentForm } from './OwnerPanels'
import RiskList from './RiskList'
import { Badge, UrgentTag } from './ui'

function PlanPanel({ plan, published, selectedCustomerId, onSelectCustomer }) {
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
      {plan.routes.map((route, i) => (
        <section key={route.vehicle}>
          <h3>
            <span className="chip" style={{ background: VEHICLE_COLORS[i % VEHICLE_COLORS.length] }} />
            Vehicle {route.vehicle}: {route.stops.length} stops, about {route.minutes} min{route.km ? `, ${route.km} km` : ''}
          </h3>
          <ol>
            {route.stops.map((s) => {
              const isSelected = selectedCustomerId !== null && Number(s.customer_id) === Number(selectedCustomerId)
              return (
                <li
                  key={s.customer_id}
                  className={isSelected ? 'selected' : ''}
                  onClick={() => onSelectCustomer && onSelectCustomer(isSelected ? null : s.customer_id)}
                  style={{ cursor: 'pointer' }}
                >
                  {s.name} {s.urgent && <UrgentTag />} <Badge band={s.band} />{' '}
                  <span className="muted">
                    {Math.round(s.risk * 100)}%
                    {s.window_days && ` \u00b7 empty in ${s.window_days[0]} to ${s.window_days[1]} days`}
                  </span>
                </li>
              )
            })}
          </ol>
        </section>
      ))}
      {plan.candidates_not_visited.length > 0 && (
        <section>
          <h3>Not visited today ({plan.candidates_not_visited.length})</h3>
          <ul>
            {plan.candidates_not_visited.map((s) => {
              const isSelected = selectedCustomerId !== null && Number(s.customer_id) === Number(selectedCustomerId)
              return (
                <li
                  key={s.customer_id}
                  className={isSelected ? 'selected' : ''}
                  onClick={() => onSelectCustomer && onSelectCustomer(isSelected ? null : s.customer_id)}
                  style={{ cursor: 'pointer' }}
                >
                  {s.name} <Badge band={s.band} /> <span className="muted">{Math.round(s.risk * 100)}%</span>
                </li>
              )
            })}
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

export default function OwnerView({ auth, onSignOut, onExpired, initialSection = 'dispatch' }) {
  const [plan, setPlan] = useState(null)
  const [coords, setCoords] = useState({})
  const [routes, setRoutes] = useState([])
  const [paths, setPaths] = useState([])
  const [drivers, setDrivers] = useState([])
  const [openUrgent, setOpenUrgent] = useState([])
  const [seconds, setSeconds] = useState(2)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState(null)
  const [viewMode, setViewMode] = useState('tabs') // 'tabs' | 'all'

  // Map initialSection route parameter to default tab
  const getInitialTab = (sec) => {
    if (sec === 'demand') return 'risk'
    if (sec === 'urgent') return 'urgent'
    if (sec === 'deliveries') return 'routes'
    return 'routes'
  }
  const [activeTab, setActiveTab] = useState(() => getInitialTab(initialSection))

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
    const [customers, p, r, users, u] = await Promise.all([
      getCustomers(t), getPlan(t, seconds), getRoutes(t), getUsers(t), getUrgent(t),
    ])
    const map = {}
    customers.forEach((c) => { map[c.id] = { lat: c.lat, lon: c.lon, name: c.name } })
    const shown = r.length ? r : p.routes
    const pa = await getPaths(t, shown.map((rt) => rt.stops.map((s) => s.customer_id)))
    setCoords(map); setPlan(p); setRoutes(r); setOpenUrgent(u); setPaths(pa.paths)
    setDrivers(users.filter((x) => x.role === 'driver'))
  }, [auth.token, seconds])

  useEffect(() => { guard(loadAll) }, [guard, loadAll])

  useEffect(() => {
    if (initialSection) {
      setActiveTab(getInitialTab(initialSection))
    }
  }, [initialSection])

  // Live progress polling: while routes are published, poll GET /routes every 15s (stop when tab hidden)
  useEffect(() => {
    if (!routes || routes.length === 0) return

    let timer = null

    const pollLiveProgress = async () => {
      if (document.hidden) return
      try {
        const freshRoutes = await getRoutes(auth.token)
        setRoutes(freshRoutes)
      } catch (err) {
        console.warn('Live progress poll failed:', err)
      }
    }

    const onVisibilityChange = () => {
      if (!document.hidden) {
        pollLiveProgress()
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    timer = setInterval(pollLiveProgress, 15000)

    return () => {
      if (timer) clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [auth.token, routes?.length])

  // Summary Metrics
  const activeRoutesList = routes.length > 0 ? routes : (plan?.routes || [])
  const totalStops = activeRoutesList.reduce((acc, r) => acc + (r.stops?.length || 0), 0)
  const activeVehicles = activeRoutesList.length
  const totalMinutes = activeRoutesList.reduce((acc, r) => acc + (r.minutes || 0), 0)
  const criticalRiskCount = plan?.risk_table?.filter((r) => r.band === 'Critical' || r.urgent).length || 0
  const openUrgentCount = openUrgent.length

  return (
    <div className="planner-container">
      {/* Routific-inspired Dispatch Header Bar */}
      <div className="planner-toolbar">
        <div className="planner-toolbar-left">
          <div className="planner-solver-control">
            <span className="solver-label">OR-Tools Solver:</span>
            <select
              className="solver-select"
              value={seconds}
              onChange={(e) => setSeconds(Number(e.target.value))}
              disabled={busy}
              title="Time limit for Google OR-Tools guided local search"
            >
              <option value={1}>⚡ 1s (Fast search)</option>
              <option value={2}>⏱️ 2s (Balanced)</option>
              <option value={5}>🔬 5s (Optimal)</option>
            </select>
          </div>
          <button
            type="button"
            className="planner-refresh-btn"
            disabled={busy}
            onClick={() => guard(loadAll)}
          >
            {busy ? 'Optimizing...' : '🔄 Re-calculate Routes'}
          </button>
        </div>

        <div className="planner-toolbar-right">
          {routes.length > 0 && (
            <span className="live-poll-badge" title="Live route updates: polling every 15s when tab is active">
              <span className="live-pulse-dot" /> Live Polling
            </span>
          )}
          {routes.length > 0 ? (
            <span className="planner-status-pill published">
              <span className="status-dot green" /> Routes Published &middot; {activeVehicles} Vans &middot; {totalStops} Stops
            </span>
          ) : (
            <span className="planner-status-pill preview">
              <span className="status-dot amber" /> Proposed Plan (Awaiting Publish)
            </span>
          )}
        </div>
      </div>

      {/* Quick KPI Status Strip */}
      <div className="planner-kpi-strip">
        <div className="kpi-strip-item">
          <span className="kpi-strip-icon">🚚</span>
          <div className="kpi-strip-text">
            <span className="kpi-strip-val">{activeVehicles} Vehicles</span>
            <span className="kpi-strip-label">Active Fleet</span>
          </div>
        </div>
        <div className="kpi-strip-item">
          <span className="kpi-strip-icon">📍</span>
          <div className="kpi-strip-text">
            <span className="kpi-strip-val">{totalStops} Stops</span>
            <span className="kpi-strip-label">Scheduled Visits</span>
          </div>
        </div>
        <div className="kpi-strip-item">
          <span className="kpi-strip-icon">⏱️</span>
          <div className="kpi-strip-text">
            <span className="kpi-strip-val">~{totalMinutes} min</span>
            <span className="kpi-strip-label">Shift Duration</span>
          </div>
        </div>
        <div className="kpi-strip-item">
          <span className="kpi-strip-icon">⚠️</span>
          <div className="kpi-strip-text">
            <span className="kpi-strip-val">{criticalRiskCount} Critical</span>
            <span className="kpi-strip-label">Run-out Risk</span>
          </div>
        </div>
        <div className="kpi-strip-item">
          <span className="kpi-strip-icon">🚨</span>
          <div className="kpi-strip-text">
            <span className="kpi-strip-val">{openUrgentCount} Urgent</span>
            <span className="kpi-strip-label">Priority Queue</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="error banner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '8px 16px', gap: 12 }}>
          <span>⚠️ {error}</span>
          <button type="button" className="secondary" onClick={() => guard(loadAll)} style={{ padding: '4px 10px', fontSize: 12 }}>
            Retry
          </button>
        </div>
      )}

      {plan && (
        <main className="planner-layout">
          {/* Left Column: Routific Tabbed Dispatch Control Sidebar */}
          <aside className="panel planner-sidebar">
            <div className="planner-sidebar-header">
              {/* Segmented Tab Controls */}
              <div className="planner-tab-bar" role="tablist" aria-label="Dispatch panels">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'routes'}
                  className={`planner-tab-btn ${activeTab === 'routes' ? 'active' : ''}`}
                  onClick={() => setActiveTab('routes')}
                >
                  <span>🚚 Routes</span>
                  {totalStops > 0 && <span className="tab-pill">{totalStops}</span>}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'risk'}
                  className={`planner-tab-btn ${activeTab === 'risk' ? 'active' : ''}`}
                  onClick={() => setActiveTab('risk')}
                >
                  <span>📊 Risk &amp; Demand</span>
                  {criticalRiskCount > 0 && <span className="tab-pill warning">{criticalRiskCount}</span>}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'urgent'}
                  className={`planner-tab-btn ${activeTab === 'urgent' ? 'active' : ''}`}
                  onClick={() => setActiveTab('urgent')}
                >
                  <span>🚨 Urgent</span>
                  {openUrgentCount > 0 && <span className="tab-pill danger">{openUrgentCount}</span>}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'plan'}
                  className={`planner-tab-btn ${activeTab === 'plan' ? 'active' : ''}`}
                  onClick={() => setActiveTab('plan')}
                >
                  <span>🔮 Proposal</span>
                </button>
              </div>

              {/* View layout mode toggle */}
              <div className="view-mode-toggle">
                <button
                  type="button"
                  className={`mode-btn ${viewMode === 'tabs' ? 'active' : ''}`}
                  onClick={() => setViewMode('tabs')}
                  title="Focused tab view (Routific style)"
                >
                  Tab View
                </button>
                <button
                  type="button"
                  className={`mode-btn ${viewMode === 'all' ? 'active' : ''}`}
                  onClick={() => setViewMode('all')}
                  title="Stack all sections vertically"
                >
                  Show All
                </button>
              </div>
            </div>

            {/* Tab Contents */}
            <div className="planner-tab-content">
              {(viewMode === 'all' || activeTab === 'routes') && (
                <div id="published-routes-section" className="tab-section-block">
                  <PublishedRoutes
                    routes={routes}
                    drivers={drivers}
                    busy={busy}
                    selectedCustomerId={selectedCustomerId}
                    onSelectCustomer={setSelectedCustomerId}
                    onAssign={(id, name) => guard(async () => { await assignRoute(auth.token, id, name); await loadAll() })}
                    onPublish={() => guard(async () => { await publishPlan(auth.token, seconds); await loadAll() })}
                  />
                </div>
              )}

              {(viewMode === 'all' || activeTab === 'risk') && (
                <div id="risk-list-section" className="tab-section-block">
                  <RiskList
                    riskTable={plan.risk_table}
                    selectedCustomerId={selectedCustomerId}
                    onSelectCustomer={setSelectedCustomerId}
                  />
                </div>
              )}

              {(viewMode === 'all' || activeTab === 'urgent') && (
                <div id="urgent-form-section" className="tab-section-block">
                  <UrgentForm
                    customers={coords}
                    openUrgent={openUrgent}
                    busy={busy}
                    selectedCustomerId={selectedCustomerId}
                    onSelectCustomer={setSelectedCustomerId}
                    onCreate={(id, note) => guard(async () => { await createUrgent(auth.token, id, note); await loadAll() })}
                  />
                </div>
              )}

              {(viewMode === 'all' || activeTab === 'plan') && (
                <div id="proposal-preview-section" className="tab-section-block">
                  <PlanPanel
                    plan={plan}
                    published={routes.length > 0}
                    selectedCustomerId={selectedCustomerId}
                    onSelectCustomer={setSelectedCustomerId}
                  />
                </div>
              )}
            </div>
          </aside>

          {/* Right Column: High-performance interactive Routific Map */}
          <div className="planner-map-wrapper">
            <PlanMap
              plan={plan}
              coords={coords}
              published={routes}
              paths={paths}
              selectedCustomerId={selectedCustomerId}
              onSelectCustomer={setSelectedCustomerId}
            />
          </div>
        </main>
      )}
    </div>
  )
}
