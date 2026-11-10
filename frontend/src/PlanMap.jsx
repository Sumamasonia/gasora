import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { BAND_COLOR, VEHICLE_COLORS } from './colors'

function FitToPoints({ points }) {
  const map = useMap()
  useEffect(() => {
    if (points.length > 1) map.fitBounds(points, { padding: [36, 36], maxZoom: 15 })
  }, [map, points])
  return null
}

function MapInvalidator() {
  const map = useMap()
  useEffect(() => {
    const invalidate = () => {
      try {
        map.invalidateSize()
      } catch {}
    }
    invalidate()
    const t1 = setTimeout(invalidate, 100)
    const t2 = setTimeout(invalidate, 400)
    const t3 = setTimeout(invalidate, 1000)
    window.addEventListener('resize', invalidate)

    const container = map.getContainer ? map.getContainer() : null
    let ro = null
    if (container && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        invalidate()
      })
      ro.observe(container)
    }

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      window.removeEventListener('resize', invalidate)
      if (ro) ro.disconnect()
    }
  }, [map])
  return null
}

function FlyToSelected({ selectedCustomerId, coords }) {
  const map = useMap()
  useEffect(() => {
    if (selectedCustomerId && coords[selectedCustomerId]) {
      const pt = coords[selectedCustomerId]
      map.flyTo([pt.lat, pt.lon], Math.max(map.getZoom(), 14), { duration: 0.7 })
    }
  }, [selectedCustomerId, coords, map])
  return null
}

function createRoutificMarker(seq, color, isSelected, status, isUrgent) {
  let bg = color
  let content = seq
  if (status === 'delivered') {
    bg = '#16a34a'
    content = '✓'
  } else if (status === 'skipped') {
    bg = '#94a3b8'
    content = '✕'
  } else if (isUrgent) {
    bg = '#dc2626'
  }

  const selectedClass = isSelected ? 'selected' : ''
  const statusClass = status || 'pending'
  const urgentClass = isUrgent ? 'urgent' : ''

  return L.divIcon({
    className: 'routific-map-marker-container',
    html: `
      <div class="routific-stop-pin ${selectedClass} ${statusClass} ${urgentClass}" style="background-color: ${bg};">
        <span class="marker-seq">${content}</span>
        ${isSelected ? '<span class="marker-pulse-ring"></span>' : ''}
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  })
}

function createDepotMarker() {
  return L.divIcon({
    className: 'routific-depot-marker-container',
    html: `
      <div class="routific-depot-pin" title="Gasora Central Depot (Faisalabad)">
        <span class="depot-icon">🏭</span>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
  })
}

