import { ApiError } from '../api.js'
import { requireAuth } from './auth.js'
import { getDb, nextId, recordEvent, saveDb } from './db.js'

export const ALLOWED_TRANSITIONS = {
  Empty: ['Filled'],
  Filled: ['Delivered'],
  Delivered: ['Recovered'],
  Recovered: ['Empty'],
}

export const RETURN_DUE_DAYS = 15

// Handle GET /cylinders with filters: state, owner, customer_id
export function handleGetCylinders(token, queryParams = new URLSearchParams()) {
  requireAuth(token, ['owner', 'driver', 'manager'])
  const db = getDb()
  let list = db.cylinders || []

  const state = queryParams.get('state')
  if (state) {
    list = list.filter((c) => c.state === state)
  }

  const owner = queryParams.get('owner')
  if (owner) {
    list = list.filter((c) => c.owner === owner)
  }

  const customerId = queryParams.get('customer_id')
  if (customerId) {
    const cid = Number(customerId)
    list = list.filter((c) => c.customer_id === cid)
  }

  return list
}

// Handle GET /cylinders/{id}
export function handleGetCylinder(token, id) {
  requireAuth(token, ['owner', 'driver', 'manager'])
  const db = getDb()
  const cyl = (db.cylinders || []).find((c) => c.id === Number(id))
  if (!cyl) {
    throw new ApiError(404, `Cylinder ${id} not found`)
  }
  return cyl
}

// Handle POST /cylinders (owner-only registration)
export function handleCreateCylinder(token, body) {
  const user = requireAuth(token, ['owner'])
  if (!body) {
    throw new ApiError(409, 'Request body is required')
  }

  const serialNo = (body.serial_no || '').trim().toUpperCase()
  if (!serialNo) {
    throw new ApiError(409, 'serial_no is empty')
  }

  const db = getDb()
  const existing = (db.cylinders || []).find(
    (c) => c.serial_no && c.serial_no.trim().toUpperCase() === serialNo
  )
  if (existing) {
    throw new ApiError(409, `Cylinder with serial_no '${serialNo}' already exists`)
  }

  const id = nextId('cylinders')
  const cyl = {
    id,
    serial_no: serialNo,
    cylinder_type: body.cylinder_type || '11.8 kg',
    state: 'Empty',
    owner: body.owner || 'Company',
    customer_id: null,
    created_at: new Date().toISOString(),
  }

  db.cylinders.push(cyl)

  const event = recordEvent({
    type: 'cylinder.registered',
    actor: user.username,
    description: `Registered cylinder ${cyl.serial_no} (${cyl.cylinder_type}, ${cyl.owner})`,
    details: { cylinder_id: cyl.id, serial_no: cyl.serial_no },
  })

  if (!db.cylinder_history) db.cylinder_history = []
  db.cylinder_history.push({
    id: nextId('cylinder_history'),
    cylinder_id: cyl.id,
    txn_type: 'register',
    from_state: null,
    to_state: 'Empty',
    customer_id: null,
    delivery_id: null,
    actor: user.username,
    note: body.note || 'Initial cylinder registration',
    due_date: null,
    created_at: cyl.created_at,
    event_id: event.id,
  })

  saveDb()
  return cyl
}

