import { useState } from 'react'
import { BAND_COLOR, VEHICLE_COLORS } from './colors'
import { Badge, UrgentTag } from './ui'

// Helper to compute estimated arrival time: start of shift (8:30 AM) + cumulative minutes from plan
export function calculateEta(stopSeq, totalStops, totalMinutes, shiftStartHour = 8, shiftStartMin = 30) {
  if (!totalStops) return ''
  const cumMinutes = Math.round((stopSeq / totalStops) * (totalMinutes || 120))
  const totalM = shiftStartHour * 60 + shiftStartMin + cumMinutes
  const h24 = Math.floor(totalM / 60) % 24
  const m = totalM % 60
  const period = h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 % 12 || 12
  const formatted = `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`
  return formatted
}

export function UrgentForm({
  customers,
  openUrgent = [],
  onCreate,
  busy,
  selectedCustomerId = null,
  onSelectCustomer = null,
}) {
  const [search, setSearch] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [note, setNote] = useState('')

  const ids = Object.keys(customers).sort((a, b) =>
    (customers[a]?.name || '').localeCompare(customers[b]?.name || '')
  )

  // Filter customer options by search text
  const filteredIds = ids.filter((id) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    const name = (customers[id]?.name || '').toLowerCase()
    return name.includes(q) || String(id).includes(q)
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!customerId) return
    onCreate(Number(customerId), note)
    setNote('')
    setCustomerId('')
    setSearch('')
  }

  return (
    <section className="urgent-requests-section">
      <div className="urgent-header-row">
        <h3 className="urgent-section-title">
          <span className="urgent-icon" aria-hidden="true">🚨</span> Urgent Requests
          {openUrgent.length > 0 && (
            <span className="urgent-counter-pill">{openUrgent.length} open</span>
          )}
        </h3>
      </div>

      <p className="muted" style={{ fontSize: 12, margin: '2px 0 8px' }}>
        Create immediate priority delivery requests. Dispatched at the top of routes in red.
      </p>

      {/* Create Urgent Request Form with Customer Search */}
      <form onSubmit={handleSubmit} className="urgent-create-form">
        <div className="urgent-inputs-grid">
          <div className="urgent-field-wrapper">
            <input
              type="text"
              className="urgent-search-input"
              placeholder="🔍 Search customer to flag urgent..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={busy}
            />
          </div>

          <div className="urgent-field-wrapper">
            <select
              className="urgent-customer-select"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              disabled={busy}
              required
            >
              <option value="">-- Choose Customer ({filteredIds.length} available) --</option>
              {filteredIds.map((id) => (
                <option key={id} value={id}>
                  {customers[id]?.name || `Customer #${id}`}
                </option>
              ))}
            </select>
          </div>

          <div className="urgent-field-wrapper">
            <input
              type="text"
              className="urgent-note-input"
              placeholder="Urgent reason / note (e.g. completely empty, emergency refill)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={busy}
            />
          </div>
        </div>

        <button
          type="submit"
          className="urgent-submit-btn"
          disabled={busy || !customerId}
        >
          {busy ? 'Adding...' : '⚡ Flag as Urgent Delivery'}
        </button>
      </form>

      {/* List of Open Urgent Requests from GET /urgent (Urgent in Red) */}
      <div className="urgent-list-container">
        {openUrgent.length === 0 ? (
          <div className="empty-urgent-box">
            <span className="muted">No open urgent requests right now.</span>
          </div>
        ) : (
          <div className="urgent-cards-stack">
            {openUrgent.map((u) => {
              const isSelected = selectedCustomerId !== null && Number(u.customer_id) === Number(selectedCustomerId)
              return (
                <div
                  key={u.urgent_id}
                  className={`urgent-card-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => onSelectCustomer && onSelectCustomer(isSelected ? null : u.customer_id)}
                  title="Click to locate on map"
                >
                  <div className="urgent-card-top">
                    <span className="urgent-badge-pill">🚨 URGENT</span>
                    <strong className="urgent-customer-heading">{u.name}</strong>
                    <span className="urgent-created-date muted">{u.created_on}</span>
                  </div>

                  {u.note && (
                    <div className="urgent-note-box">
                      &ldquo;{u.note}&rdquo;
                    </div>
                  )}

                  <div className="urgent-card-footer muted">
                    <span>Requested by {u.created_by || 'owner'}</span>
                    <span className="locate-hint">📍 Click to locate</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

export function PublishedRoutes({
  routes,
  drivers,
  onAssign,
  onPublish,
  busy,
  selectedCustomerId = null,
  onSelectCustomer = null,
}) {
  const handlePublishConfirm = () => {
    const promptMsg = routes.length > 0
      ? 'Publish again? This will replace existing routes if work has not started.'
      : 'Publish today’s plan to drivers now?'
    if (window.confirm(promptMsg)) {
      onPublish()
    }
  }

  return (
    <section className="published-routes-section">
      <div className="routes-header-row">
        <h3>Published routes</h3>
        {routes.length > 0 && (
          <span className="muted" style={{ fontSize: 12 }}>
            {routes.length} vehicle{routes.length > 1 ? 's' : ''} &middot; {routes.reduce((acc, r) => acc + (r.stops?.length || 0), 0)} stops
          </span>
        )}
      </div>

      {routes.length === 0 && (
        <div className="empty-routes-banner">
          <p className="muted">Nothing published for today yet. Review the proposed plan below and click publish when ready.</p>
        </div>
      )}

      {routes.map((r, i) => {
        const vehicleColor = VEHICLE_COLORS[i % VEHICLE_COLORS.length]
        const delivered = (r.stops || []).filter((s) => s.status === 'delivered').length
        const skipped = (r.stops || []).filter((s) => s.status === 'skipped').length
        const total = (r.stops || []).length
        const deliveredPct = total > 0 ? (delivered / total) * 100 : 0
        const skippedPct = total > 0 ? (skipped / total) * 100 : 0

        return (
          <div key={r.route_id} className="routecard" style={{ borderLeft: `4px solid ${vehicleColor}` }}>
            <div className="routecard-header">
              <div className="routecard-title">
                <span className="chip" style={{ background: vehicleColor }} />
                <strong>Vehicle {r.vehicle}</strong>
                <span className="muted">({r.minutes} min{r.km ? `, ${r.km} km` : ''})</span>
              </div>
              <div className="routecard-progress-summary">
                <span className="progress-badge delivered">{delivered} delivered</span>
                {skipped > 0 && <span className="progress-badge skipped">{skipped} skipped</span>}
                <span className="muted">{total - delivered - skipped} left</span>
              </div>
            </div>

            {/* Segmented Progress Bar */}
            <div className="progress-bar-container" title={`${delivered} delivered, ${skipped} skipped of ${total} stops`}>
              <div className="progress-bar-delivered" style={{ width: `${deliveredPct}%` }} />
              <div className="progress-bar-skipped" style={{ width: `${skippedPct}%` }} />
            </div>

            {/* Driver Assignment Dropdown */}
            <div className="driver-assign-row">
              <label className="driver-label">
                <span className="driver-icon">👤</span> Driver:
              </label>
              <select
                className="driver-select"
                value={r.driver || ''}
                onChange={(e) => e.target.value && onAssign(r.route_id, e.target.value)}
                disabled={busy}
              >
                <option value="">-- Assign Driver --</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.username}>
                    {d.username} {d.name ? `(${d.name})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Coloured Vertical Timeline of Numbered Stops */}
            <div className="route-timeline" style={{ '--timeline-color': vehicleColor }}>
              {r.stops.map((s) => {
                const isSelected = selectedCustomerId !== null && Number(s.customer_id) === Number(selectedCustomerId)
                const eta = calculateEta(s.seq, total, r.minutes)
                const isDelivered = s.status === 'delivered'
                const isSkipped = s.status === 'skipped'
                const isPending = s.status === 'pending'

                let nodeBg = vehicleColor
                let nodeContent = s.seq
                if (isDelivered) {
                  nodeBg = '#16a34a'
                  nodeContent = '✓'
                } else if (isSkipped) {
                  nodeBg = '#9ca3af'
                  nodeContent = '✕'
                } else if (s.urgent) {
                  nodeBg = BAND_COLOR.Urgent
                }

                return (
                  <div
                    key={s.stop_id}
                    className={`timeline-stop-item ${s.status} ${isSelected ? 'selected' : ''}`}
                    onClick={() => onSelectCustomer && onSelectCustomer(isSelected ? null : s.customer_id)}
                  >
                    <div className="timeline-node" style={{ background: nodeBg }}>
                      {nodeContent}
                    </div>

                    <div className="timeline-stop-content">
                      <div className="timeline-stop-main">
                        <span className="timeline-customer-name">
                          {s.name}
                        </span>
                        {s.urgent && <UrgentTag />}
                        <Badge band={s.band} />
                        <span className="timeline-eta">
                          ~{eta} <span className="eta-tag">(estimate)</span>
                        </span>
                      </div>

                      <div className="timeline-stop-meta">
                        <span className="stop-address muted">
                          {s.address ? s.address.slice(0, 36) : 'Faisalabad'}
                        </span>
                        <span className="stop-demand">
                          &bull; {s.cylinders} cylinder{s.cylinders > 1 ? 's' : ''}
                        </span>
                        {isDelivered && <span className="status-label delivered">Delivered</span>}
                        {isSkipped && <span className="status-label skipped">Skipped: {s.reason}</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      <div className="publish-actions">
        <button
          className="publish-btn"
          disabled={busy}
          onClick={handlePublishConfirm}
        >
          {routes.length ? 'Publish again (replaces routes)' : 'Publish today’s plan'}
        </button>
      </div>

      {drivers.length === 0 && (
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          No driver accounts found. Drivers can be created in Users &amp; Access.
        </p>
      )}
    </section>
  )
}
