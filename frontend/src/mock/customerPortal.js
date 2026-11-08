import { ApiError } from '../api.js'
import { requireAuth } from './auth.js'
import { computeCustomerBalance } from './billing.js'
import { getDb, nextId, recordEvent, saveDb } from './db.js'
import { createSeedRoutes } from './dispatch.js'

// Helper to get authenticated customer entity
function getAuthCustomer(token) {
  const user = requireAuth(token, ['customer'])
  const db = getDb()
  const customerId = user.customer_id || 1
  const customer = (db.customers || []).find((c) => c.id === customerId)
  if (!customer) {
    throw new ApiError(404, `Customer record for account #${customerId} not found`)
  }
  return { user, customer, customerId }
}

/**
 * Handle GET /me/orders
 * Customer can only read its own orders/requests and delivery history
 */
export function handleGetMyOrders(token) {
  const { customer, customerId } = getAuthCustomer(token)
  const db = getDb()

  const requests = (db.requests || []).filter((r) => r.customer_id === customerId)

  // Map requests into clean order format
  const orders = requests.map((req) => ({
    id: req.id,
    order_no: req.request_no || `REQ-${String(req.id).padStart(4, '0')}`,
    type: req.request_type || 'normal',
    cylinders: req.cylinders || customer.demand || 1,
    cylinder_type: req.cylinder_type || customer.cylinder_type || '11.8 kg',
    status: req.status || 'pending',
    note: req.note || '',
    created_at: req.created_at,
    delivered_at: req.delivered_at || null,
  }))

  orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  return orders
}

/**
 * Handle GET /me/bills
 * Customer can only read its own billing invoices
 */
export function handleGetMyBills(token) {
  const { customerId } = getAuthCustomer(token)
  const db = getDb()

  const bills = (db.bills || [])
    .filter((b) => b.customer_id === customerId)
    .sort((a, b) => new Date(b.created_at || b.due_date) - new Date(a.created_at || a.due_date))

  return bills
}

/**
 * Handle GET /me/balance
 * Customer account balance, deposit held, total invoiced, total paid, and last payment
 */
export function handleGetMyBalance(token) {
  const { customer, customerId } = getAuthCustomer(token)
  const db = getDb()

  const balance = computeCustomerBalance(customerId)
  const ledger = (db.ledger || []).filter((l) => l.customer_id === customerId)
  const totalInvoiced = ledger.reduce((sum, l) => sum + (Number(l.debit) || 0), 0)
  const totalPaid = ledger.reduce((sum, l) => sum + (Number(l.credit) || 0), 0)

  const customerPayments = (db.payments || [])
    .filter((p) => p.customer_id === customerId)
    .sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date))

  const unpaidBills = (db.bills || []).filter(
    (b) => b.customer_id === customerId && b.status !== 'paid'
  )

  return {
    customer_id: customer.id,
    customer_code: customer.code,
    customer_name: customer.name,
    customer_type: customer.customer_type,
    cylinder_type: customer.cylinder_type,
    balance,
    deposit: customer.deposit || 0,
    total_invoiced: totalInvoiced,
    total_paid: totalPaid,
    unpaid_bills_count: unpaidBills.length,
    last_payment: customerPayments[0] || null,
  }
}

/**
 * Handle GET /me/next-delivery
 * Expected next delivery for this customer
 */
