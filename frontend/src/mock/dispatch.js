import { ApiError } from '../api.js'
import { requireAuth } from './auth.js'
import { getDb, nextId, recordEvent, saveDb } from './db.js'

// Depot coordinates in central Faisalabad
export const DEPOT_COORDS = { lat: 31.4181, lon: 73.0776 }

// Generate realistic road-like path waypoints between two coordinates (Manhattan/grid corridors)
export function generateRoadLeg(start, end) {
  const [lat1, lon1] = start
  const [lat2, lon2] = end
  if (Math.abs(lat1 - lat2) < 0.00005 && Math.abs(lon1 - lon2) < 0.00005) {
    return [start]
  }

  const dLat = lat2 - lat1
  const dLon = lon2 - lon1

  // Street network turns approximating Faisalabad avenue geometry
  const p1 = [lat1 + dLat * 0.15, lon1 + dLon * 0.05]
  const p2 = [lat1 + dLat * 0.45, lon1 + dLon * 0.35]
  const p3 = [lat1 + dLat * 0.55, lon1 + dLon * 0.85]
  const p4 = [lat1 + dLat * 0.90, lon1 + dLon * 0.95]

  return [start, p1, p2, p3, p4, end]
}

// Generate the initial seed routes for today
export function createSeedRoutes(todayStr) {
  const db = getDb()
  const customers = db.customers || []
  const findCust = (id) => customers.find((c) => c.id === id) || { id, name: `Customer ${id}`, lat: 31.4181, lon: 73.0776, demand: 1 }

  const v1Customers = [
    { id: 2, risk: 0.74, band: 'Critical', urgent: false },
    { id: 4, risk: 0.58, band: 'High', urgent: false },
    { id: 3, risk: 0.22, band: 'Normal', urgent: false },
    { id: 1, risk: 0.88, band: 'Critical', urgent: false },
    { id: 5, risk: 1.00, band: 'Urgent', urgent: true },
  ]

  const v2Customers = [
    { id: 6, risk: 0.82, band: 'Critical', urgent: false },
    { id: 7, risk: 0.45, band: 'High', urgent: false },
    { id: 8, risk: 1.00, band: 'Urgent', urgent: true },
    { id: 9, risk: 0.18, band: 'Normal', urgent: false },
  ]

  const route1Id = 1
  const route2Id = 2

  const r1Stops = v1Customers.map((item, idx) => {
    const c = findCust(item.id)
    return {
      stop_id: 100 + idx + 1,
      seq: idx + 1,
      customer_id: c.id,
      name: c.name,
      address: c.address || 'Faisalabad',
      phone: c.phone || '0300-1234567',
      lat: c.lat,
      lon: c.lon,
      cylinders: c.demand || 1,
      risk: item.risk,
      band: item.band,
      urgent: item.urgent,
      status: 'pending',
      reason: null,
    }
  })

  const r2Stops = v2Customers.map((item, idx) => {
    const c = findCust(item.id)
    return {
      stop_id: 200 + idx + 1,
      seq: idx + 1,
      customer_id: c.id,
      name: c.name,
      address: c.address || 'Faisalabad',
      phone: c.phone || '0300-1234567',
      lat: c.lat,
      lon: c.lon,
      cylinders: c.demand || 1,
      risk: item.risk,
      band: item.band,
      urgent: item.urgent,
      status: 'pending',
      reason: null,
    }
  })

  return [
    {
      route_id: route1Id,
      id: route1Id,
      day: todayStr,
      vehicle: 1,
      minutes: 135,
      driver: 'driver1',
      driver_id: 2,
      delivered: 0,
      skipped: 0,
      total: r1Stops.length,
      stops: r1Stops,
    },
    {
      route_id: route2Id,
      id: route2Id,
      day: todayStr,
      vehicle: 2,
      minutes: 110,
      driver: 'driver2',
      driver_id: 3,
      delivered: 0,
      skipped: 0,
      total: r2Stops.length,
      stops: r2Stops,
    },
  ]
}

