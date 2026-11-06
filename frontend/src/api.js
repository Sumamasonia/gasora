import { USE_MOCK } from './config'
import { mockRequest } from './mock/router'

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

export const login = (username, password) =>
  request('/auth/login', { method: 'POST', body: { username, password } })
export const getCustomers = (token) => request('/customers', { token })
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