// Handle POST /cylinders/{id}/transition
export function handleTransitionCylinder(token, id, body) {
  const user = requireAuth(token, ['owner', 'driver', 'manager'])
  if (!body || !body.to_state) {
    throw new ApiError(409, 'to_state is required')
  }

  const toState = body.to_state
  const db = getDb()
  const cyl = (db.cylinders || []).find((c) => c.id === Number(id))
  if (!cyl) {
    throw new ApiError(404, `Cylinder ${id} not found`)
  }

  const fromState = cyl.state
  const allowed = ALLOWED_TRANSITIONS[fromState] || []
  if (!allowed.includes(toState)) {
    throw new ApiError(409, `Invalid transition from ${fromState} to ${toState}`)
  }

  // Stock moves check: Empty -> Filled and Recovered -> Empty are owner-only
  if ((toState === 'Filled' || toState === 'Empty') && user.role !== 'owner') {
    throw new ApiError(403, 'Stock moves (Empty -> Filled, Recovered -> Empty) are owner-only')
  }

  let txnCustId = null
  let txnDueDate = null
  const todayStr = new Date().toISOString().split('T')[0]

  if (toState === 'Delivered') {
    if (body.customer_id === undefined || body.customer_id === null) {
      throw new ApiError(409, 'customer_id is required for Delivered transition')
    }
    const custId = Number(body.customer_id)
    const cust = (db.customers || []).find((c) => c.id === custId)
    if (!cust) {
      throw new ApiError(404, 'customer not found')
    }
    cyl.customer_id = custId
    txnCustId = custId

    // Due date validation
    if (body.due_date) {
      // Past due date rejected with 422
      if (body.due_date < todayStr) {
        throw new ApiError(422, 'Return due date cannot be in the past')
      }
      txnDueDate = body.due_date
    } else {
      const d = new Date()
      d.setDate(d.getDate() + RETURN_DUE_DAYS)
      txnDueDate = d.toISOString().split('T')[0]
    }
  } else if (toState === 'Recovered') {
    const holder = cyl.customer_id
    if (body.customer_id !== undefined && body.customer_id !== null && Number(body.customer_id) !== Number(holder)) {
      throw new ApiError(409, `cylinder is held by customer ${holder}, not ${body.customer_id}`)
    }
    txnCustId = holder
    cyl.customer_id = null
    txnDueDate = null
  } else if (toState === 'Filled' || toState === 'Empty') {
    if (body.customer_id !== undefined && body.customer_id !== null) {
      throw new ApiError(409, `customer_id is not allowed for ${toState} transition`)
    }
    cyl.customer_id = null
    txnCustId = null
    txnDueDate = null
  }

  cyl.state = toState

  const event = recordEvent({
    type: 'cylinder.transition',
    actor: user.username,
    description: `Cylinder ${cyl.serial_no} transitioned from ${fromState} to ${toState}`,
    details: {
      cylinder_id: cyl.id,
      from_state: fromState,
      to_state: toState,
      customer_id: txnCustId,
    },
  })

  if (!db.cylinder_history) db.cylinder_history = []
  db.cylinder_history.push({
    id: nextId('cylinder_history'),
    cylinder_id: cyl.id,
    txn_type: 'transition',
    from_state: fromState,
    to_state: toState,
    customer_id: txnCustId,
    delivery_id: body.delivery_id || null,
    actor: user.username,
    note: body.note || null,
    due_date: txnDueDate,
    created_at: new Date().toISOString(),
    event_id: event.id,
  })

  saveDb()
  return cyl
}

// Handle GET /cylinders/{id}/history
export function handleGetCylinderHistory(token, id) {
  requireAuth(token, ['owner', 'driver', 'manager'])
  const db = getDb()
  const cyl = (db.cylinders || []).find((c) => c.id === Number(id))
  if (!cyl) {
    throw new ApiError(404, `Cylinder ${id} not found`)
  }

  const txns = (db.cylinder_history || [])
    .filter((t) => t.cylinder_id === Number(id))
    .sort((a, b) => a.id - b.id)

  return txns
}

// Handle GET /cylinders/summary (owner-only)
export function handleGetCylinderSummary(token) {
  requireAuth(token, ['owner', 'manager'])
  const db = getDb()
  const cylinders = db.cylinders || []
  const customers = db.customers || []

  const by_state = { Empty: 0, Filled: 0, Delivered: 0, Recovered: 0 }
  const by_owner = { Company: 0, Customer: 0 }

  cylinders.forEach((c) => {
    if (by_state[c.state] !== undefined) by_state[c.state]++
    if (by_owner[c.owner] !== undefined) by_owner[c.owner]++
  })

  // Count held by customers for Delivered cylinders
  const heldCounts = {}
  cylinders.forEach((c) => {
    if (c.state === 'Delivered' && c.customer_id) {
      heldCounts[c.customer_id] = (heldCounts[c.customer_id] || 0) + 1
    }
  })

  const held_by_customers = Object.entries(heldCounts).map(([cidStr, count]) => {
    const cid = Number(cidStr)
    const cust = customers.find((k) => k.id === cid)
    return {
      customer_id: cid,
      name: cust ? cust.name : `Customer #${cid}`,
      cylinders: count,
    }
  }).sort((a, b) => a.customer_id - b.customer_id)

  return {
    by_state,
    by_owner,
    held_by_customers,
  }
}

