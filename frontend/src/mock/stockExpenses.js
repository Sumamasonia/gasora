import { ApiError } from '../api.js'
import { requireAuth } from './auth.js'
import { getDb, nextId, recordEvent, saveDb } from './db.js'

// Default low-stock safety thresholds per cylinder specification
export const DEFAULT_THRESHOLDS = {
  '11.8 kg': 25,
  '15 kg': 15,
  '45.4 kg': 10,
}

// Fuel estimation constants for Faisalabad delivery fleet
export const FLEET_KM_PER_LITER = 7.5
export const DIESEL_PRICE_PKR = 280

/**
 * Handle GET /stock/summary
 * Returns filled, empty, delivered, and total counts per cylinder type with low-stock warnings
 */
export function handleGetStockSummary(token) {
  requireAuth(token, ['owner', 'manager', 'driver'])
  const db = getDb()
  const cylinders = db.cylinders || []
  const settings = db.settings || {}
  const thresholds = settings.low_stock_thresholds || DEFAULT_THRESHOLDS

  const types = ['11.8 kg', '15 kg', '45.4 kg']
  const byType = {}
  const lowStockAlerts = []

  let totalFilled = 0
  let totalEmpty = 0
  let totalDelivered = 0
  let totalGasKg = 0

  for (const type of types) {
    const typeCyls = cylinders.filter((c) => c.cylinder_type === type)
    const filled = typeCyls.filter((c) => c.state === 'Filled').length
    // Empty includes both Empty and Recovered awaiting refill/washing
    const empty = typeCyls.filter((c) => c.state === 'Empty' || c.state === 'Recovered').length
    const delivered = typeCyls.filter((c) => c.state === 'Delivered').length
    const total = typeCyls.length

    const threshold = thresholds[type] !== undefined ? thresholds[type] : DEFAULT_THRESHOLDS[type]
    const isLow = filled <= threshold

    if (isLow) {
      lowStockAlerts.push({
        cylinder_type: type,
        filled,
        threshold,
        deficit: threshold - filled,
      })
    }

    const capacityKg = parseFloat(type) || 11.8
    totalGasKg += filled * capacityKg

    totalFilled += filled
    totalEmpty += empty
    totalDelivered += delivered

    byType[type] = {
      filled,
      empty,
      delivered,
      total,
      threshold,
      is_low: isLow,
    }
  }

  return {
    by_type: byType,
    total_filled: totalFilled,
    total_empty: totalEmpty,
    total_delivered: totalDelivered,
    total_cylinders: cylinders.length,
    total_gas_kg: Math.round(totalGasKg),
    low_stock_alerts: lowStockAlerts,
    has_low_stock: lowStockAlerts.length > 0,
    depot_name: settings.depot?.name || 'Main Depot Faisalabad',
  }
}

/**
 * Handle GET /stock/movements
 * Returns chronological log of stock movements (purchases, deliveries, recoveries)
 */
export function handleGetStockMovements(token) {
  requireAuth(token, ['owner', 'manager'])
  const db = getDb()
  const history = [...(db.cylinder_history || [])]
  const purchases = db.purchases || []
  const deliveries = db.deliveries || []

  // Transform cylinder history events into consolidated movement records
  const movements = []

  // Add purchases
  for (const p of purchases) {
    movements.push({
      id: `PUR-${p.id}`,
      type: 'purchase_inflow',
      label: `Bulk Refill Purchase (+${p.quantity} Filled)`,
      cylinder_type: p.cylinder_type || p.item,
      quantity: p.quantity,
      impact: `+${p.quantity} Filled Stock`,
      reference: p.invoice_no,
      source_destination: p.vendor,
      actor: p.created_by || 'manager',
      date: p.date,
      created_at: p.created_at || `${p.date}T10:00:00Z`,
    })
  }

  // Add deliveries
  for (const d of deliveries) {
    movements.push({
      id: `DEL-${d.id}`,
      type: 'delivery_outflow',
      label: `Customer Delivery (-${d.cylinders_delivered || d.cylinders || 1} Filled, +${d.cylinders_collected || 0} Empties)`,
      cylinder_type: d.cylinder_type || '11.8 kg',
      quantity: d.cylinders_delivered || d.cylinders || 1,
      impact: `-${d.cylinders_delivered || d.cylinders || 1} Filled, +${d.cylinders_collected || 0} Empty`,
      reference: d.route_id ? `Route #${d.route_id}` : 'Direct Sale',
      source_destination: d.customer_name || `Customer #${d.customer_id}`,
      actor: d.driver_name || d.driver || 'driver',
      date: d.delivered_on || (d.delivered_at ? d.delivered_at.split('T')[0] : '2026-02-01'),
      created_at: d.delivered_at || d.created_at,
    })
  }

  // Sort newest first
  return movements.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
}