// Build the proposed plan for today
export function handleGetPlan(token, queryParams = new URLSearchParams()) {
  requireAuth(token, ['owner', 'manager'])
  const db = getDb()
  const todayStr = queryParams.get('day') || new Date().toISOString().split('T')[0]
  const seconds = Number(queryParams.get('seconds')) || 2.0

  const customers = db.customers || []
  const openUrgentIds = new Set(
    (db.urgent_requests || [])
      .filter((u) => u.status === 'open')
      .map((u) => u.customer_id)
  )

  // Risk profile computation for each customer
  const riskTable = customers.map((c) => {
    const isUrgent = openUrgentIds.has(c.id)
    // Deterministic pseudo-risk based on customer id
    const seed = ((c.id * 37 + 13) % 100) / 100.0
    let risk = seed
    let band = 'Normal'
    let daysSince = ((c.id * 7 + 3) % 25) + 3
    let window = [Math.max(1, Math.round((25 - daysSince) * 0.8)), Math.round((25 - daysSince) * 1.3) + 2]
    const deliveriesSeen = ((c.id * 3) % 8) + 2

    if (isUrgent) {
      risk = 1.0
      band = 'Urgent'
      window = [0.0, 1.0]
    } else if (risk >= 0.70) {
      band = 'Critical'
    } else if (risk >= 0.30) {
      band = 'High'
    } else {
      band = 'Normal'
    }

    return {
      customer_id: c.id,
      name: c.name,
      risk: Math.round(risk * 1000) / 1000,
      band,
      urgent: isUrgent,
      days_since_delivery: daysSince,
      window_days: window,
      deliveries_seen: deliveriesSeen,
    }
  })

  // Sort: urgent first, then highest risk descending
  riskTable.sort((a, b) => {
    if (a.urgent && !b.urgent) return -1
    if (!a.urgent && b.urgent) return 1
    return b.risk - a.risk
  })

  // Candidates for routing
  const candidates = riskTable.filter((r) => r.urgent || r.risk >= 0.10)
  const v1Stops = candidates.slice(0, 5).map((r) => ({
    customer_id: r.customer_id,
    name: r.name,
    risk: r.risk,
    band: r.band,
    urgent: r.urgent,
    window_days: r.window_days,
  }))

  const v2Stops = candidates.slice(5, 9).map((r) => ({
    customer_id: r.customer_id,
    name: r.name,
    risk: r.risk,
    band: r.band,
    urgent: r.urgent,
    window_days: r.window_days,
  }))

  const visitedIds = new Set([...v1Stops, ...v2Stops].map((s) => s.customer_id))
  const notVisited = candidates
    .filter((r) => !visitedIds.has(r.customer_id))
    .slice(0, 8)
    .map((r) => ({
      customer_id: r.customer_id,
      name: r.name,
      risk: r.risk,
      band: r.band,
      urgent: r.urgent,
    }))

  const noHistory = customers
    .filter((c) => c.id > 50 && !visitedIds.has(c.id))
    .slice(0, 3)
    .map((c) => ({
      customer_id: c.id,
      name: c.name,
    }))

  return {
    date: todayStr,
    depot: DEPOT_COORDS,
    routing: 'road',
    warnings: [],
    settings_note: `road travel times (solver ${seconds}s); candidates are customers with risk >= 0.10, plus urgent requests`,
    risk_table: riskTable,
    routes: [
      {
        vehicle: 1,
        minutes: 135,
        km: 18.4,
        stops: v1Stops,
      },
      {
        vehicle: 2,
        minutes: 110,
        km: 14.8,
        stops: v2Stops,
      },
    ],
    candidates_not_visited: notVisited,
    no_delivery_history: noHistory,
  }
}

