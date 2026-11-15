const BASE = '/api'

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

async function request(path, { token, method = 'GET', body } = {}) {
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
export const deliverStop = (token, stopId, emptiesCollected, cashReceived) =>
  request(`/route-stops/${stopId}/deliver`, {
    token, method: 'POST',
    body: { empties_collected: emptiesCollected, ...(cashReceived > 0 ? { cash_received: cashReceived } : {}) },
  })
export const getEmpties = (token) => request('/empties', { token })
export const skipStop = (token, stopId, reason) =>
  request(`/route-stops/${stopId}/skip`, { token, method: 'POST', body: { reason } })

// customers
export const createCustomer = (token, body) => request('/customers', { token, method: 'POST', body })
export const updateCustomer = (token, id, body) => request(`/customers/${id}`, { token, method: 'PUT', body })

// cylinder register
export const getCylinders = (token, state) =>
  request(`/cylinders${state ? `?state=${encodeURIComponent(state)}` : ''}`, { token })
export const getCylinderSummary = (token) => request('/cylinders/summary', { token })
export const createCylinder = (token, body) => request('/cylinders', { token, method: 'POST', body })
export const getCylinderHistory = (token, id) => request(`/cylinders/${id}/history`, { token })
export const transitionCylinder = (token, id, body) =>
  request(`/cylinders/${id}/transition`, { token, method: 'POST', body })

// audit
export const getAuditEvents = (token, limit = 50) => request(`/audit/events?limit=${limit}`, { token })
export const verifyAudit = (token) => request('/audit/verify', { token })

// money
export const getPrice = (token) => request('/settings/price', { token })
export const setPrice = (token, unit_price) => request('/settings/price', { token, method: 'PUT', body: { unit_price } })
export const getReceivables = (token) => request('/receivables', { token })
export const getLedger = (token, customerId) => request(`/ledger/${customerId}`, { token })
export const postPayment = (token, customer_id, amount, note) =>
  request('/payments', { token, method: 'POST', body: { customer_id, amount, note: note || null } })
export const postAdjustment = (token, customer_id, amount, note) =>
  request('/ledger/adjust', { token, method: 'POST', body: { customer_id, amount, note } })

// The invoice PDF needs the login token, so it is fetched and saved as a file instead of opened as a link.
export async function downloadInvoice(token, invoiceId, number) {
  let res
  try {
    res = await fetch(`${BASE}/invoices/${invoiceId}/pdf`, { headers: { Authorization: `Bearer ${token}` } })
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Is the API running on port 8000?')
  }
  if (!res.ok) {
    let detail = res.statusText
    try { detail = (await res.json()).detail || detail } catch { /* keep the status text */ }
    throw new ApiError(res.status, detail)
  }
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = `${number}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// stock and expenses
export const getStock = (token) => request('/stock', { token })
export const postPurchase = (token, body) => request('/stock/purchase', { token, method: 'POST', body })
export const postStockAdjust = (token, quantity, note) =>
  request('/stock/adjust', { token, method: 'POST', body: { quantity, note } })
export const putLowStock = (token, threshold) =>
  request('/settings/low-stock', { token, method: 'PUT', body: { threshold } })
export const getExpenses = (token, start, end) => {
  const q = [start && `start=${start}`, end && `end=${end}`].filter(Boolean).join('&')
  return request(`/expenses${q ? `?${q}` : ''}`, { token })
}
export const postExpense = (token, body) => request('/expenses', { token, method: 'POST', body })
