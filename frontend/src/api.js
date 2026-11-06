import { USE_MOCK } from './config.js'
import { mockRequest } from './mock/router.js'

const BASE = '/api'

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

async function request(path, { token, method = 'GET', body } = {}) {
  if (USE_MOCK) {
    return mockRequest(path, { token, method, body })
  }
  const headers = {}
  if (body) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  let res
  try {
    res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined })
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Is the API running on port 8000?')
  }
  if (!res.ok) {
    let detail = res.statusText
    try {
      const j = await res.json()
      detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail)
    } catch {
      /* keep the status text */
    }
    throw new ApiError(res.status, detail)
  }
  return res.json()
}

// Auth
export const login = (username, password) =>
  request('/auth/login', { method: 'POST', body: { username, password } })

// Customers
export const getCustomers = (token) => request('/customers', { token })
export const getCustomer = (token, id) => request(`/customers/${id}`, { token })
export const createCustomer = (token, data) =>
  request('/customers', { token, method: 'POST', body: data })
export const updateCustomer = (token, id, data) =>
  request(`/customers/${id}`, { token, method: 'PUT', body: data })
export const deactivateCustomer = (token, id) =>
  request(`/customers/${id}`, { token, method: 'DELETE' })
export const getCustomerCylinders = (token, customerId) =>
  request(`/cylinders?customer_id=${customerId}`, { token })
export const getCustomerLedger = (token, customerId) =>
  request(`/customers/${customerId}/ledger`, { token })
export const getCustomerDeliveries = (token, customerId) =>
  request(`/customers/${customerId}/deliveries`, { token })

// Cylinders
export const getCylinders = (token, params = {}) => {
  let query = ''
  if (params) {
    const q = new URLSearchParams()
    if (params.state) q.set('state', params.state)
    if (params.owner) q.set('owner', params.owner)
    if (params.customer_id) q.set('customer_id', params.customer_id)
    const qs = q.toString()
    if (qs) query = `?${qs}`
  }
  return request(`/cylinders${query}`, { token })
}
export const createCylinder = (token, data) =>
  request('/cylinders', { token, method: 'POST', body: data })
export const getCylinder = (token, id) => request(`/cylinders/${id}`, { token })
export const getCylinderHistory = (token, id) =>
  request(`/cylinders/${id}/history`, { token })
export const getCylinderSummary = (token) => request('/cylinders/summary', { token })
export const transitionCylinder = (token, id, data) =>
  request(`/cylinders/${id}/transition`, { token, method: 'POST', body: data })
export const getRecoveryAgeing = (token) => request('/recovery/ageing', { token })

// Planning & Dispatch
export const getPlan = (token, seconds) => request(`/plan/today?seconds=${seconds}`, { token })
export const getUsers = (token) => request('/users', { token })
export const getUrgent = (token) => request('/urgent', { token })
export const createUrgent = (token, customer_id, note) =>
  request('/urgent', { token, method: 'POST', body: { customer_id, note: note || null } })
export const publishPlan = (token, seconds) =>
  request('/plan/publish', { token, method: 'POST', body: { seconds } })
export const getPaths = (token, routes) => request('/paths', { token, method: 'POST', body: { routes } })
export const getRoutes = (token) => request('/routes', { token })
export const assignRoute = (token, routeId, username) =>
  request(`/routes/${routeId}/assign`, { token, method: 'PATCH', body: { username } })
export const getMyRoutes = (token) => request('/my-routes', { token })
export const deliverStop = (token, stopId) =>
  request(`/route-stops/${stopId}/deliver`, { token, method: 'POST', body: {} })
export const skipStop = (token, stopId, reason) =>
  request(`/route-stops/${stopId}/skip`, { token, method: 'POST', body: { reason } })