// Publish today's plan into active routes
export function handlePublishPlan(token, body = {}) {
  const user = requireAuth(token, ['owner', 'manager'])
  const db = getDb()
  const todayStr = body.day || new Date().toISOString().split('T')[0]
  const seconds = body.seconds || 2.0

  // Check if existing routes for today are already in progress
  const existing = (db.routes || []).filter((r) => r.day === todayStr)
  if (existing.length > 0) {
    const hasStarted = existing.some((r) => (r.stops || []).some((s) => s.status !== 'pending'))
    if (hasStarted) {
      throw new ApiError(409, 'routes for this day are already in progress')
    }
  }

  // Build fresh plan and create routes
  const plan = handleGetPlan(token, new URLSearchParams(`seconds=${seconds}&day=${todayStr}`))
  const customers = db.customers || []
  const findCust = (id) => customers.find((c) => c.id === id) || { id, name: `Customer ${id}`, lat: 31.4181, lon: 73.0776, demand: 1 }

  // Preserve existing driver assignments if replacing
  const prevAssignments = {}
  existing.forEach((r) => {
    if (r.driver) prevAssignments[r.vehicle] = { driver: r.driver, driver_id: r.driver_id }
  })

  const newRoutes = plan.routes.map((pr, rIdx) => {
    const routeId = rIdx + 1
    const prev = prevAssignments[pr.vehicle] || {}
    const stops = pr.stops.map((s, sIdx) => {
      const c = findCust(s.customer_id)
      return {
        stop_id: routeId * 100 + sIdx + 1,
        seq: sIdx + 1,
        customer_id: c.id,
        name: c.name,
        address: c.address || 'Faisalabad',
        phone: c.phone || '0300-1234567',
        lat: c.lat,
        lon: c.lon,
        cylinders: c.demand || 1,
        risk: s.risk,
        band: s.band,
        urgent: Boolean(s.urgent),
        status: 'pending',
        reason: null,
      }
    })

    return {
      route_id: routeId,
      id: routeId,
      day: todayStr,
      vehicle: pr.vehicle,
      minutes: pr.minutes,
      driver: prev.driver || (pr.vehicle === 1 ? 'driver1' : null),
      driver_id: prev.driver_id || (pr.vehicle === 1 ? 2 : null),
      delivered: 0,
      skipped: 0,
      total: stops.length,
      stops,
    }
  })

  // Replace routes for today
  db.routes = (db.routes || []).filter((r) => r.day !== todayStr).concat(newRoutes)

  recordEvent({
    type: 'plan.published',
    actor: user.username,
    description: `Published ${newRoutes.length} routes for ${todayStr}`,
    details: { day: todayStr, routes: newRoutes.length },
  })

  saveDb()
  return handleGetRoutes(token, new URLSearchParams(`day=${todayStr}`))
}

// GET /routes
export function handleGetRoutes(token, queryParams = new URLSearchParams()) {
  requireAuth(token, ['owner', 'manager'])
  const db = getDb()
  const day = queryParams.get('day') || new Date().toISOString().split('T')[0]

  let routes = (db.routes || []).filter((r) => r.day === day)
  if (routes.length === 0 && day === new Date().toISOString().split('T')[0]) {
    // Lazy initialize seed routes for today if none exist
    routes = createSeedRoutes(day)
    db.routes = (db.routes || []).concat(routes)
    saveDb()
  }

  return routes.map((r) => ({
    route_id: r.route_id || r.id,
    day: r.day,
    vehicle: r.vehicle,
    minutes: r.minutes,
    driver: r.driver || null,
    delivered: (r.stops || []).filter((s) => s.status === 'delivered').length,
    skipped: (r.stops || []).filter((s) => s.status === 'skipped').length,
    total: (r.stops || []).length,
    stops: (r.stops || []).map((s) => ({
      stop_id: s.stop_id || s.id,
      seq: s.seq,
      customer_id: s.customer_id,
      name: s.name,
      address: s.address,
      phone: s.phone,
      lat: s.lat,
      lon: s.lon,
      cylinders: s.cylinders,
      risk: s.risk,
      band: s.band,
      urgent: Boolean(s.urgent),
      status: s.status || 'pending',
      reason: s.reason || null,
    })),
  }))
}

// PATCH /routes/{route_id}/assign
export function handleAssignRoute(token, routeId, body) {
  const user = requireAuth(token, ['owner', 'manager'])
  if (!body || !body.username) {
    throw new ApiError(422, 'username is required')
  }

  const db = getDb()
  const rId = Number(routeId)
  const route = (db.routes || []).find((r) => r.route_id === rId || r.id === rId)
  if (!route) {
    throw new ApiError(404, 'route not found')
  }

  const driverUser = (db.users || []).find((u) => u.username === body.username)
  if (!driverUser || driverUser.role !== 'driver') {
    throw new ApiError(404, 'driver not found')
  }

  route.driver = driverUser.username
  route.driver_id = driverUser.id

  recordEvent({
    type: 'route.assigned',
    actor: user.username,
    description: `Assigned Vehicle ${route.vehicle} to driver ${driverUser.username}`,
    details: { route_id: rId, driver: driverUser.username },
  })

  saveDb()
  return { ok: true }
}

