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
