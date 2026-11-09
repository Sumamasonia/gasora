// Mock handlers for Settings, Backup, Restore, and Demo Reset
import { requireAuth } from './auth.js'
import { getDb, recordEvent, resetDb, saveDb } from './db.js'

export const DEFAULT_SETTINGS = {
  overdue_days: 15,
  alert_days: 5,
  currency: 'PKR',
  business_name: 'Gasora LPG Distribution',
  business_address: 'Main Depot, Sheikhupura Road, Faisalabad',
  low_stock_level: 25,
  theme: 'light',
  simulate_tampered_audit: false,
  depot: { lat: 31.4181, lon: 73.0776, name: 'Main Depot Faisalabad' },
}

export function handleGetSettings(token) {
  requireAuth(token, ['owner', 'manager', 'ceo'])
  const db = getDb()
  return {
    status: 200,
    data: {
      ...DEFAULT_SETTINGS,
      ...(db.settings || {}),
    },
  }
}

export function handleUpdateSettings(token, body) {
  const user = requireAuth(token, ['owner', 'manager'])
  const db = getDb()
  db.settings = {
    ...DEFAULT_SETTINGS,
    ...(db.settings || {}),
    ...(body || {}),
  }
  saveDb()

  recordEvent({
    type: 'SETTINGS_UPDATED',
    actor: user.username,
    description: `System settings updated by ${user.username}`,
    details: body,
  })

  return {
    status: 200,
    data: {
      status: 'updated',
      settings: db.settings,
    },
  }
}

export function handleGetBackup(token) {
  requireAuth(token, ['owner'])
  const db = getDb()
  return {
    status: 200,
    data: {
      ...db,
      _exported_at: new Date().toISOString(),
      _app: 'Gasora ERP',
      _version: '2.4.0',
    },
  }
}

export function handleRestoreBackup(token, body) {
  const user = requireAuth(token, ['owner'])
  const payload = body?.data || body

  if (!payload || typeof payload !== 'object') {
    return {
      status: 422,
      data: { detail: 'Invalid backup format: payload must be a JSON object' },
    }
  }

  // Validate core schema collections
  const requiredKeys = ['customers', 'users', 'cylinders']
  const missing = requiredKeys.filter((k) => !Array.isArray(payload[k]))
  if (missing.length > 0) {
    return {
      status: 422,
      data: {
        detail: `Backup validation failed: Missing required collection(s): ${missing.join(', ')}`,
      },
    }
  }

  const db = getDb()
  // Replace current db collections
  Object.keys(payload).forEach((key) => {
    if (!key.startsWith('_')) {
      db[key] = payload[key]
    }
  })

  saveDb()

  recordEvent({
    type: 'DATABASE_RESTORED',
    actor: user.username,
    description: `Database restored from backup JSON by ${user.username}`,
    details: {
      customers_count: db.customers?.length || 0,
      cylinders_count: db.cylinders?.length || 0,
      bills_count: db.bills?.length || 0,
    },
  })

  return {
    status: 200,
    data: {
      ok: true,
      message: `Database restored successfully (${db.customers?.length || 0} customers, ${db.cylinders?.length || 0} cylinders loaded)`,
    },
  }
}

export function handleResetDemoData(token) {
  const user = requireAuth(token, ['owner'])
  resetDb()

  recordEvent({
    type: 'DATABASE_RESET',
    actor: user.username,
    description: `Demo database reset to factory seed values by ${user.username}`,
  })

  return {
    status: 200,
    data: {
      ok: true,
      message: 'Demo database reset to initial factory seed state',
    },
  }
}