// GET /my-routes
export function handleGetMyRoutes(token) {
  const user = requireAuth(token, ['owner', 'driver', 'manager'])
  const db = getDb()
  const todayStr = new Date().toISOString().split('T')[0]

  // Ensure seed routes exist
  let dayRoutes = (db.routes || []).filter((r) => r.day === todayStr)
  if (dayRoutes.length === 0) {
    dayRoutes = createSeedRoutes(todayStr)
    db.routes = (db.routes || []).concat(dayRoutes)
    saveDb()
  }

  const routes = dayRoutes.filter((r) => r.driver === user.username)
  return routes.map((r) => ({
    route_id: r.route_id || r.id,
    day: r.day,
    vehicle: r.vehicle,
    minutes: r.minutes,
    driver: r.driver,
    delivered: (r.stops || []).filter((s) => s.status === 'delivered').length,
    skipped: (r.stops || []).filter((s) => s.status === 'skipped').length,
    total: (r.stops || []).length,
    stops: (r.stops || []).map((s) => ({
      stop_id: s.stop_id || s.id,
      seq: s.seq,
      customer_id: s.customer_id,
      name: s.name,
      address: s.address,
      phone: s.phone,
      lat: s.lat,
      lon: s.lon,
      cylinders: s.cylinders,
      risk: s.risk,
      band: s.band,
      urgent: Boolean(s.urgent),
      status: s.status || 'pending',
      reason: s.reason || null,
    })),
  }))
}

