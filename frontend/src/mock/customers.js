import { ApiError } from '../api.js'
import { requireAuth } from './auth.js'
import { computeCustomerLedgerWithBalances } from './billing.js'
import { getDb, nextId, recordEvent, saveDb } from './db.js'

// Helper to robustly find customer by ID (number, string, or code)
function findCustomer(customers, id) {
  if (id === null || id === undefined || !customers) return null
  const strId = String(id).trim()
  const numId = Number(strId)
  return customers.find(
    (c) =>
      (!isNaN(numId) && c.id === numId) ||
      String(c.id) === strId ||
      (c.code && c.code.toLowerCase() === strId.toLowerCase())
  )
}

// Handle GET /customers (returns all customers with is_active)
export function handleGetCustomers(token) {
  requireAuth(token, ['owner', 'manager'])
  const db = getDb()
  return db.customers || []
}

// Handle GET /customers/{id}
export function handleGetCustomer(token, id) {
  requireAuth(token, ['owner', 'manager'])
  const db = getDb()
  const customer = findCustomer(db.customers, id)
  if (!customer) {
    throw new ApiError(404, 'Customer not found')
  }
  return customer
}

// Handle POST /customers
export function handleCreateCustomer(token, body) {
  const user = requireAuth(token, ['owner'])
  if (!body || !body.name || !body.phone) {
    throw new ApiError(422, 'Customer name and phone number are required')
  }

  const db = getDb()
  const id = nextId('customers')
  const customer = {
    id,
    code: body.code || `C${String(id).padStart(4, '0')}`,
    name: body.name.trim(),
    phone: body.phone.trim(),
    address: body.address ? body.address.trim() : '',
    area: body.area ? body.area.trim() : '',
    lat: body.lat !== undefined && body.lat !== null ? Number(body.lat) : 31.4181,
    lon: body.lon !== undefined && body.lon !== null ? Number(body.lon) : 73.0776,
    demand: body.demand !== undefined && body.demand !== null ? Math.max(1, Math.min(10, Number(body.demand))) : 1,
    customer_type: body.customer_type || 'domestic',
    cylinder_type: body.cylinder_type || '11.8 kg',
    deposit: body.deposit !== undefined && body.deposit !== null ? Number(body.deposit) : 0,
    notes: body.notes ? body.notes.trim() : '',
    is_active: body.is_active !== undefined ? Boolean(body.is_active) : true,
    created_at: body.created_at || new Date().toISOString(),
  }

  db.customers.push(customer)
  recordEvent({
    type: 'customer_created',
    actor: user.username,
    description: `Added customer ${customer.name}`,
    details: { id: customer.id, phone: customer.phone, code: customer.code },
  })
  saveDb()
  return customer
}

// Handle PUT /customers/{id} (partial update; explicit null rejected with 422 for name, lat, lon, demand, is_active)
export function handleUpdateCustomer(token, id, body) {
  const user = requireAuth(token, ['owner'])
  if (!body || typeof body !== 'object') {
    throw new ApiError(422, 'Invalid request body')
  }

  const db = getDb()
  const customer = findCustomer(db.customers, id)
  if (!customer) {
    throw new ApiError(404, 'Customer not found')
  }

  // Explicit null check for required core fields
  const notNullable = ['name', 'lat', 'lon', 'demand', 'is_active']
  for (const field of notNullable) {
    if (body[field] === null) {
      throw new ApiError(422, `Field '${field}' cannot be null`)
    }
  }

  // Partial update
  if (body.name !== undefined) {
    const trimmed = String(body.name).trim()
    if (!trimmed) throw new ApiError(422, 'Customer name cannot be empty')
    customer.name = trimmed
  }
  if (body.phone !== undefined) customer.phone = String(body.phone).trim()
  if (body.address !== undefined) customer.address = String(body.address || '').trim()
  if (body.area !== undefined) customer.area = String(body.area || '').trim()
  if (body.lat !== undefined) customer.lat = Number(body.lat)
  if (body.lon !== undefined) customer.lon = Number(body.lon)
  if (body.demand !== undefined) customer.demand = Math.max(1, Math.min(10, Number(body.demand)))
  if (body.customer_type !== undefined) customer.customer_type = body.customer_type
  if (body.cylinder_type !== undefined) customer.cylinder_type = body.cylinder_type
  if (body.deposit !== undefined) customer.deposit = Number(body.deposit)
  if (body.notes !== undefined) customer.notes = String(body.notes || '').trim()
  if (body.code !== undefined) customer.code = String(body.code).trim()
  if (body.is_active !== undefined) {
    const wasActive = customer.is_active
    customer.is_active = Boolean(body.is_active)
    if (!wasActive && customer.is_active) {
      recordEvent({
        type: 'customer_reactivated',
        actor: user.username,
        description: `Reactivated customer ${customer.name}`,
        details: { id: customer.id, name: customer.name },
      })
    }
  }

  recordEvent({
    type: 'customer_updated',
    actor: user.username,
    description: `Updated customer ${customer.name}`,
    details: { id: customer.id, changes: body },
  })
  saveDb()
  return customer
}

// Handle DELETE /customers/{id} (soft delete: is_active=false, row stays, deleting twice is fine and writes no second event)
export function handleDeleteCustomer(token, id) {
  const user = requireAuth(token, ['owner'])
  const db = getDb()
  const customer = findCustomer(db.customers, id)
  if (!customer) {
    throw new ApiError(404, 'Customer not found')
  }

  if (customer.is_active !== false) {
    customer.is_active = false
    recordEvent({
      type: 'customer_deactivated',
      actor: user.username,
      description: `Deactivated customer ${customer.name}`,
      details: { id: customer.id, name: customer.name },
    })
    saveDb()
  }

  return { status: 'ok', id: customer.id, is_active: false }
}