/**
 * Handle GET /stock/purchases
 */
export function handleGetPurchases(token, queryParams = new URLSearchParams()) {
  requireAuth(token, ['owner', 'manager'])
  const db = getDb()
  let purchases = [...(db.purchases || [])]

  const vendor = queryParams.get('vendor')
  if (vendor) {
    purchases = purchases.filter((p) => p.vendor.toLowerCase().includes(vendor.toLowerCase()))
  }

  const cylinderType = queryParams.get('cylinder_type')
  if (cylinderType) {
    purchases = purchases.filter((p) => (p.cylinder_type || p.item) === cylinderType)
  }

  const verified = queryParams.get('verified')
  if (verified && verified !== 'all') {
    const isVer = verified === 'true'
    purchases = purchases.filter((p) => Boolean(p.verified) === isVer)
  }

  const month = queryParams.get('month')
  if (month && month !== 'all') {
    purchases = purchases.filter((p) => p.date && p.date.startsWith(month))
  }

  return purchases.sort((a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at))
}

/**
 * Handle POST /stock/purchases
 * Automatically increments filled stock count for that cylinder type!
 */
export function handleCreatePurchase(token, body) {
  const user = requireAuth(token, ['owner', 'manager'])
  if (!body || typeof body !== 'object') {
    throw new ApiError(422, 'Request body is required')
  }

  const vendor = (body.vendor || '').trim()
  if (!vendor) {
    throw new ApiError(422, 'Vendor name is required')
  }

  const cylinderType = body.cylinder_type || body.item || '11.8 kg'
  const quantity = Number(body.quantity)
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new ApiError(422, 'Quantity must be a positive integer greater than 0')
  }

  const unitCost = Number(body.unit_cost)
  if (isNaN(unitCost) || unitCost < 0) {
    throw new ApiError(422, 'Unit cost must be a non-negative number')
  }

  const date = body.date || new Date().toISOString().split('T')[0]
  const db = getDb()

  const id = nextId('purchases')
  const totalCost = quantity * unitCost
  const invoiceNo = body.invoice_no ? body.invoice_no.trim() : `PUR-${new Date().getFullYear()}-${String(id).padStart(4, '0')}`

  // --- AUTOMATIC STOCK RISE ---
  // Transition empty or recovered cylinders of this type to Filled,
  // or add new company Filled cylinders if stock needs expanding
  const allCylinders = db.cylinders || []
  const availableToFill = allCylinders.filter(
    (c) => (c.cylinder_type === cylinderType || !c.cylinder_type) && (c.state === 'Empty' || c.state === 'Recovered')
  )

  const filledCount = Math.min(availableToFill.length, quantity)
  for (let i = 0; i < filledCount; i++) {
    const c = availableToFill[i]
    c.state = 'Filled'
    c.customer_id = null
  }

  // If quantity purchased exceeds available empties, generate new filled asset cylinders
  const remainingNeeded = quantity - filledCount
  for (let i = 1; i <= remainingNeeded; i++) {
    const newId = nextId('cylinders')
    const typeDigits = cylinderType.replace(/[^0-9]/g, '') || '118'
    const newCyl = {
      id: newId,
      serial_no: `CYL-${typeDigits}-${String(newId).padStart(4, '0')}`,
      cylinder_type: cylinderType,
      state: 'Filled',
      owner: 'Company',
      customer_id: null,
      created_at: new Date().toISOString(),
    }
    allCylinders.push(newCyl)
  }

  // Record cylinder history movement
  if (!db.cylinder_history) db.cylinder_history = []
  db.cylinder_history.push({
    id: nextId('cylinder_history'),
    cylinder_id: null,
    txn_type: 'purchase_fill',
    from_state: 'Empty',
    to_state: 'Filled',
    customer_id: null,
    actor: user.username,
    note: `Bulk replenishment: ${quantity}x ${cylinderType} filled from ${vendor} (Inv #${invoiceNo})`,
    due_date: null,
    created_at: new Date().toISOString(),
  })

  // Create purchase record
  const purchase = {
    id,
    vendor,
    item: cylinderType,
    cylinder_type: cylinderType,
    quantity,
    unit_cost: unitCost,
    total_cost: totalCost,
    date,
    invoice_no: invoiceNo,
    verified: false,
    verified_by: null,
    verified_at: null,
    notes: body.notes ? body.notes.trim() : '',
    created_at: new Date().toISOString(),
    created_by: user.username,
  }

  if (!db.purchases) db.purchases = []
  db.purchases.push(purchase)

  recordEvent({
    type: 'stock.purchase_created',
    actor: user.username,
    description: `Recorded LPG refill purchase: ${quantity}x ${cylinderType} from ${vendor} (Total PKR ${totalCost.toLocaleString()})`,
    details: { purchase_id: id, vendor, quantity, unit_cost: unitCost, total_cost: totalCost, invoice_no: invoiceNo },
  })

  saveDb()

  return {
    ok: true,
    purchase,
    stock_increased: quantity,
    filled_count_transitioned: filledCount,
    new_cylinders_created: remainingNeeded,
  }
}

