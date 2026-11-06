const STORAGE_KEY = 'gasora-mock-db'

// Default empty collections schema for mock database
export const createInitialDb = () => ({
  users: [],
  customers: [],
  cylinders: [],
  cylinder_history: [],
  deliveries: [],
  urgent_requests: [],
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
