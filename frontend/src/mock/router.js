import { ApiError } from '../api.js'
import { handleLogin, handleMe } from './auth.js'
import {
  handleCreateCustomer,
  handleDeleteCustomer,
  handleGetCustomer,
  handleGetCustomerCylinders,
  handleGetCustomerDeliveries,
  handleGetCustomerLedger,
  handleGetCustomers,
  handleUpdateCustomer,
} from './customers.js'
import {
  handleCreateCylinder,
  handleGetCylinder,
  handleGetCylinderHistory,
  handleGetCylinders,
  handleGetCylinderSummary,
  handleGetRecoveryAgeing,
  handleTransitionCylinder,
} from './cylinders.js'
import { handleCreateUser, handleGetUsers } from './users.js'

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

  // Cylinder summary (must be before :id match)
  if (method === 'GET' && normalizedPath === '/cylinders/summary') {
    return handleGetCylinderSummary(token)
  }

  // Empty recovery ageing endpoint (mock-only)
  if (method === 'GET' && normalizedPath === '/recovery/ageing') {
    return handleGetRecoveryAgeing(token)
  }

  // Cylinder history endpoint
  const cylinderHistoryMatch = normalizedPath.match(/^\/cylinders\/(\d+)\/history$/)
  if (cylinderHistoryMatch) {
    const cylinderId = parseInt(cylinderHistoryMatch[1], 10)
    if (method === 'GET') {
      return handleGetCylinderHistory(token, cylinderId)
    }
  }

  // Cylinder transition endpoint
  const cylinderTransitionMatch = normalizedPath.match(/^\/cylinders\/(\d+)\/transition$/)
  if (cylinderTransitionMatch) {
    const cylinderId = parseInt(cylinderTransitionMatch[1], 10)
    if (method === 'POST') {
      return handleTransitionCylinder(token, cylinderId, body)
    }
  }

  // Cylinder collection endpoints (GET /cylinders, POST /cylinders)
  if (normalizedPath === '/cylinders') {
    if (method === 'GET') {
      return handleGetCylinders(token, queryParams)
    }
    if (method === 'POST') {
      return handleCreateCylinder(token, body)
    }
  }

  // Single cylinder endpoint (GET /cylinders/:id)
  const cylinderIdMatch = normalizedPath.match(/^\/cylinders\/(\d+)$/)
  if (cylinderIdMatch) {
    const cylinderId = parseInt(cylinderIdMatch[1], 10)
    if (method === 'GET') {
      return handleGetCylinder(token, cylinderId)
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
