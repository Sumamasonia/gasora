import { useEffect, useMemo } from 'react'
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { BAND_COLOR, VEHICLE_COLORS } from './colors'

function FitToPoints({ points }) {
  const map = useMap()
  useEffect(() => {
    if (points.length > 1) map.fitBounds(points, { padding: [30, 30] })
  }, [map, points])
  return null
}

// Draws the published routes when there are any, and the proposed plan before publishing.
export default function PlanMap({ plan, coords, published = [], paths = [] }) {
  const depot = [plan.depot.lat, plan.depot.lon]
  const routes = published.length > 0 ? published : plan.routes
  const stopInfo = {}                                   // customer id -> { seq, status }
  routes.forEach((r) => r.stops.forEach((s, i) => { stopInfo[s.customer_id] = { seq: i + 1, status: s.status || 'pending' } }))
  const inRoute = new Set(Object.keys(stopInfo).map(Number))
  // Computed once per data load, so the map does not jump back to the full view when you type or click.
  const allPoints = useMemo(
    () => [[plan.depot.lat, plan.depot.lon], ...Object.values(coords).map((c) => [c.lat, c.lon])],
    [plan.depot.lat, plan.depot.lon, coords],
  )

  return (
    <MapContainer center={depot} zoom={12} className="map">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitToPoints points={allPoints} />

      {routes.map((route, i) => {
        const straight = [depot, ...route.stops.map((s) => [coords[s.customer_id].lat, coords[s.customer_id].lon]), depot]
        const line = paths[i] && paths[i].length > 1 ? paths[i] : straight
        return (
          <Polyline
            key={route.vehicle}
            positions={line}
            pathOptions={{ color: VEHICLE_COLORS[i % VEHICLE_COLORS.length], weight: 3, opacity: 0.8 }}
          />
        )
      })}

      {plan.risk_table.map((row) => {
        const c = coords[row.customer_id]
        if (!c) return null
        const visited = inRoute.has(row.customer_id)
        const info = stopInfo[row.customer_id]
        let color = row.urgent ? BAND_COLOR.Urgent : BAND_COLOR[row.band]
        if (info && info.status === 'delivered') color = '#2e7d32'
        if (info && info.status === 'skipped') color = '#757575'
        return (
          <CircleMarker
            key={row.customer_id}
            center={[c.lat, c.lon]}
            radius={visited ? 8 : 5}
            pathOptions={{ color, fillColor: color, fillOpacity: visited ? 0.9 : 0.45, weight: visited ? 2 : 1 }}
          >
            <Popup>
              <strong>{row.name}</strong>
              <br />
              {row.urgent && <>Urgent request<br /></>}
              Risk {Math.round(row.risk * 100)}% ({row.band})
              <br />
              {row.window_days && <>Likely empty in {row.window_days[0]} to {row.window_days[1]} days<br /></>}
              {row.days_since_delivery === null
                ? 'No delivery history'
                : `${row.days_since_delivery} days since last delivery`}
              <br />
              {!visited && 'Not on a route today'}
              {visited && `Stop ${stopInfo[row.customer_id].seq}: ${stopInfo[row.customer_id].status}`}
            </Popup>
          </CircleMarker>
        )
      })}

      <CircleMarker center={depot} radius={10} pathOptions={{ color: '#111', fillColor: '#111', fillOpacity: 1 }}>
        <Popup>Depot (placeholder position)</Popup>
      </CircleMarker>
    </MapContainer>
  )
}
