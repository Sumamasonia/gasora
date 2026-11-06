import { ApiError } from '../api.js'
import { DEMO_CREDENTIALS, requireAuth } from './auth.js'
import { getDb, nextId, recordEvent, saveDb } from './db.js'

// Handle GET /users
export function handleGetUsers(token) {
  requireAuth(token, ['owner'])
  const db = getDb()
  return (db.users || []).map((u) => ({
    id: u.id,
    username: u.username,
    role: u.role,
    created_at: u.created_at,
  }))
}

// Handle POST /users
export function handleCreateUser(token, body) {
  const admin = requireAuth(token, ['owner'])
  if (!body || !body.username || !body.password) {
    throw new ApiError(422, 'Username and password are required')
  }

  const username = body.username.trim()
  const db = getDb()

  if ((db.users || []).some((u) => u.username.toLowerCase() === username.toLowerCase())) {
    throw new ApiError(409, `User with username "${username}" already exists`)
  }

  const role = body.role || 'driver'
  const user = {
    id: nextId('users'),
    username,
    role,
    created_at: new Date().toISOString(),
  }

  db.users.push(user)
  recordEvent({
    type: 'user_created',
    actor: admin.username,
    description: `Created new ${role} account: ${username}`,
    details: { id: user.id, username, role },
  })
  saveDb()

  return {
    id: user.id,
    username: user.username,
    role: user.role,
    created_at: user.created_at,
  }
}