export function handleGetMyNextDelivery(token) {
  const { customer, customerId } = getAuthCustomer(token)
  const db = getDb()
  const todayStr = new Date().toISOString().split('T')[0]

  let routes = (db.routes || []).filter((r) => r.day === todayStr)
  if (routes.length === 0) {
    routes = createSeedRoutes(todayStr)
    db.routes = (db.routes || []).concat(routes)
    saveDb()
  }

  // Look for customer stop in today's active routes
  let matchedStop = null
  let matchedRoute = null
  for (const r of routes) {
    const stop = (r.stops || []).find((s) => s.customer_id === customerId)
    if (stop) {
      matchedStop = stop
      matchedRoute = r
      break
    }
  }

  if (matchedStop && matchedRoute) {
    return {
      scheduled: true,
      is_today: true,
      expected_date: todayStr,
      window: 'Today (10:00 AM – 1:00 PM)',
      cylinders: matchedStop.cylinders || customer.demand || 1,
      cylinder_type: customer.cylinder_type || '11.8 kg',
      status: matchedStop.status === 'delivered' ? 'delivered' : 'planned',
      driver_name: matchedRoute.driver === 'driver1' ? 'Rashid Ali' : matchedRoute.driver === 'driver2' ? 'Muhammad Usman' : (matchedRoute.driver || 'Driver Assigned'),
      driver_phone: '0300-1234567',
      vehicle_no: matchedRoute.vehicle,
      depletion_band: matchedStop.band || 'Critical',
      is_urgent: Boolean(matchedStop.urgent),
    }
  }

  return {
    scheduled: false,
    is_today: false,
    expected_date: 'Next Planning Cycle (Tomorrow)',
    window: 'Morning Delivery Window (9:00 AM – 1:00 PM)',
    cylinders: customer.demand || 1,
    cylinder_type: customer.cylinder_type || '11.8 kg',
    status: 'predicted',
    driver_name: null,
    driver_phone: null,
    vehicle_no: null,
    depletion_band: 'Normal',
    is_urgent: false,
  }
}

/**
 * Handle GET /me/delivery-status
 * 3-step status (Planned, On the way = route published and driver assigned, Delivered)
 * Stop's position in route (e.g. "3 stops before you")
 * Honest note that no live location is tracked
 */
export function handleGetMyDeliveryStatus(token) {
  const { customer, customerId } = getAuthCustomer(token)
  const db = getDb()
  const todayStr = new Date().toISOString().split('T')[0]

  let routes = (db.routes || []).filter((r) => r.day === todayStr)
  if (routes.length === 0) {
    routes = createSeedRoutes(todayStr)
    db.routes = (db.routes || []).concat(routes)
    saveDb()
  }

  let matchedStop = null
  let matchedRoute = null
  for (const r of routes) {
    const stop = (r.stops || []).find((s) => s.customer_id === customerId)
    if (stop) {
      matchedStop = stop
      matchedRoute = r
      break
    }
  }

  if (!matchedStop || !matchedRoute) {
    return {
      has_active_delivery: false,
      status: 'none',
      step: 0,
      title: 'No active delivery scheduled today',
      message: 'You have no scheduled stops on today\'s routes. You can place a refill request below.',
      stops_before_you: 0,
      position_text: 'No active delivery',
      driver_name: null,
      driver_phone: null,
      vehicle_no: null,
      cylinders: customer.demand || 1,
      cylinder_type: customer.cylinder_type || '11.8 kg',
      delivery_address: customer.address || 'Faisalabad',
      area: customer.area || 'Faisalabad',
      has_live_location: false,
      live_location_note: 'No live GPS tracking is broadcast. Delivery estimates update honestly as drivers complete preceding stops on their route.',
    }
  }

  let step = 1
  let status = 'planned'
  let statusTitle = 'Planned'
  let statusDesc = 'Your cylinder delivery is planned in today\'s route schedule.'

  const isDelivered = matchedStop.status === 'delivered'
  const isDriverAssigned = Boolean(matchedRoute.driver)

  if (isDelivered) {
    step = 3
    status = 'delivered'
    statusTitle = 'Delivered'
    statusDesc = 'Your cylinders have been successfully delivered and empty cylinders collected.'
  } else if (isDriverAssigned) {
    step = 2
    status = 'on_the_way'
    statusTitle = 'On the way'
    statusDesc = 'Route is published and driver is assigned and currently on the way.'
  }

  // Count pending stops before this stop
  const pendingStopsAhead = (matchedRoute.stops || []).filter(
    (s) => s.seq < matchedStop.seq && s.status !== 'delivered' && s.status !== 'skipped'
  ).length

  let positionText = ''
  if (isDelivered) {
    positionText = 'Delivered'
  } else if (pendingStopsAhead === 0) {
    positionText = 'You are the next stop!'
  } else if (pendingStopsAhead === 1) {
    positionText = '1 stop before you'
  } else {
    positionText = `${pendingStopsAhead} stops before you`
  }

  const driverDisplayName = matchedRoute.driver === 'driver1' ? 'Rashid Ali' : matchedRoute.driver === 'driver2' ? 'Muhammad Usman' : (matchedRoute.driver || 'Driver Assigned')

  return {
    has_active_delivery: true,
    status,
    step, // 1: Planned, 2: On the way, 3: Delivered
    status_title: statusTitle,
    status_description: statusDesc,
    stops_before_you: pendingStopsAhead,
    position_text: positionText,
    stop_sequence: matchedStop.seq,
    total_stops: matchedRoute.stops.length,
    driver_name: driverDisplayName,
    driver_phone: '0300-1234567',
    vehicle_no: matchedRoute.vehicle,
    cylinders: matchedStop.cylinders || customer.demand || 1,
    cylinder_type: customer.cylinder_type || '11.8 kg',
    delivery_address: customer.address || 'Faisalabad',
    area: customer.area || 'Faisalabad',
    is_urgent: Boolean(matchedStop.urgent),
    has_live_location: false,
    live_location_note: 'No live GPS tracking is broadcast. Delivery order reflects the planned route sequence.',
    timeline: [
      { step: 1, label: 'Planned', desc: 'Order scheduled in route', completed: true, current: step === 1 },
      { step: 2, label: 'On the way', desc: isDriverAssigned ? `Route published, ${driverDisplayName} assigned` : 'Waiting for driver assignment', completed: step >= 2, current: step === 2 },
      { step: 3, label: 'Delivered', desc: isDelivered ? 'Cylinders exchanged & signed' : 'Delivery handover at premises', completed: step === 3, current: step === 3 },
    ],
  }
}