// POST /route-stops/{stop_id}/deliver
export function handleDeliverStop(token, stopId, body = {}) {
  const user = requireAuth(token, ['owner', 'driver', 'manager'])
  const db = getDb()
  const sId = Number(stopId)

  let stop = null
  let route = null
  for (const r of (db.routes || [])) {
    const found = (r.stops || []).find((s) => s.stop_id === sId || s.id === sId)
    if (found) {
      stop = found
      route = r
      break
    }
  }

  if (!stop) {
    throw new ApiError(404, 'stop not found')
  }

  if (user.role !== 'owner' && route && route.driver && route.driver !== user.username) {
    throw new ApiError(403, 'this stop is not on your route')
  }

  if (stop.status !== 'pending') {
    throw new ApiError(409, 'this stop is already closed')
  }

  const customerId = stop.customer_id
  const cust = (db.customers || []).find((c) => c.id === customerId)
  if (!cust) {
    throw new ApiError(404, 'customer not found')
  }

  const deliveredIds = body?.delivered_cylinder_ids || []
  const emptyIds = body?.empty_cylinder_ids || []

  // VALIDATION: Reject everything if even one cylinder id is wrong!
  if (deliveredIds.length > 0) {
    for (const cylId of deliveredIds) {
      const c = (db.cylinders || []).find((item) => item.id === Number(cylId))
      if (!c) {
        throw new ApiError(409, `Cylinder with ID ${cylId} does not exist`)
      }
      if (c.state !== 'Filled') {
        throw new ApiError(409, `Cylinder ${c.serial_no} is not in Filled state (current: ${c.state})`)
      }
    }
  }

  if (emptyIds.length > 0) {
    for (const cylId of emptyIds) {
      const c = (db.cylinders || []).find((item) => item.id === Number(cylId))
      if (!c) {
        throw new ApiError(409, `Cylinder with ID ${cylId} does not exist`)
      }
      if (c.state !== 'Delivered') {
        throw new ApiError(409, `Cylinder ${c.serial_no} is not in Delivered state (current: ${c.state})`)
      }
      if (Number(c.customer_id) !== Number(customerId)) {
        throw new ApiError(409, `Cylinder ${c.serial_no} is held by customer ${c.customer_id}, not ${customerId}`)
      }
    }
  }

  const todayStr = new Date().toISOString().split('T')[0]
  const deliveryId = nextId('deliveries')
  const qtyDelivered = body?.cylinders || stop.cylinders || cust.demand || 1

  // Record delivery
  const deliveryRecord = {
    id: deliveryId,
    customer_id: customerId,
    route_id: route?.route_id || route?.id || 1,
    driver: user.username,
    delivered_on: todayStr,
    cylinders: qtyDelivered,
    created_at: new Date().toISOString(),
  }
  if (!db.deliveries) db.deliveries = []
  db.deliveries.push(deliveryRecord)

  // Move cylinders
  let cylindersMoved = 0

  for (const cylId of deliveredIds) {
    const c = (db.cylinders || []).find((item) => item.id === Number(cylId))
    const fromState = c.state
    c.state = 'Delivered'
    c.customer_id = customerId
    cylindersMoved++

    const event = recordEvent({
      type: 'cylinder.transition',
      actor: user.username,
      description: `Delivered cylinder ${c.serial_no} to customer ${cust.name}`,
      details: { cylinder_id: c.id, from_state: fromState, to_state: 'Delivered', customer_id: customerId, delivery_id: deliveryId },
    })

    if (!db.cylinder_history) db.cylinder_history = []
    const due = new Date()
    due.setDate(due.getDate() + 15)
    db.cylinder_history.push({
      id: nextId('cylinder_history'),
      cylinder_id: c.id,
      txn_type: 'transition',
      from_state: fromState,
      to_state: 'Delivered',
      customer_id: customerId,
      delivery_id: deliveryId,
      actor: user.username,
      note: `Delivered via route stop #${sId}`,
      due_date: due.toISOString().split('T')[0],
      created_at: new Date().toISOString(),
      event_id: event.id,
    })
  }

  for (const cylId of emptyIds) {
    const c = (db.cylinders || []).find((item) => item.id === Number(cylId))
    const fromState = c.state
    c.state = 'Recovered'
    c.customer_id = null
    cylindersMoved++

    const event = recordEvent({
      type: 'cylinder.transition',
      actor: user.username,
      description: `Collected empty cylinder ${c.serial_no} from customer ${cust.name}`,
      details: { cylinder_id: c.id, from_state: fromState, to_state: 'Recovered', customer_id: null, delivery_id: deliveryId },
    })

    if (!db.cylinder_history) db.cylinder_history = []
    db.cylinder_history.push({
      id: nextId('cylinder_history'),
      cylinder_id: c.id,
      txn_type: 'transition',
      from_state: fromState,
      to_state: 'Recovered',
      customer_id: customerId,
      delivery_id: deliveryId,
      actor: user.username,
      note: `Recovered empty via route stop #${sId}`,
      due_date: null,
      created_at: new Date().toISOString(),
      event_id: event.id,
    })
  }

  // Update stop status
  stop.status = 'delivered'
  stop.delivery_id = deliveryId

  // Update route delivered / skipped counts
  if (route && route.stops) {
    route.delivered = route.stops.filter((s) => s.status === 'delivered').length
    route.skipped = route.stops.filter((s) => s.status === 'skipped').length
  }

  // Close open urgent requests for this customer
  if (db.urgent_requests) {
    db.urgent_requests.forEach((u) => {
      if (u.customer_id === customerId && u.status === 'open') {
        u.status = 'done'
        recordEvent({
          type: 'urgent.closed',
          actor: user.username,
          description: `Closed urgent request #${u.urgent_id || u.id} on delivery`,
          details: { urgent_id: u.urgent_id || u.id, delivery_id: deliveryId },
        })
      }
    })
  }

  recordEvent({
    type: 'stop.delivered',
    actor: user.username,
    description: `Completed stop #${sId} for ${cust.name}`,
    details: { stop_id: sId, customer_id: customerId, cylinders: qtyDelivered, cylinders_moved: cylindersMoved },
  })

  saveDb()
  return { ok: true, cylinders_moved: cylindersMoved }
}

