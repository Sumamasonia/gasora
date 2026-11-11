import { ApiError } from '../api.js'
import { handleLogin, handleMe } from './auth'
import {
  handleCreateCustomer,
  handleDeleteCustomer,
  handleGetCustomer,
  handleGetCustomerCylinders,
  handleGetCustomerDeliveries,
  handleGetCustomerLedger,
  handleGetCustomers,
  handleUpdateCustomer,
} from './customers'
import { handleCreateUser, handleGetUsers } from './users'

// Simulate realistic network latency (150 - 400 ms)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const randomLatency = () => delay(150 + Math.floor(Math.random() * 251))

// Main mock router that intercepts API calls in demo mode
export async function mockRequest(path, { token, method = 'GET', body } = {}) {
  await randomLatency()

  const [rawPath, queryString] = path.split('?')
  const normalizedPath = rawPath
  const queryParams = new URLSearchParams(queryString || '')

  if (method === 'GET' && normalizedPath === '/health') {
    return { status: 'ok' }
  }

  // Auth endpoints
  if (method === 'POST' && normalizedPath === '/auth/login') {
    return handleLogin(body)
  }
  if (method === 'GET' && normalizedPath === '/auth/me') {
    return handleMe(token)
  }

  // Customer ledger
  const customerLedgerMatch = normalizedPath.match(/^\/customers\/(\d+)\/ledger$/)
  if (customerLedgerMatch) {
    const customerId = parseInt(customerLedgerMatch[1], 10)
    if (method === 'GET') {
      return handleGetCustomerLedger(token, customerId)
    }
  }

  // Customer deliveries
  const customerDeliveriesMatch = normalizedPath.match(/^\/customers\/(\d+)\/deliveries$/)
  if (customerDeliveriesMatch) {
    const customerId = parseInt(customerDeliveriesMatch[1], 10)
    if (method === 'GET') {
      return handleGetCustomerDeliveries(token, customerId)
    }
  }

  // Customer collection endpoints
  if (normalizedPath === '/customers') {
    if (method === 'GET') {
      return handleGetCustomers(token)
    }
    if (method === 'POST') {
      return handleCreateCustomer(token, body)
    }
  }

  // Customer item endpoints
  const customerIdMatch = normalizedPath.match(/^\/customers\/(\d+)$/)
  if (customerIdMatch) {
    const customerId = parseInt(customerIdMatch[1], 10)
    if (method === 'GET') {
      return handleGetCustomer(token, customerId)
    }
    if (method === 'PUT' || method === 'PATCH') {
      return handleUpdateCustomer(token, customerId, body)
    }
    if (method === 'DELETE') {
      return handleDeleteCustomer(token, customerId)
    }
  }

  // Cylinders endpoint (e.g. GET /cylinders?customer_id=1)
  if (normalizedPath === '/cylinders') {
    const customerId = queryParams.get('customer_id')
    if (method === 'GET' && customerId) {
      return handleGetCustomerCylinders(token, customerId)
    }
  }

  // User endpoints
  if (method === 'GET' && normalizedPath === '/users') {
    return handleGetUsers(token)
  }
  if (method === 'POST' && normalizedPath === '/users') {
    return handleCreateUser(token, body)
  }

  throw new ApiError(404, `Mock endpoint not found: ${method} ${path}`)
}
