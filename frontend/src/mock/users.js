import { ApiError } from '../api'
import { DEMO_CREDENTIALS, requireAuth } from './auth'
import { getDb, nextId, recordEvent, saveDb } from './db'

// Handle GET /users
export function handleGetUsers(token) {
  requireAuth(token, ['owner'])
  const db = getDb()
  return (db.users || []).map((u) => ({
    id: u.id,
    username: u.username,
    role: u.role,
    name: u.name || u.username,
  }))
}

// Handle POST /users
export function handleCreateUser(token, body) {
  const actor = requireAuth(token, ['owner'])
  const { username, password, role } = body || {}
  if (!username || !password || !role) {
    throw new ApiError(422, 'Username, password and role are required')
  }

  const db = getDb()
  const exists = db.users.some((u) => u.username.toLowerCase() === username.toLowerCase())
  if (exists) {
    throw new ApiError(409, `Username "${username}" already exists`)
  }

  const user = {
    id: nextId('users'),
    username: username.trim(),
    role,
    name: body.name ? body.name.trim() : username.trim(),
    created_at: new Date().toISOString(),
  }

  db.users.push(user)
  // Also register credentials so user can log in during demo
  DEMO_CREDENTIALS.push({
    username: user.username,
    password: password.trim(),
    role: user.role,
    label: `${user.name} (${user.role})`,
  })

  recordEvent({
    type: 'user_created',
    actor: actor.username,
    description: `Created user ${user.username} with role ${user.role}`,
    details: { id: user.id, username: user.username, role: user.role },
  })
  saveDb()
  return { id: user.id, username: user.username, role: user.role }
}