// POST /route-stops/{stop_id}/skip
export function handleSkipStop(token, stopId, body) {
  const user = requireAuth(token, ['owner', 'driver', 'manager'])
  if (!body?.reason || !body.reason.trim()) {
    throw new ApiError(422, 'reason is required')
  }

  const db = getDb()
  const sId = Number(stopId)

  let stop = null
  let route = null
  for (const r of (db.routes || [])) {
    const found = (r.stops || []).find((s) => s.stop_id === sId || s.id === sId)
    if (found) {
      stop = found
      route = r
      break
    }
  }

  if (!stop) {
    throw new ApiError(404, 'stop not found')
  }

  if (user.role !== 'owner' && route && route.driver && route.driver !== user.username) {
    throw new ApiError(403, 'this stop is not on your route')
  }

  if (stop.status !== 'pending') {
    throw new ApiError(409, 'this stop is already closed')
  }

  stop.status = 'skipped'
  stop.reason = body.reason.trim()

  if (route && route.stops) {
    route.delivered = route.stops.filter((s) => s.status === 'delivered').length
    route.skipped = route.stops.filter((s) => s.status === 'skipped').length
  }

  recordEvent({
    type: 'stop.skipped',
    actor: user.username,
    description: `Skipped stop #${sId}: ${stop.reason}`,
    details: { stop_id: sId, customer_id: stop.customer_id, reason: stop.reason },
  })

  saveDb()
  return { ok: true }
}

// GET /urgent
export function handleGetUrgent(token) {
  requireAuth(token, ['owner', 'manager'])
  const db = getDb()
  const list = (db.urgent_requests || []).filter((u) => u.status === 'open')
  return list.map((u) => {
    const cust = (db.customers || []).find((c) => c.id === u.customer_id)
    return {
      urgent_id: u.urgent_id || u.id,
      customer_id: u.customer_id,
      name: u.name || cust?.name || `Customer #${u.customer_id}`,
      note: u.note || null,
      created_on: u.created_on || new Date().toISOString().split('T')[0],
      created_by: u.created_by || 'owner',
    }
  })
}

// POST /urgent
export function handleCreateUrgent(token, body) {
  const user = requireAuth(token, ['owner', 'manager', 'customer'])
  if (!body || !body.customer_id) {
    throw new ApiError(422, 'customer_id is required')
  }

  const db = getDb()
  const custId = Number(body.customer_id)
  const cust = (db.customers || []).find((c) => c.id === custId)
  if (!cust) {
    throw new ApiError(404, 'customer not found')
  }

  const todayStr = new Date().toISOString().split('T')[0]
  const urgentId = nextId('urgent_requests')
  const record = {
    urgent_id: urgentId,
    id: urgentId,
    customer_id: custId,
    name: cust.name,
    note: body.note ? body.note.trim() : null,
    status: 'open',
    created_on: todayStr,
    created_by: user.username,
  }

  if (!db.urgent_requests) db.urgent_requests = []
  db.urgent_requests.push(record)

  recordEvent({
    type: 'urgent.created',
    actor: user.username,
    description: `Created urgent request for ${cust.name}`,
    details: { urgent_id: urgentId, customer_id: custId, note: record.note },
  })

  saveDb()
  return { urgent_id: urgentId }
}

// POST /paths
export function handlePostPaths(token, body) {
  requireAuth(token, ['owner', 'driver', 'manager'])
  const db = getDb()
  const customerMap = {}
  ;(db.customers || []).forEach((c) => {
    customerMap[c.id] = { lat: c.lat, lon: c.lon }
  })
  const depot = [DEPOT_COORDS.lat, DEPOT_COORDS.lon]
  const routesSeq = body?.routes || []

  const paths = routesSeq.map((seq) => {
    const points = [depot]
    seq.forEach((cid) => {
      if (customerMap[cid]) {
        points.push([customerMap[cid].lat, customerMap[cid].lon])
      }
    })
    points.push(depot)

    const fullRoad = []
    for (let i = 0; i < points.length - 1; i++) {
      const leg = generateRoadLeg(points[i], points[i + 1])
      if (fullRoad.length === 0) {
        fullRoad.push(...leg)
      } else {
        fullRoad.push(...leg.slice(1))
      }
    }
    return fullRoad
  })

  return { paths }
}
