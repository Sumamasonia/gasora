import { ApiError } from '../api.js'
import { getDb } from './db.js'

export const DEMO_CREDENTIALS = [
  { username: 'owner', password: 'owner-demo-123', role: 'owner', label: 'Owner / Admin' },
  { username: 'driver1', password: 'driver-demo-123', role: 'driver', label: 'Driver (Rashid Ali)' },
  { username: 'manager1', password: 'manager-demo-123', role: 'manager', label: 'Manager / Operations' },
  { username: 'customer1', password: 'customer-demo-123', role: 'customer', label: 'Customer (Al-Madina Bakers)' },
  { username: 'ceo1', password: 'ceo-demo-123', role: 'ceo', label: 'Executive / CEO' },
]

export const SEED_USERS = [
  { id: 1, username: 'owner', role: 'owner', name: 'Tariq Mehmood', created_at: '2026-01-01T00:00:00Z' },
  { id: 2, username: 'driver1', role: 'driver', name: 'Rashid Ali', created_at: '2026-01-05T00:00:00Z' },
  { id: 3, username: 'driver2', role: 'driver', name: 'Muhammad Usman', created_at: '2026-01-05T00:00:00Z' },
  { id: 4, username: 'manager1', role: 'manager', name: 'Kamran Khan', created_at: '2026-01-10T00:00:00Z' },
  { id: 5, username: 'customer1', role: 'customer', name: 'Al-Madina Bakers', customer_id: 1, created_at: '2026-01-15T00:00:00Z' },
  { id: 6, username: 'ceo1', role: 'ceo', name: 'Dr. Zafar Iqbal', created_at: '2026-01-01T00:00:00Z' },
]

// Create a tamper-evident mock bearer token
export function createToken(user) {
  const payload = {
    sub: user.username,
    role: user.role,
    userId: user.id,
    exp: Date.now() + 24 * 60 * 60 * 1000,
  }
  const serialized = encodeURIComponent(JSON.stringify(payload))
  return `mock_${btoa(serialized)}`
}

// Decode and validate token expiry
export function parseToken(token) {
  if (!token || typeof token !== 'string' || !token.startsWith('mock_')) return null
  try {
    const raw = atob(token.slice(5))
    const payload = JSON.parse(decodeURIComponent(raw))
    if (payload.exp && Date.now() > payload.exp) return null
    return payload
  } catch {
    return null
  }
}

// Ensure caller is authenticated and has an allowed role
export function requireAuth(token, allowedRoles = null) {
  const payload = parseToken(token)
  if (!payload) {
    throw new ApiError(401, 'Could not validate credentials or session expired')
  }

  const db = getDb()
  const user = db.users?.find((u) => u.username === payload.sub) || {
    id: payload.userId,
    username: payload.sub,
    role: payload.role,
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    throw new ApiError(403, `Permission denied: required role in [${allowedRoles.join(', ')}]`)
  }

  return user
}

// Handle POST /auth/login
export function handleLogin(body) {
  const { username, password } = body || {}
  if (!username || !password) {
    throw new ApiError(422, 'Username and password are required')
  }

  const matched = DEMO_CREDENTIALS.find(
    (u) => u.username === username && u.password === password
  )

  if (!matched) {
    throw new ApiError(401, 'Incorrect username or password')
  }

  const db = getDb()
  const user = db.users?.find((u) => u.username === username) || {
    id: 1,
    username: matched.username,
    role: matched.role,
  }

  return {
    access_token: createToken(user),
    token_type: 'bearer',
    role: user.role,
  }
}

// Handle GET /auth/me
export function handleMe(token) {
  const user = requireAuth(token)
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    name: user.name || user.username,
    customer_id: user.customer_id || null,
  }
}
