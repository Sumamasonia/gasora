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

export function UrgentForm({ customers, openUrgent, onCreate, busy }) {
  const [customerId, setCustomerId] = useState('')
  const [note, setNote] = useState('')
  const ids = Object.keys(customers).sort((a, b) => customers[a].name.localeCompare(customers[b].name))
  return (
    <section>
      <h3>Urgent request</h3>
      <div className="row">
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          <option value="">Choose customer...</option>
          {ids.map((id) => <option key={id} value={id}>{customers[id].name}</option>)}
        </select>
        <input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button disabled={busy || !customerId}
          onClick={() => { onCreate(Number(customerId), note); setNote(''); setCustomerId('') }}>Add</button>
      </div>
      {openUrgent.length > 0 && (
        <ul>
          {openUrgent.map((u) => (
            <li key={u.urgent_id}>{u.name} <span className="muted">{u.note || ''}</span></li>
          ))}
        </ul>
      )}
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