// Draws the published routes when there are any, and the proposed plan before publishing.
export default function PlanMap({
  plan,
  coords,
  published = [],
  paths = [],
  selectedCustomerId = null,
  onSelectCustomer = null,
}) {
  const depot = [plan.depot.lat, plan.depot.lon]
  const routes = published.length > 0 ? published : plan.routes

  // Map stop info: customer_id -> { seq, status, vehicleIdx, vehicleColor, minutes, km }
  const stopInfo = useMemo(() => {
    const map = {}
    routes.forEach((r, vIdx) => {
      const vColor = VEHICLE_COLORS[vIdx % VEHICLE_COLORS.length]
      r.stops.forEach((s, sIdx) => {
        map[s.customer_id] = {
          seq: sIdx + 1,
          status: s.status || 'pending',
          vehicle: r.vehicle,
          vehicleColor: vColor,
          address: s.address,
        }
      })
    })
    return map
  }, [routes])

  const inRoute = useMemo(() => new Set(Object.keys(stopInfo).map(Number)), [stopInfo])

  const allPoints = useMemo(
    () => [[plan.depot.lat, plan.depot.lon], ...Object.values(coords).map((c) => [c.lat, c.lon])],
    [plan.depot.lat, plan.depot.lon, coords],
  )

  const depotIcon = useMemo(() => createDepotMarker(), [])

  return (
    <div className="routific-map-container">
      <MapContainer
        center={depot}
        zoom={12}
        className="map"
        scrollWheelZoom={true}
        style={{ width: '100%', height: '100%', minHeight: '100%' }}
      >
        <MapInvalidator />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitToPoints points={allPoints} />
        <FlyToSelected selectedCustomerId={selectedCustomerId} coords={coords} />

        {/* Polylines for routes */}
        {routes.map((route, i) => {
          const straight = [depot, ...route.stops.map((s) => [coords[s.customer_id]?.lat || depot[0], coords[s.customer_id]?.lon || depot[1]]), depot]
          const line = paths[i] && paths[i].length > 1 ? paths[i] : straight
          const vehicleColor = VEHICLE_COLORS[i % VEHICLE_COLORS.length]
          return (
            <Polyline
              key={route.vehicle}
              positions={line}
              pathOptions={{
                color: vehicleColor,
                weight: 4,
                opacity: 0.85,
                lineJoin: 'round',
                lineCap: 'round',
              }}
            />
          )
        })}

        {/* Unvisited Candidates (subtle circle markers) */}
        {plan.risk_table.map((row) => {
          const c = coords[row.customer_id]
          if (!c) return null
          const visited = inRoute.has(row.customer_id)
          if (visited) return null // Handled by custom numbered Marker below

          const isSelected = selectedCustomerId !== null && Number(row.customer_id) === Number(selectedCustomerId)
          let color = row.urgent ? BAND_COLOR.Urgent : (BAND_COLOR[row.band] || '#64748b')

          return (
            <CircleMarker
              key={row.customer_id}
              center={[c.lat, c.lon]}
              radius={isSelected ? 10 : 6}
              pathOptions={{
                color: isSelected ? '#2563eb' : color,
                fillColor: color,
                fillOpacity: isSelected ? 1 : 0.45,
                weight: isSelected ? 3 : 1.5,
              }}
              eventHandlers={{
                click: () => {
                  if (onSelectCustomer) {
                    onSelectCustomer(isSelected ? null : row.customer_id)
                  }
                },
              }}
            >
              <Popup>
                <div className="map-popup-card">
                  <div className="popup-title">{row.name}</div>
                  {row.urgent && <div className="popup-urgent-badge">🚨 Urgent Request</div>}
                  <div className="popup-row">
                    <span className="popup-label">Depletion Risk:</span>
                    <strong style={{ color }}>{Math.round(row.risk * 100)}% ({row.band})</strong>
                  </div>
                  {row.window_days && (
                    <div className="popup-row">
                      <span className="popup-label">Refill window:</span>
                      <span>Empty in {row.window_days[0]}–{row.window_days[1]} days</span>
                    </div>
                  )}
                  <div className="popup-status unassigned">○ Not assigned to route today</div>
                </div>
              </Popup>
            </CircleMarker>
          )
        })}

        {/* Route Stops with Routific-style Numbered Badges */}
        {plan.risk_table.map((row) => {
          const c = coords[row.customer_id]
          if (!c) return null
          const info = stopInfo[row.customer_id]
          if (!info) return null

          const isSelected = selectedCustomerId !== null && Number(row.customer_id) === Number(selectedCustomerId)
          const markerIcon = createRoutificMarker(
            info.seq,
            info.vehicleColor,
            isSelected,
            info.status,
            Boolean(row.urgent),
          )

          return (
            <Marker
              key={row.customer_id}
              position={[c.lat, c.lon]}
              icon={markerIcon}
              eventHandlers={{
                click: () => {
                  if (onSelectCustomer) {
                    onSelectCustomer(isSelected ? null : row.customer_id)
                  }
                },
              }}
            >
              <Popup>
                <div className="map-popup-card">
                  <div className="popup-header-row">
                    <span className="popup-vehicle-badge" style={{ backgroundColor: info.vehicleColor }}>
                      Vehicle {info.vehicle} &bull; Stop #{info.seq}
                    </span>
                    <span className={`popup-status-pill ${info.status}`}>
                      {info.status === 'delivered' ? '✓ Delivered' : info.status === 'skipped' ? '✕ Skipped' : 'Pending'}
                    </span>
                  </div>
                  <div className="popup-title">{row.name}</div>
                  <div className="popup-address muted">{c.name || info.address || 'Faisalabad'}</div>

                  {row.urgent && (
                    <div className="popup-urgent-badge">🚨 Priority Urgent Delivery</div>
                  )}

                  <div className="popup-row">
                    <span className="popup-label">Risk Band:</span>
                    <strong>{row.band} ({Math.round(row.risk * 100)}%)</strong>
                  </div>

                  {row.window_days && (
                    <div className="popup-row">
                      <span className="popup-label">Expected empty:</span>
                      <span>In {row.window_days[0]}–{row.window_days[1]} days</span>
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          )
        })}

        {/* Central Depot */}
        <Marker position={depot} icon={depotIcon}>
          <Popup>
            <div className="map-popup-card depot-popup">
              <strong>🏭 Gasora LPG Central Depot</strong>
              <div className="muted">Main Distribution Hub &middot; Faisalabad</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>All vehicle shifts depart &amp; return here.</div>
            </div>
          </Popup>
        </Marker>
      </MapContainer>

      {/* Floating Map HUD Legend Card */}
      <div className="map-hud-legend">
        <div className="hud-title">Fleet Dispatch Map</div>
        <div className="hud-items">
          {routes.map((r, i) => (
            <div key={r.vehicle} className="hud-item">
              <span className="hud-color-dot" style={{ backgroundColor: VEHICLE_COLORS[i % VEHICLE_COLORS.length] }} />
              <span className="hud-label">Vehicle {r.vehicle}</span>
              <span className="hud-count muted">({r.stops?.length || 0} stops)</span>
            </div>
          ))}
          <div className="hud-item">
            <span className="hud-color-dot depot" />
            <span className="hud-label">Central Depot</span>
          </div>
          <div className="hud-item">
            <span className="hud-color-dot unassigned-dot" />
            <span className="hud-label">Unassigned Risk</span>
          </div>
        </div>
      </div>
    </div>
  )
}
