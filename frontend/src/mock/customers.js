import { ApiError } from '../api'
import { requireAuth } from './auth'
import { getDb, nextId, recordEvent, saveDb } from './db'

// Handle GET /customers
export function handleGetCustomers(token) {
  requireAuth(token)
  const db = getDb()
  return (db.customers || []).filter((c) => c.is_active !== false)
}

// Handle POST /customers
export function handleCreateCustomer(token, body) {
  const user = requireAuth(token, ['owner', 'manager'])
  if (!body || !body.name || !body.phone) {
    throw new ApiError(422, 'Customer name and phone number are required')
  }

  const db = getDb()
  const customer = {
    id: nextId('customers'),
    name: body.name.trim(),
    phone: body.phone.trim(),
    address: body.address ? body.address.trim() : '',
    lat: body.lat !== undefined ? Number(body.lat) : 31.4181,
    lon: body.lon !== undefined ? Number(body.lon) : 73.0776,
    demand: body.demand ? Number(body.demand) : 1,
    customer_type: body.customer_type || 'domestic',
    cylinder_type: body.cylinder_type || '11.8 kg',
    is_active: true,
    created_at: new Date().toISOString(),
  }

  db.customers.push(customer)
  recordEvent({
    type: 'customer_created',
    actor: user.username,
    description: `Added customer ${customer.name}`,
    details: { id: customer.id, phone: customer.phone },
  })
  saveDb()
  return customer
}