// Handle GET /recovery/ageing (for Step 7: recovery analysis and swap candidates)
export function handleGetRecoveryAgeing(token) {
  requireAuth(token, ['owner', 'manager'])
  const db = getDb()
  const cylinders = db.cylinders || []
  const customers = db.customers || []
  const history = db.cylinder_history || []

  const deliveredCylinders = cylinders.filter((c) => c.state === 'Delivered' && c.customer_id)
  const now = Date.now()

  // Compute days held for each cylinder
  const items = deliveredCylinders.map((cyl) => {
    const cust = customers.find((k) => k.id === cyl.customer_id)
    // Find latest transition to Delivered
    const lastDelivTxn = [...history]
      .reverse()
      .find((t) => t.cylinder_id === cyl.id && t.to_state === 'Delivered')

    const delivTime = lastDelivTxn ? new Date(lastDelivTxn.created_at).getTime() : new Date(cyl.created_at).getTime()
    const daysHeld = Math.max(0, Math.floor((now - delivTime) / 86400000))
    const dueDate = lastDelivTxn?.due_date || new Date(delivTime + 15 * 86400000).toISOString().split('T')[0]

    let bucket = '0-14'
    if (daysHeld >= 90) bucket = '90+'
    else if (daysHeld >= 60) bucket = '60-89'
    else if (daysHeld >= 30) bucket = '30-59'
    else if (daysHeld >= 15) bucket = '15-29'

    return {
      cylinder_id: cyl.id,
      serial_no: cyl.serial_no,
      cylinder_type: cyl.cylinder_type,
      owner: cyl.owner,
      customer_id: cyl.customer_id,
      customer_name: cust ? cust.name : `Customer #${cyl.customer_id}`,
      customer_code: cust?.code || `C${String(cyl.customer_id).padStart(4, '0')}`,
      customer_area: cust?.area || '—',
      customer_phone: cust?.phone || '—',
      delivered_at: new Date(delivTime).toISOString(),
      days_held: daysHeld,
      due_date: dueDate,
      is_overdue: daysHeld > 15,
      is_swap_candidate: daysHeld >= 15,
      deposit_pkr: cust?.deposit || 6000,
      bucket,
    }
  })

  // Ageing buckets summary
  const buckets = {
    '0-14': 0,
    '15-29': 0,
    '30-59': 0,
    '60-89': 0,
    '90+': 0,
  }

  items.forEach((item) => {
    if (buckets[item.bucket] !== undefined) {
      buckets[item.bucket]++
    }
  })

  // Customer grouped summary
  const customerMap = {}
  items.forEach((item) => {
    if (!customerMap[item.customer_id]) {
      customerMap[item.customer_id] = {
        customer_id: item.customer_id,
        name: item.customer_name,
        code: item.customer_code,
        area: item.customer_area,
        phone: item.customer_phone,
        deposit_pkr: item.deposit_pkr,
        pending_empties: 0,
        max_days_held: 0,
        cylinders: [],
        has_swap_candidates: false,
      }
    }
    const cData = customerMap[item.customer_id]
    cData.pending_empties++
    cData.cylinders.push(item)
    if (item.days_held > cData.max_days_held) {
      cData.max_days_held = item.days_held
    }
    if (item.is_swap_candidate) {
      cData.has_swap_candidates = true
    }
  })

  const customerSummaries = Object.values(customerMap).sort(
    (a, b) => b.max_days_held - a.max_days_held
  )

  const swapCandidates = items
    .filter((item) => item.is_swap_candidate)
    .sort((a, b) => b.days_held - a.days_held)

  return {
    total_delivered: items.length,
    buckets,
    cylinders: items.sort((a, b) => b.days_held - a.days_held),
    customers: customerSummaries,
    swap_candidates: swapCandidates,
  }
}