/**
 * Handle PUT /stock/purchases/:id
 * Edit purchase: A verified purchase CANNOT be edited!
 */
export function handleUpdatePurchase(token, id, body) {
  const user = requireAuth(token, ['owner', 'manager'])
  if (!body || typeof body !== 'object') {
    throw new ApiError(422, 'Request body is required')
  }

  const db = getDb()
  const purchase = (db.purchases || []).find((p) => p.id === Number(id))
  if (!purchase) {
    throw new ApiError(404, `Purchase #${id} not found`)
  }

  // Rule: Verified purchase cannot be edited
  if (purchase.verified) {
    throw new ApiError(409, 'This purchase has already been verified by a manager and cannot be edited.')
  }

  if (body.vendor !== undefined) purchase.vendor = String(body.vendor).trim()
  if (body.cylinder_type !== undefined) purchase.cylinder_type = body.cylinder_type
  if (body.item !== undefined) purchase.item = body.item
  if (body.unit_cost !== undefined) {
    purchase.unit_cost = Number(body.unit_cost)
    purchase.total_cost = purchase.quantity * purchase.unit_cost
  }
  if (body.date !== undefined) purchase.date = body.date
  if (body.invoice_no !== undefined) purchase.invoice_no = body.invoice_no
  if (body.notes !== undefined) purchase.notes = body.notes

  recordEvent({
    type: 'stock.purchase_updated',
    actor: user.username,
    description: `Updated unverified purchase #${purchase.id} (${purchase.vendor})`,
    details: { purchase_id: purchase.id },
  })

  saveDb()

  return purchase
}

/**
 * Handle POST /stock/purchases/:id/verify
 * Manager verification tick (only manager and owner may verify; once verified, cannot be edited)
 */
export function handleVerifyPurchase(token, id) {
  const user = requireAuth(token, ['owner', 'manager'])
  const db = getDb()
  const purchase = (db.purchases || []).find((p) => p.id === Number(id))
  if (!purchase) {
    throw new ApiError(404, `Purchase #${id} not found`)
  }

  if (purchase.verified) {
    return purchase // Idempotent
  }

  purchase.verified = true
  purchase.verified_by = user.username
  purchase.verified_at = new Date().toISOString()

  recordEvent({
    type: 'stock.purchase_verified',
    actor: user.username,
    description: `Verified LPG batch purchase #${purchase.id} (${purchase.quantity}x ${purchase.cylinder_type} from ${purchase.vendor})`,
    details: { purchase_id: purchase.id, verified_by: user.username },
  })

  saveDb()

  return purchase
}

/**
 * Handle GET /expenses
 * Filters: category ('fuel' | 'rent' | 'repair' | 'salary' | 'other' | 'all'), month, date
 * Calculates daily, monthly, and category breakdowns for Recharts visualization
 */
export function handleGetExpenses(token, queryParams = new URLSearchParams()) {
  requireAuth(token, ['owner', 'manager'])
  const db = getDb()
  let expenses = [...(db.expenses || [])]

  const category = queryParams.get('category')
  if (category && category !== 'all') {
    expenses = expenses.filter((e) => (e.category || '').toLowerCase() === category.toLowerCase())
  }

  const month = queryParams.get('month')
  if (month && month !== 'all') {
    expenses = expenses.filter((e) => e.date && e.date.startsWith(month))
  }

  const date = queryParams.get('date')
  if (date) {
    expenses = expenses.filter((e) => e.date === date)
  }

  // Sort newest first
  expenses.sort((a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at))

  // Aggregate totals
  const categoryTotals = { fuel: 0, rent: 0, repair: 0, salary: 0, other: 0 }
  const monthlyTotals = {}
  const dailyTotals = {}

  let totalExpenses = 0

  for (const e of expenses) {
    const amt = Number(e.amount) || 0
    totalExpenses += amt

    const cat = (e.category || 'other').toLowerCase()
    if (categoryTotals[cat] !== undefined) {
      categoryTotals[cat] += amt
    } else {
      categoryTotals.other += amt
    }

    if (e.date) {
      const m = e.date.slice(0, 7) // 'YYYY-MM'
      monthlyTotals[m] = (monthlyTotals[m] || 0) + amt
      dailyTotals[e.date] = (dailyTotals[e.date] || 0) + amt
    }
  }

  return {
    expenses,
    total_expenses: totalExpenses,
    category_totals: categoryTotals,
    monthly_totals: monthlyTotals,
    daily_totals: dailyTotals,
  }
}