// Generate realistic mock data for customer cylinders
export function handleGetCustomerCylinders(token, customerId) {
  requireAuth(token)
  const db = getDb()
  const customer = findCustomer(db.customers, customerId)
  if (!customer) throw new ApiError(404, 'Customer not found')

  const realHeld = (db.cylinders || []).filter(
    (c) => c.customer_id === customer.id || String(c.customer_id) === String(customer.id)
  )

  if (realHeld.length > 0) {
    return realHeld.map((cyl, i) => ({
      id: cyl.id,
      serial_number: cyl.serial_no || `GAS-CYL-${cyl.id}`,
      serial_no: cyl.serial_no || `GAS-CYL-${cyl.id}`,
      customer_id: customer.id,
      customer_name: customer.name,
      cylinder_type: cyl.cylinder_type || customer.cylinder_type,
      status: 'with_customer',
      delivered_at: cyl.created_at || new Date(Date.now() - (i * 3 + 2) * 86400000).toISOString(),
      days_held: Math.max(1, Math.floor((Date.now() - new Date(cyl.created_at || Date.now()).getTime()) / 86400000)),
      tare_weight_kg: cyl.cylinder_type === '45.4 kg' ? 44.2 : cyl.cylinder_type === '15 kg' ? 16.5 : 13.2,
      last_inspected: '2025-11-15T00:00:00Z',
    }))
  }

  const count = Math.max(1, customer.demand || 1)
  const cylinders = []
  for (let i = 1; i <= count; i++) {
    const sNo = `GAS-${(customer.cylinder_type || '11.8 kg').replace(/[^0-9]/g, '') || '11'}-${String(customer.id).padStart(3, '0')}${i}`
    cylinders.push({
      id: customer.id * 100 + i,
      serial_number: sNo,
      serial_no: sNo,
      customer_id: customer.id,
      customer_name: customer.name,
      cylinder_type: customer.cylinder_type || '11.8 kg',
      status: 'with_customer',
      delivered_at: new Date(Date.now() - (i * 3 + 2) * 86400000).toISOString(),
      days_held: i * 3 + 2,
      tare_weight_kg: customer.cylinder_type === '45.4 kg' ? 44.2 : customer.cylinder_type === '15 kg' ? 16.5 : 13.2,
      last_inspected: '2025-11-15T00:00:00Z',
    })
  }
  return cylinders
}

// Generate realistic mock ledger for customer
export function handleGetCustomerLedger(token, customerId) {
  requireAuth(token)
  const db = getDb()
  const customer = findCustomer(db.customers, customerId)
  if (!customer) throw new ApiError(404, 'Customer not found')

  const entries = computeCustomerLedgerWithBalances(customer.id)
  if (entries.length > 0) {
    return entries
  }

  return [
    {
      id: 1,
      customer_id: customer.id,
      entry_type: 'deposit',
      description: `Security deposit held for ${customer.cylinder_type} cylinders`,
      debit: 0,
      credit: customer.deposit || 6000,
      balance: -(customer.deposit || 6000),
      created_at: customer.created_at || '2026-01-02T10:00:00Z',
    },
  ]
}

// Generate realistic mock deliveries for customer
export function handleGetCustomerDeliveries(token, customerId) {
  requireAuth(token)
  const db = getDb()
  const customer = findCustomer(db.customers, customerId)
  if (!customer) throw new ApiError(404, 'Customer not found')

  const qty = customer.demand || 1
  return [
    {
      id: customer.id * 10 + 1,
      customer_id: customer.id,
      route_id: 101,
      driver_name: 'Muhammad Tariq',
      vehicle_no: 'FD-8921',
      cylinder_type: customer.cylinder_type,
      cylinders_delivered: qty,
      cylinders_collected: qty,
      delivered_at: '2026-01-15T11:25:00Z',
      interval_days: 14,
      status: 'delivered',
      notes: 'Delivered and verified leak test passed',
    },
    {
      id: Number(customerId) * 10 + 2,
      customer_id: Number(customerId),
      route_id: 108,
      driver_name: 'Muhammad Tariq',
      vehicle_no: 'FD-8921',
      cylinder_type: customer.cylinder_type,
      cylinders_delivered: qty,
      cylinders_collected: qty,
      delivered_at: '2026-02-01T14:10:00Z',
      interval_days: 17,
      status: 'delivered',
      notes: 'Received by customer in person',
    },
    {
      id: Number(customerId) * 10 + 3,
      customer_id: Number(customerId),
      route_id: 114,
      driver_name: 'Zahid Ali',
      vehicle_no: 'FD-4412',
      cylinder_type: customer.cylinder_type,
      cylinders_delivered: qty,
      cylinders_collected: qty,
      delivered_at: '2026-02-16T10:45:00Z',
      interval_days: 15,
      status: 'delivered',
      notes: 'Regular scheduled refill',
    },
    {
      id: Number(customerId) * 10 + 4,
      customer_id: Number(customerId),
      route_id: 122,
      driver_name: 'Muhammad Tariq',
      vehicle_no: 'FD-8921',
      cylinder_type: customer.cylinder_type,
      cylinders_delivered: qty,
      cylinders_collected: qty,
      delivered_at: '2026-03-02T13:30:00Z',
      interval_days: 14,
      status: 'delivered',
      notes: 'Delivered promptly',
    },
  ]
}
