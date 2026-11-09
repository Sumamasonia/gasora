import { USE_MOCK } from './config.js'
import { mockRequest } from './mock/router.js'

const BASE = '/api'

let unauthorizedHandler = null

export function setOnUnauthorized(handler) {
  unauthorizedHandler = handler
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

async function request(path, { token, method = 'GET', body } = {}) {
  if (USE_MOCK) {
    try {
      return await mockRequest(path, { token, method, body })
    } catch (err) {
      if (err && err.status === 401 && unauthorizedHandler) {
        unauthorizedHandler()
      }
      throw err
    }
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
    if (res.status === 401 && unauthorizedHandler) {
      unauthorizedHandler()
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
export const createUser = (token, data) => request('/users', { token, method: 'POST', body: data })
export const updateUser = (token, id, data) => request(`/users/${id}`, { token, method: 'PATCH', body: data })
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
export const deliverStop = (token, stopId, data = {}) =>
  request(`/route-stops/${stopId}/deliver`, { token, method: 'POST', body: data })
export const skipStop = (token, stopId, reason) =>
  request(`/route-stops/${stopId}/skip`, { token, method: 'POST', body: { reason } })

// Sales, Billing, Payments & Ledger (Phase F5)
export const recordSale = (token, data) =>
  request('/sales', { token, method: 'POST', body: data })

export const getBills = (token, params = {}) => {
  let query = ''
  if (params) {
    const q = new URLSearchParams()
    if (params.customer_id) q.set('customer_id', params.customer_id)
    if (params.status) q.set('status', params.status)
    if (params.month) q.set('month', params.month)
    const qs = q.toString()
    if (qs) query = `?${qs}`
  }
  return request(`/bills${query}`, { token })
}

export const getBill = (token, id) =>
  request(`/bills/${id}`, { token })

export const createBill = (token, data) =>
  request('/bills', { token, method: 'POST', body: data })

export const getPayments = (token, params = {}) => {
  let query = ''
  if (params) {
    const q = new URLSearchParams()
    if (params.customer_id) q.set('customer_id', params.customer_id)
    if (params.bill_id) q.set('bill_id', params.bill_id)
    const qs = q.toString()
    if (qs) query = `?${qs}`
  }
  return request(`/payments${query}`, { token })
}

export const recordPayment = (token, data) =>
  request('/payments', { token, method: 'POST', body: data })

export const getLedger = (token, params = {}) => {
  let query = ''
  if (params) {
    const q = new URLSearchParams()
    if (params.customer_id) q.set('customer_id', params.customer_id)
    if (params.entry_type) q.set('entry_type', params.entry_type)
    const qs = q.toString()
    if (qs) query = `?${qs}`
  }
  return request(`/ledger${query}`, { token })
}

export const createLedgerCorrection = (token, data) =>
  request('/ledger/correction', { token, method: 'POST', body: data })

export const getLoans = (token, params = {}) => {
  let query = ''
  if (params) {
    const q = new URLSearchParams()
    if (params.include_all) q.set('include_all', params.include_all)
    const qs = q.toString()
    if (qs) query = `?${qs}`
  }
  return request(`/billing/loans${query}`, { token })
}

export const getCustomerStatement = (token, customerId) =>
  request(`/billing/statements/${customerId}`, { token })

// Stock & Purchases (Phase F6 - Module 12)
export const getStockSummary = (token) =>
  request('/stock/summary', { token })

export const getStockMovements = (token) =>
  request('/stock/movements', { token })

export const getPurchases = (token, params = {}) => {
  let query = ''
  if (params) {
    const q = new URLSearchParams()
    if (params.vendor) q.set('vendor', params.vendor)
    if (params.cylinder_type) q.set('cylinder_type', params.cylinder_type)
    if (params.verified) q.set('verified', params.verified)
    if (params.month) q.set('month', params.month)
    const qs = q.toString()
    if (qs) query = `?${qs}`
  }
  return request(`/stock/purchases${query}`, { token })
}

export const createPurchase = (token, data) =>
  request('/stock/purchases', { token, method: 'POST', body: data })

export const updatePurchase = (token, id, data) =>
  request(`/stock/purchases/${id}`, { token, method: 'PUT', body: data })

export const verifyPurchase = (token, id) =>
  request(`/stock/purchases/${id}/verify`, { token, method: 'POST' })

// Operating Expenses (Phase F6 - Module 16)
export const getExpenses = (token, params = {}) => {
  let query = ''
  if (params) {
    const q = new URLSearchParams()
    if (params.category) q.set('category', params.category)
    if (params.month) q.set('month', params.month)
    if (params.date) q.set('date', params.date)
    const qs = q.toString()
    if (qs) query = `?${qs}`
  }
  return request(`/expenses${query}`, { token })
}

export const createExpense = (token, data) =>
  request('/expenses', { token, method: 'POST', body: data })

export const getFuelEstimate = (token) =>
  request('/expenses/fuel-estimate', { token })

// Stock Settings
export const getStockSettings = (token) =>
  request('/settings/stock', { token })

export const updateStockSettings = (token, data) =>
  request('/settings/stock', { token, method: 'PUT', body: data })

// Dashboard & Evaluation (Phase F7 - Modules 10, 17)
export const getDashboardSummary = (token) =>
  request('/dashboard/summary', { token })

export const getReportData = (token, reportType, params = {}) => {
  let query = ''
  if (params) {
    const q = new URLSearchParams()
    if (params.from_date) q.set('from_date', params.from_date)
    if (params.to_date) q.set('to_date', params.to_date)
    if (params.search) q.set('search', params.search)
    const qs = q.toString()
    if (qs) query = `?${qs}`
  }
  return request(`/reports/${reportType}${query}`, { token })
}

export const getEvaluationResults = (token) =>
  request('/evaluation/results', { token })
// Customer Role Endpoints (Phase F8 - Module 18)
export const getMyOrders = (token) => request('/me/orders', { token })
export const getMyBills = (token) => request('/me/bills', { token })
export const getMyBalance = (token) => request('/me/balance', { token })
export const getMyNextDelivery = (token) => request('/me/next-delivery', { token })
export const getMyDeliveryStatus = (token) => request('/me/delivery-status', { token })
export const createMyRequest = (token, data) =>
  request('/me/requests', { token, method: 'POST', body: data })

// Admin & Audit Endpoints (Phase F9)
export const getAuditEvents = (token) => request('/audit/events', { token })
export const verifyAudit = (token) => request('/audit/verify', { token })
export const getSettings = (token) => request('/settings', { token })
export const updateSettings = (token, data) =>
  request('/settings', { token, method: 'PUT', body: data })
export const getBackup = (token) => request('/settings/backup', { token })
export const restoreBackup = (token, data) =>
  request('/settings/restore', { token, method: 'POST', body: { data } })
export const resetDemoData = (token) =>
  request('/settings/reset', { token, method: 'POST' })
export const askAssistant = (token, message) =>
  request('/assistant/chat', { token, method: 'POST', body: { message } })

// Daily Notes & Utilities (Phase F9)
export const getNotes = (token, date) =>
  request(`/notes${date ? `?date=${date}` : ''}`, { token })
export const saveNote = (token, data) =>
  request('/notes', { token, method: 'POST', body: data })
export const deleteNote = (token, id) =>
  request(`/notes/${id}`, { token, method: 'DELETE' })