/**
 * Handle POST /me/requests
 * Customer places a refill request (normal or urgent)
 */
export function handleCreateMyRequest(token, body) {
  const { user, customer, customerId } = getAuthCustomer(token)
  if (!body) {
    throw new ApiError(422, 'Request body is required')
  }

  const requestType = body.request_type === 'urgent' ? 'urgent' : 'normal'
  const cylinders = Math.max(1, Math.min(20, Number(body.cylinders) || customer.demand || 1))
  const note = (body.note || '').trim()

  const db = getDb()
  const reqId = nextId('requests')
  const newRequest = {
    id: reqId,
    request_no: `REQ-${String(reqId).padStart(4, '0')}`,
    customer_id: customerId,
    customer_name: customer.name,
    request_type: requestType,
    cylinders,
    cylinder_type: customer.cylinder_type || '11.8 kg',
    note,
    status: 'pending',
    created_at: new Date().toISOString(),
    delivered_at: null,
  }

  if (!db.requests) db.requests = []
  db.requests.unshift(newRequest)

  // If urgent, also add to db.urgent_requests for engine priority planning
  if (requestType === 'urgent') {
    const urgentId = nextId('urgent_requests')
    const urgentItem = {
      urgent_id: urgentId,
      id: urgentId,
      customer_id: customerId,
      name: customer.name,
      note: note || 'Urgent refill requested via Customer Portal (planned with highest priority)',
      status: 'open',
      created_on: new Date().toISOString().split('T')[0],
      created_by: user.username,
    }
    if (!db.urgent_requests) db.urgent_requests = []
    db.urgent_requests.unshift(urgentItem)
  }

  recordEvent({
    type: 'customer.request_created',
    actor: user.username,
    description: `Customer ${customer.name} placed a ${requestType} refill request (${cylinders}x ${customer.cylinder_type || 'cylinders'})`,
    details: { requestId: reqId, requestType, cylinders, note },
  })

  saveDb()
  return newRequest
}