/**
 * Handle POST /expenses
 */
export function handleCreateExpense(token, body) {
  const user = requireAuth(token, ['owner', 'manager'])
  if (!body || typeof body !== 'object') {
    throw new ApiError(422, 'Request body is required')
  }

  const validCategories = ['fuel', 'rent', 'repair', 'salary', 'other']
  const category = (body.category || '').toLowerCase().trim()
  if (!validCategories.includes(category)) {
    throw new ApiError(422, `Invalid category '${body.category}'. Allowed categories: ${validCategories.join(', ')}`)
  }

  const amount = Number(body.amount)
  if (isNaN(amount) || amount <= 0) {
    throw new ApiError(422, 'Amount must be a positive number greater than 0')
  }

  const date = body.date || new Date().toISOString().split('T')[0]
  const note = (body.note || body.description || '').trim()

  const db = getDb()
  const id = nextId('expenses')

  const expense = {
    id,
    category,
    amount,
    date,
    note,
    vehicle_id: body.vehicle_id || null,
    actor: user.username,
    created_at: new Date().toISOString(),
  }

  if (!db.expenses) db.expenses = []
  db.expenses.push(expense)

  recordEvent({
    type: 'expense.created',
    actor: user.username,
    description: `Logged ${category} expense of PKR ${amount.toLocaleString()} - ${note || 'Operating expense'}`,
    details: { expense_id: id, category, amount, date },
  })

  saveDb()

  return expense
}

/**
 * Handle GET /expenses/fuel-estimate
 * Fuel cost estimate calculated from published routes' kilometres
 * Clearly labelled as an estimate
 */
export function handleGetFuelEstimate(token) {
  requireAuth(token, ['owner', 'manager', 'ceo'])
  const db = getDb()
  const routes = db.routes || []
  const expenses = db.expenses || []

  // Calculate total kilometres from published delivery routes
  let totalKm = 0
  for (const r of routes) {
    totalKm += Number(r.km) || (r.stops ? r.stops.length * 3.5 : 15.0)
  }

  // If no routes published yet, provide a baseline estimate from standard route template (33.2 km)
  if (totalKm === 0) {
    totalKm = 33.2 // 18.4 km (vehicle 1) + 14.8 km (vehicle 2)
  }

  const estimatedLiters = totalKm / FLEET_KM_PER_LITER
  const estimatedFuelCost = Math.round(estimatedLiters * DIESEL_PRICE_PKR)

  // Sum actual recorded fuel expenses
  const actualFuelExpenses = expenses
    .filter((e) => (e.category || '').toLowerCase() === 'fuel')
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0)

  return {
    is_estimate: true,
    estimate_label: 'Estimated Route Fuel Cost (Fleet Model)',
    disclaimer: 'Clearly labelled as an estimate. Derived from total published route kilometres, standard commercial van mileage (7.5 km/L), and current diesel price (PKR 280/L).',
    published_routes_count: routes.length,
    total_route_km: Math.round(totalKm * 10) / 10,
    km_per_liter: FLEET_KM_PER_LITER,
    fuel_price_pkr: DIESEL_PRICE_PKR,
    estimated_liters: Math.round(estimatedLiters * 10) / 10,
    estimated_fuel_cost: estimatedFuelCost,
    actual_fuel_expenses: actualFuelExpenses,
    variance: actualFuelExpenses - estimatedFuelCost,
  }
}

/**
 * Handle GET /settings/stock
 */
export function handleGetStockSettings(token) {
  requireAuth(token, ['owner'])
  const db = getDb()
  const settings = db.settings || {}
  return {
    low_stock_thresholds: settings.low_stock_thresholds || DEFAULT_THRESHOLDS,
  }
}

/**
 * Handle PUT /settings/stock
 */
export function handleUpdateStockSettings(token, body) {
  const user = requireAuth(token, ['owner'])
  if (!body || !body.low_stock_thresholds) {
    throw new ApiError(422, 'low_stock_thresholds is required')
  }

  const db = getDb()
  if (!db.settings) db.settings = {}
  db.settings.low_stock_thresholds = {
    ...DEFAULT_THRESHOLDS,
    ...body.low_stock_thresholds,
  }

  recordEvent({
    type: 'settings.stock_updated',
    actor: user.username,
    description: 'Updated low-stock safety thresholds',
    details: db.settings.low_stock_thresholds,
  })

  saveDb()

  return {
    status: 'ok',
    low_stock_thresholds: db.settings.low_stock_thresholds,
  }
}
