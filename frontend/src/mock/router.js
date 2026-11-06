import { ApiError } from '../api'
import { handleLogin, handleMe } from './auth'
import { handleCreateCustomer, handleGetCustomers } from './customers'
import { handleCreateUser, handleGetUsers } from './users'

// Simulate realistic network latency (150 - 400 ms)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const randomLatency = () => delay(150 + Math.floor(Math.random() * 251))

// Main mock router that intercepts API calls in demo mode
export async function mockRequest(path, { token, method = 'GET', body } = {}) {
  await randomLatency()

  const normalizedPath = path.split('?')[0]

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

  // Customer endpoints
  if (method === 'GET' && normalizedPath === '/customers') {
    return handleGetCustomers(token)
  }
  if (method === 'POST' && normalizedPath === '/customers') {
    return handleCreateCustomer(token, body)
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
