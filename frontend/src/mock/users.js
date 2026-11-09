import { ApiError } from '../api.js'
import { requireAuth } from './auth.js'
import { getDb, nextId, recordEvent, saveDb } from './db.js'

// Available system modules for per-module permissions
export const SYSTEM_MODULES = [
  { id: 'dispatch', label: 'Dispatch & Routes' },
  { id: 'customers', label: 'Customer Directory' },
  { id: 'cylinders', label: 'Cylinder Register' },
  { id: 'billing', label: 'Billing & Invoices' },
  { id: 'stock', label: 'Stock & Purchases' },
  { id: 'expenses', label: 'Operating Expenses' },
  { id: 'reports', label: 'Executive Reports' },
  { id: 'admin', label: 'Admin & Settings' },
]

// Default module permissions assigned per role
export function getDefaultPermissions(role) {
  switch (role) {
    case 'owner':
      return ['dispatch', 'customers', 'cylinders', 'billing', 'stock', 'expenses', 'reports', 'admin']
    case 'manager':
      return ['customers', 'billing', 'stock', 'expenses']
    case 'driver':
      return ['dispatch']
    case 'customer':
      return ['billing']
    case 'ceo':
      return ['reports', 'admin']
    default:
      return ['customers']
  }
}

// Handle GET /users
export function handleGetUsers(token) {
  requireAuth(token, ['owner'])
  const db = getDb()
  return (db.users || []).map((u) => ({
    id: u.id,
    username: u.username,
    role: u.role,
    name: u.name || u.username,
    is_active: u.is_active !== undefined ? Boolean(u.is_active) : true,
    permissions: Array.isArray(u.permissions) ? u.permissions : getDefaultPermissions(u.role),
    created_at: u.created_at || '2026-01-01T00:00:00Z',
  }))
}

// Handle POST /users
export function handleCreateUser(token, body) {
  const admin = requireAuth(token, ['owner'])
  if (!body || !body.username || !body.password) {
    throw new ApiError(422, 'Username and password are required')
  }

  const username = body.username.trim()
  if (username.length < 3) {
    throw new ApiError(422, 'Username must be at least 3 characters long')
  }

  const password = String(body.password)
  if (password.length < 8) {
    throw new ApiError(422, 'Password must be at least 8 characters long')
  }

  const db = getDb()
  if ((db.users || []).some((u) => u.username.toLowerCase() === username.toLowerCase())) {
    throw new ApiError(409, `User with username "${username}" already exists`)
  }

  const role = body.role || 'driver'
  const allowedRoles = ['owner', 'manager', 'driver', 'customer', 'ceo']
  if (!allowedRoles.includes(role)) {
    throw new ApiError(422, `Invalid role. Must be one of: ${allowedRoles.join(', ')}`)
  }

  const user = {
    id: nextId('users'),
    username,
    name: body.name ? body.name.trim() : username,
    role,
    is_active: body.is_active !== undefined ? Boolean(body.is_active) : true,
    permissions: Array.isArray(body.permissions) && body.permissions.length > 0
      ? body.permissions
      : getDefaultPermissions(role),
    created_at: new Date().toISOString(),
  }

  if (!db.users) db.users = []
  db.users.push(user)

  recordEvent({
    type: 'user.created',
    actor: admin.username,
    description: `Created new ${role} account: ${username}`,
    details: { id: user.id, username, role, is_active: user.is_active, permissions: user.permissions },
  })
  saveDb()

  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    is_active: user.is_active,
    permissions: user.permissions,
    created_at: user.created_at,
  }
}

// Handle PATCH /users/:id (mock-only: active switch and per-module permissions)
export function handleUpdateUser(token, id, body) {
  const admin = requireAuth(token, ['owner'])
  const db = getDb()
  const user = (db.users || []).find((u) => u.id === Number(id))
  if (!user) {
    throw new ApiError(404, `User #${id} not found`)
  }

  if (body.is_active !== undefined) {
    user.is_active = Boolean(body.is_active)
  }

  if (Array.isArray(body.permissions)) {
    user.permissions = body.permissions
  }

  if (body.role !== undefined) {
    user.role = body.role
  }

  if (body.name !== undefined) {
    user.name = String(body.name).trim()
  }

  recordEvent({
    type: 'user.updated',
    actor: admin.username,
    description: `Updated access permissions for user: ${user.username}`,
    details: { id: user.id, is_active: user.is_active, permissions: user.permissions },
  })
  saveDb()

  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    is_active: user.is_active,
    permissions: user.permissions,
    created_at: user.created_at,
  }
}
