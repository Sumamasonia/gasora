import { useEffect } from 'react'
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

export default function PlanMap({ plan, coords }) {
  const depot = [plan.depot.lat, plan.depot.lon]
  const inRoute = new Set(plan.routes.flatMap((r) => r.stops.map((s) => s.customer_id)))
  const allPoints = [depot, ...Object.values(coords).map((c) => [c.lat, c.lon])]

  return (
    <MapContainer center={depot} zoom={12} className="map">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitToPoints points={allPoints} />

      {plan.routes.map((route, i) => {
        const line = [depot, ...route.stops.map((s) => [coords[s.customer_id].lat, coords[s.customer_id].lon]), depot]
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
        const color = row.urgent ? BAND_COLOR.Urgent : BAND_COLOR[row.band]
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
              {row.days_since_delivery === null
                ? 'No delivery history'
                : `${row.days_since_delivery} days since last delivery`}
              <br />
              {visited ? 'In today\u2019s plan' : 'Not in today\u2019s plan'}
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
