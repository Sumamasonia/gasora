import { SEED_USERS } from './auth.js'
import { SEED_CUSTOMERS } from './seedCustomers.js'
import { SEED_CYLINDER_HISTORY, SEED_CYLINDERS } from './seedCylinders.js'

const STORAGE_KEY = 'gasora-mock-db'

// Default empty collections schema for mock database
export const createInitialDb = () => ({
  users: [...SEED_USERS],
  customers: [...SEED_CUSTOMERS],
  cylinders: [...SEED_CYLINDERS],
  cylinder_history: [...SEED_CYLINDER_HISTORY],
  deliveries: [],
  urgent_requests: [
    {
      urgent_id: 1,
      id: 1,
      customer_id: 5,
      name: 'Al-Hafeez Sweets',
      note: 'Gas pressure low, urgent refill required for sweets production',
      status: 'open',
      created_on: new Date().toISOString().split('T')[0],
      created_by: 'owner',
    },
    {
      urgent_id: 2,
      id: 2,
      customer_id: 8,
      name: 'Fatima Textile Canteen',
      note: 'Empty cylinder replacement for factory kitchen shift',
      status: 'open',
      created_on: new Date().toISOString().split('T')[0],
      created_by: 'owner',
    },
  ],
  routes: [],
  route_stops: [],
  bills: [],
  payments: [],
  ledger: [],
  purchases: [],
  expenses: [],
  events: [],
  settings: {
    depot: { lat: 31.4181, lon: 73.0776, name: 'Main Depot Faisalabad' },
  },
})

let db = null

// Try to load saved state from localStorage
export function loadDb() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      const base = createInitialDb()
      db = { ...base, ...parsed }
      if (!db.users || db.users.length === 0) {
        db.users = [...SEED_USERS]
      }
      if (!db.customers || db.customers.length === 0) {
        db.customers = [...SEED_CUSTOMERS]
      } else {
        db.customers = db.customers.map((c) => {
          const seedMatch = SEED_CUSTOMERS.find((s) => s.id === c.id)
          return {
            ...seedMatch,
            ...c,
            code: c.code || seedMatch?.code || `C${String(c.id).padStart(4, '0')}`,
            area: c.area || seedMatch?.area || 'Faisalabad',
            deposit: c.deposit !== undefined ? c.deposit : (seedMatch?.deposit ?? 6000),
            notes: c.notes !== undefined ? c.notes : (seedMatch?.notes ?? ''),
            is_active: c.is_active !== undefined ? c.is_active : (seedMatch?.is_active ?? true),
          }
        })
      }
      if (!db.cylinders || db.cylinders.length === 0) {
        db.cylinders = [...SEED_CYLINDERS]
      }
      if (!db.cylinder_history || db.cylinder_history.length === 0) {
        db.cylinder_history = [...SEED_CYLINDER_HISTORY]
      }
      if (!db.urgent_requests || db.urgent_requests.length === 0) {
        db.urgent_requests = [
          {
            urgent_id: 1,
            id: 1,
            customer_id: 5,
            name: 'Al-Hafeez Sweets',
            note: 'Gas pressure low, urgent refill required for sweets production',
            status: 'open',
            created_on: new Date().toISOString().split('T')[0],
            created_by: 'owner',
          },
          {
            urgent_id: 2,
            id: 2,
            customer_id: 8,
            name: 'Fatima Textile Canteen',
            note: 'Empty cylinder replacement for factory kitchen shift',
            status: 'open',
            created_on: new Date().toISOString().split('T')[0],
            created_by: 'owner',
          },
        ]
      }
      return db
    }
  } catch (err) {
    console.warn('Could not load mock db from localStorage:', err)
  }
  db = createInitialDb()
  saveDb()
  return db
}

// Save current memory state to localStorage
export function saveDb() {
  if (!db) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
  } catch (err) {
    console.warn('Could not save mock db to localStorage:', err)
  }
}

// Reset database back to initial state
export function resetDb() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (err) {
    console.warn('Could not clear mock db from localStorage:', err)
  }
  db = createInitialDb()
  saveDb()
  return db
}

// Get the current db instance (lazy load if needed)
export function getDb() {
  if (!db) {
    loadDb()
  }
  return db
}

// Generate the next unique integer ID for any collection
export function nextId(collectionName) {
  const collection = getDb()[collectionName] || []
  const max = collection.reduce((m, item) => (item.id > m ? item.id : m), 0)
  return max + 1
}

// Record an audit/activity event for every state change
export function recordEvent({ type, actor = 'system', description, details = null }) {
  const currentDb = getDb()
  if (!currentDb.events) currentDb.events = []
  const event = {
    id: nextId('events'),
    type,
    actor,
    description,
    details,
    created_at: new Date().toISOString(),
  }
  currentDb.events.push(event)
  saveDb()
  return event
}
