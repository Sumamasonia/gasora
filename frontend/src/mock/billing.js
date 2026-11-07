import { ApiError } from '../api.js'
import { requireAuth } from './auth.js'
import { getDb, nextId, recordEvent, saveDb } from './db.js'

// Standard LPG prices in PKR by cylinder specification
export const STANDARD_PRICES = {
  '11.8 kg': 3100,
  '15 kg': 3800,
  '45.4 kg': 10500,
}

// Recompute running balance for a customer from immutable ledger entries
export function computeCustomerBalance(customerId) {
  const db = getDb()
  const entries = (db.ledger || []).filter((e) => Number(e.customer_id) === Number(customerId))
  const totalDebit = entries.reduce((sum, e) => sum + (Number(e.debit) || 0), 0)
  const totalCredit = entries.reduce((sum, e) => sum + (Number(e.credit) || 0), 0)
  return totalDebit - totalCredit
}

// Generate unique invoice number like INV-2026-0001
export function generateUniqueInvoiceNo(db) {
  const bills = db.bills || []
  let maxSeq = 0
  for (const b of bills) {
    if (b.invoice_no) {
      const match = b.invoice_no.match(/INV-\d{4}-(\d+)/)
      if (match) {
        const seq = parseInt(match[1], 10)
        if (seq > maxSeq) maxSeq = seq
      }
    }
  }
  const nextSeq = Math.max(maxSeq + 1, bills.length + 1)
  const year = new Date().getFullYear()
  let candidate = `INV-${year}-${String(nextSeq).padStart(4, '0')}`
  let counter = nextSeq
  while (bills.some((b) => b.invoice_no === candidate)) {
    counter++
    candidate = `INV-${year}-${String(counter).padStart(4, '0')}`
  }
  return candidate
}

// Generate unique payment receipt number like REC-2026-0001
export function generateUniqueReceiptNo(db) {
  const payments = db.payments || []
  let maxSeq = 0
  for (const p of payments) {
    if (p.receipt_no) {
      const match = p.receipt_no.match(/REC-\d{4}-(\d+)/)
      if (match) {
        const seq = parseInt(match[1], 10)
        if (seq > maxSeq) maxSeq = seq
      }
    }
  }
  const nextSeq = Math.max(maxSeq + 1, payments.length + 1)
  const year = new Date().getFullYear()
  let candidate = `REC-${year}-${String(nextSeq).padStart(4, '0')}`
  let counter = nextSeq
  while (payments.some((p) => p.receipt_no === candidate)) {
    counter++
    candidate = `REC-${year}-${String(counter).padStart(4, '0')}`
  }
  return candidate
}

/**
 * STEP 1: Handle POST /sales
 *
 * Mock sale, fill and delivery entry that updates:
 * 1. Cylinders asset lifecycle (Filled -> Delivered for delivered, Delivered -> Recovered for empties)
 * 2. Stock levels
 * 3. Delivery record
 * 4. Bill & invoice line
 * 5. Immutable ledger entries (Debit for sale amount, separate Credit if payment at delivery)
 *
 * ATOMIC OPERATION: Rejects everything on any validation/stock error before mutating state.
 */
export function handlePostSale(token, body) {
  const user = requireAuth(token, ['owner', 'manager', 'driver'])
  if (!body || typeof body !== 'object') {
    throw new ApiError(422, 'Request body is required')
  }

  const customerId = Number(body.customer_id)
  if (!customerId || isNaN(customerId)) {
    throw new ApiError(422, 'Valid customer_id is required')
  }

  const db = getDb()
  const customer = (db.customers || []).find((c) => c.id === customerId)
  if (!customer) {
    throw new ApiError(404, `Customer #${customerId} not found`)
  }

  const cylindersDelivered = Number(body.cylinders_delivered)
  if (!Number.isInteger(cylindersDelivered) || cylindersDelivered <= 0) {
    throw new ApiError(422, 'cylinders_delivered must be a positive integer greater than 0')
  }

  const emptiesReceived = body.empties_received !== undefined ? Number(body.empties_received) : 0
  if (!Number.isInteger(emptiesReceived) || emptiesReceived < 0) {
    throw new ApiError(422, 'empties_received must be a non-negative integer')
  }

  const cylinderType = body.cylinder_type || customer.cylinder_type || '11.8 kg'
  const defaultPrice = STANDARD_PRICES[cylinderType] || 3100
  const pricePerCylinder = body.price_per_cylinder !== undefined ? Number(body.price_per_cylinder) : defaultPrice
  if (isNaN(pricePerCylinder) || pricePerCylinder < 0) {
    throw new ApiError(422, 'price_per_cylinder must be a non-negative number')
  }

  const paymentAtDelivery = body.payment_at_delivery !== undefined ? Number(body.payment_at_delivery) : 0
  if (isNaN(paymentAtDelivery) || paymentAtDelivery < 0) {
    throw new ApiError(422, 'payment_at_delivery cannot be negative')
  }

  // --- CYLINDERS & STOCK VALIDATION (BEFORE MUTATION) ---
  const allCylinders = db.cylinders || []

  // Delivered cylinders validation
  let deliveredCylinders = []
  if (Array.isArray(body.delivered_cylinder_ids) && body.delivered_cylinder_ids.length > 0) {
    if (body.delivered_cylinder_ids.length !== cylindersDelivered) {
      throw new ApiError(409, `delivered_cylinder_ids count (${body.delivered_cylinder_ids.length}) does not match cylinders_delivered (${cylindersDelivered})`)
    }
    for (const cid of body.delivered_cylinder_ids) {
      const cyl = allCylinders.find((c) => c.id === Number(cid))
      if (!cyl) {
        throw new ApiError(409, `Delivered cylinder #${cid} not found in register`)
      }
      if (cyl.state !== 'Filled') {
        throw new ApiError(409, `Cylinder ${cyl.serial_no} is in state '${cyl.state}', must be 'Filled'`)
      }
      deliveredCylinders.push(cyl)
    }
  } else {
    // Pick available Filled stock (matching cylinder type first)
    const matchingFilled = allCylinders.filter((c) => c.state === 'Filled' && c.cylinder_type === cylinderType)
    const anyFilled = allCylinders.filter((c) => c.state === 'Filled')
    const pool = matchingFilled.length >= cylindersDelivered ? matchingFilled : anyFilled
    if (pool.length < cylindersDelivered) {
      throw new ApiError(409, `Insufficient filled stock. Requested: ${cylindersDelivered}, Available in stock: ${pool.length}`)
    }
    deliveredCylinders = pool.slice(0, cylindersDelivered)
  }

  // Empties collected validation
  let collectedCylinders = []
  if (emptiesReceived > 0) {
    if (Array.isArray(body.empty_cylinder_ids) && body.empty_cylinder_ids.length > 0) {
      if (body.empty_cylinder_ids.length !== emptiesReceived) {
        throw new ApiError(409, `empty_cylinder_ids count (${body.empty_cylinder_ids.length}) does not match empties_received (${emptiesReceived})`)
      }
      for (const cid of body.empty_cylinder_ids) {
        const cyl = allCylinders.find((c) => c.id === Number(cid))
        if (!cyl) {
          throw new ApiError(409, `Empty cylinder #${cid} not found in register`)
        }
        if (cyl.state !== 'Delivered') {
          throw new ApiError(409, `Cylinder ${cyl.serial_no} is in state '${cyl.state}', must be 'Delivered'`)
        }
        if (Number(cyl.customer_id) !== customerId) {
          throw new ApiError(409, `Cylinder ${cyl.serial_no} is held by customer #${cyl.customer_id}, not customer #${customerId}`)
        }
        collectedCylinders.push(cyl)
      }
    } else {
      // Pick cylinders held by this customer in Delivered state
      const customerHeld = allCylinders.filter((c) => Number(c.customer_id) === customerId && c.state === 'Delivered')
      collectedCylinders = customerHeld.slice(0, emptiesReceived)
    }
  }

  // --- ALL VALIDATIONS PASSED: ATOMIC TRANSACTION EXECUTION ---
  const now = new Date()
  const timestamp = body.date || now.toISOString()
  const todayStr = timestamp.split('T')[0]
  const totalAmount = cylindersDelivered * pricePerCylinder
  const paidAmount = paymentAtDelivery
  const balanceDue = totalAmount - paidAmount
  const invoiceNo = generateUniqueInvoiceNo(db)

  // 1. Move delivered cylinders (Filled -> Delivered)
  const deliveryId = nextId('deliveries')
  for (const c of deliveredCylinders) {
    const fromState = c.state
    c.state = 'Delivered'
    c.customer_id = customerId

    recordEvent({
      type: 'cylinder.transition',
      actor: user.username,
      description: `Delivered cylinder ${c.serial_no} to ${customer.name}`,
      details: { cylinder_id: c.id, from_state: fromState, to_state: 'Delivered', customer_id: customerId, delivery_id: deliveryId },
    })

    if (!db.cylinder_history) db.cylinder_history = []
    const due = new Date(now.getTime() + 15 * 86400000)
    db.cylinder_history.push({
      id: nextId('cylinder_history'),
      cylinder_id: c.id,
      txn_type: 'transition',
      from_state: fromState,
      to_state: 'Delivered',
      customer_id: customerId,
      delivery_id: deliveryId,
      actor: user.username,
      note: `Direct sale and delivery (Invoice #${invoiceNo})`,
      due_date: due.toISOString().split('T')[0],
      created_at: timestamp,
    })
  }

  // 2. Move collected empties (Delivered -> Recovered)
  for (const c of collectedCylinders) {
    const fromState = c.state
    c.state = 'Recovered'
    c.customer_id = null

    recordEvent({
      type: 'cylinder.transition',
      actor: user.username,
      description: `Collected empty cylinder ${c.serial_no} from ${customer.name}`,
      details: { cylinder_id: c.id, from_state: fromState, to_state: 'Recovered', customer_id: null, delivery_id: deliveryId },
    })

    if (!db.cylinder_history) db.cylinder_history = []
    db.cylinder_history.push({
      id: nextId('cylinder_history'),
      cylinder_id: c.id,
      txn_type: 'transition',
      from_state: fromState,
      to_state: 'Recovered',
      customer_id: null,
      delivery_id: deliveryId,
      actor: user.username,
      note: `Empties collected at sale (Invoice #${invoiceNo})`,
      due_date: null,
      created_at: timestamp,
    })
  }

  // 3. Record Delivery
  const deliveryRecord = {
    id: deliveryId,
    customer_id: customerId,
    customer_name: customer.name,
    route_id: null,
    driver_name: user.username,
    cylinder_type: cylinderType,
    cylinders_delivered: cylindersDelivered,
    cylinders_collected: emptiesReceived,
    delivered_at: timestamp,
    delivered_on: todayStr,
    status: 'delivered',
    notes: body.notes || `Sale #${invoiceNo} direct delivery`,
    created_at: timestamp,
  }
  if (!db.deliveries) db.deliveries = []
  db.deliveries.push(deliveryRecord)

  // 4. Create Bill / Invoice
  const billStatus = paidAmount >= totalAmount ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid'
  const bill = {
    id: nextId('bills'),
    invoice_no: invoiceNo,
    customer_id: customerId,
    customer_name: customer.name,
    customer_phone: customer.phone,
    customer_code: customer.code || `C${String(customerId).padStart(4, '0')}`,
    customer_area: customer.area || 'Faisalabad',
    customer_address: customer.address || '',
    bill_type: 'direct_sale',
    items: [
      {
        id: 1,
        cylinder_type: cylinderType,
        quantity: cylindersDelivered,
        unit_price: pricePerCylinder,
        total: totalAmount,
      },
    ],
    subtotal: totalAmount,
    tax: 0,
    total: totalAmount,
    paid_amount: paidAmount,
    balance_due: Math.max(0, balanceDue),
    status: billStatus,
    due_date: new Date(now.getTime() + 15 * 86400000).toISOString().split('T')[0],
    created_at: timestamp,
    notes: body.notes || 'Direct sale and delivery entry',
  }
  if (!db.bills) db.bills = []
  db.bills.push(bill)

  // 5. Append Ledger Entries (Immutable & Append-Only)
  if (!db.ledger) db.ledger = []

  // Entry 1: Debit for Sale / Invoice
  const invoiceLedgerEntry = {
    id: nextId('ledger'),
    customer_id: customerId,
    customer_name: customer.name,
    entry_type: 'invoice',
    reference_no: bill.invoice_no,
    bill_id: bill.id,
    description: `Sale & Delivery: ${cylindersDelivered}x ${cylinderType} @ PKR ${pricePerCylinder.toLocaleString()}`,
    debit: totalAmount,
    credit: 0,
    created_at: timestamp,
    created_by: user.username,
  }
  db.ledger.push(invoiceLedgerEntry)

  // Entry 2: Credit for Payment at delivery (Separate entry as per money rules)
  let paymentRecord = null
  if (paidAmount > 0) {
    const receiptNo = generateUniqueReceiptNo(db)
    paymentRecord = {
      id: nextId('payments'),
      receipt_no: receiptNo,
      bill_id: bill.id,
      invoice_no: bill.invoice_no,
      customer_id: customerId,
      customer_name: customer.name,
      amount: paidAmount,
      payment_method: body.payment_method || 'Cash',
      reference: body.payment_reference || `Payment at delivery for ${bill.invoice_no}`,
      notes: 'Payment collected at time of sale/delivery',
      created_at: new Date(now.getTime() + 500).toISOString(),
      created_by: user.username,
    }
    if (!db.payments) db.payments = []
    db.payments.push(paymentRecord)

    const paymentLedgerEntry = {
      id: nextId('ledger'),
      customer_id: customerId,
      customer_name: customer.name,
      entry_type: 'payment',
      reference_no: receiptNo,
      bill_id: bill.id,
      description: `Payment at delivery (${paymentRecord.payment_method}) - Rec #${receiptNo}`,
      debit: 0,
      credit: paidAmount,
      created_at: paymentRecord.created_at,
      created_by: user.username,
    }
    db.ledger.push(paymentLedgerEntry)
  }

  // 6. Record Audit Event & Persist
  recordEvent({
    type: 'sale.recorded',
    actor: user.username,
    description: `Recorded sale ${invoiceNo} for ${customer.name} (${cylindersDelivered}x ${cylinderType}, Total PKR ${totalAmount.toLocaleString()}, Paid PKR ${paidAmount.toLocaleString()})`,
    details: {
      invoice_no: invoiceNo,
      bill_id: bill.id,
      customer_id: customerId,
      total_amount: totalAmount,
      paid_amount: paidAmount,
      delivered_cylinders: deliveredCylinders.map((c) => c.serial_no),
      recovered_cylinders: collectedCylinders.map((c) => c.serial_no),
    },
  })

  saveDb()

  const newBalance = computeCustomerBalance(customerId)

  return {
    ok: true,
    sale_id: bill.id,
    invoice_no: bill.invoice_no,
    customer_id: customerId,
    customer_name: customer.name,
    cylinder_type: cylinderType,
    cylinders_delivered: cylindersDelivered,
    empties_received: emptiesReceived,
    total_amount: totalAmount,
    payment_at_delivery: paidAmount,
    balance_due: bill.balance_due,
    customer_balance: newBalance,
    bill,
    payment: paymentRecord,
  }
}

// Recompute ledger with running balances for a specific customer
export function computeCustomerLedgerWithBalances(customerId) {
  const db = getDb()
  const entries = (db.ledger || [])
    .filter((e) => Number(e.customer_id) === Number(customerId))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at) || a.id - b.id)

  let runningBalance = 0
  return entries.map((entry) => {
    const debit = Number(entry.debit) || 0
    const credit = Number(entry.credit) || 0
    runningBalance += debit - credit
    return {
      ...entry,
      debit,
      credit,
      balance: runningBalance,
    }
  })
}

// Generate unique correction reference like CORR-2026-0001
export function generateUniqueCorrectionNo(db) {
  const ledger = db.ledger || []
  let maxSeq = 0
  for (const e of ledger) {
    if (e.reference_no) {
      const match = e.reference_no.match(/CORR-\d{4}-(\d+)/)
      if (match) {
        const seq = parseInt(match[1], 10)
        if (seq > maxSeq) maxSeq = seq
      }
    }
  }
  const nextSeq = Math.max(maxSeq + 1, 1)
  const year = new Date().getFullYear()
  let candidate = `CORR-${year}-${String(nextSeq).padStart(4, '0')}`
  let counter = nextSeq
  while (ledger.some((e) => e.reference_no === candidate)) {
    counter++
    candidate = `CORR-${year}-${String(counter).padStart(4, '0')}`
  }
  return candidate
}

/**
 * Handle GET /bills (and /billing/invoices)
 * Filter by: customer_id, month, status ('paid' | 'partial' | 'unpaid' | 'all')
 */
export function handleGetBills(token, queryParams = new URLSearchParams()) {
  const user = requireAuth(token, ['owner', 'manager', 'customer'])
  const db = getDb()
  let bills = [...(db.bills || [])]

  // Role restriction for customer
  if (user.role === 'customer') {
    const customer = (db.customers || []).find((c) => c.phone === user.username || c.name.toLowerCase().includes(user.username.toLowerCase()))
    if (customer) {
      bills = bills.filter((b) => b.customer_id === customer.id)
    }
  }

  const customerId = queryParams.get('customer_id')
  if (customerId) {
    bills = bills.filter((b) => Number(b.customer_id) === Number(customerId))
  }

  const status = queryParams.get('status')
  if (status && status !== 'all') {
    bills = bills.filter((b) => (b.status || 'unpaid').toLowerCase() === status.toLowerCase())
  }

  const month = queryParams.get('month')
  if (month && month !== 'all') {
    bills = bills.filter((b) => b.created_at && b.created_at.startsWith(month))
  }

  // Sort newest first
  return bills.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
}

/**
 * Handle GET /bills/:id
 */
export function handleGetBill(token, id) {
  const user = requireAuth(token, ['owner', 'manager', 'customer'])
  const db = getDb()
  const bill = (db.bills || []).find((b) => b.id === Number(id))
  if (!bill) {
    throw new ApiError(404, `Bill / Invoice #${id} not found`)
  }

  const payments = (db.payments || []).filter(
    (p) => Number(p.bill_id) === bill.id || (p.invoice_no && p.invoice_no === bill.invoice_no)
  )

  const customerBalance = computeCustomerBalance(bill.customer_id)

  return {
    ...bill,
    payments,
    customer_balance: customerBalance,
  }
}

/**
 * Handle POST /bills (Create monthly or custom invoice)
 */
export function handleCreateBill(token, body) {
  const user = requireAuth(token, ['owner', 'manager'])
  if (!body || typeof body !== 'object') {
    throw new ApiError(422, 'Request body is required')
  }

  const customerId = Number(body.customer_id)
  if (!customerId || isNaN(customerId)) {
    throw new ApiError(422, 'customer_id is required')
  }

  const db = getDb()
  const customer = (db.customers || []).find((c) => c.id === customerId)
  if (!customer) {
    throw new ApiError(404, `Customer #${customerId} not found`)
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new ApiError(422, 'Invoice must contain at least one line item')
  }

  const validatedItems = body.items.map((item, idx) => {
    const qty = Number(item.quantity)
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new ApiError(422, `Item #${idx + 1}: quantity must be a positive integer`)
    }
    const unitPrice = Number(item.unit_price)
    if (isNaN(unitPrice) || unitPrice < 0) {
      throw new ApiError(422, `Item #${idx + 1}: unit_price must be a non-negative number`)
    }
    return {
      id: idx + 1,
      cylinder_type: item.cylinder_type || customer.cylinder_type || '11.8 kg',
      quantity: qty,
      unit_price: unitPrice,
      total: qty * unitPrice,
    }
  })

  const subtotal = validatedItems.reduce((sum, item) => sum + item.total, 0)
  const tax = Number(body.tax) || 0
  const total = subtotal + tax
  const paidAmount = Number(body.paid_amount) || 0
  const balanceDue = Math.max(0, total - paidAmount)
  const status = paidAmount >= total ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid'

  const invoiceNo = generateUniqueInvoiceNo(db)
  const now = new Date()
  const timestamp = body.date || now.toISOString()

  const bill = {
    id: nextId('bills'),
    invoice_no: invoiceNo,
    customer_id: customerId,
    customer_name: customer.name,
    customer_code: customer.code || `C${String(customerId).padStart(4, '0')}`,
    customer_phone: customer.phone,
    customer_area: customer.area || 'Faisalabad',
    customer_address: customer.address || '',
    bill_type: body.bill_type || 'monthly',
    period_start: body.period_start || null,
    period_end: body.period_end || null,
    period_month: body.period_month || null,
    items: validatedItems,
    subtotal,
    tax,
    total,
    paid_amount: paidAmount,
    balance_due: balanceDue,
    status,
    due_date: body.due_date || new Date(now.getTime() + 15 * 86400000).toISOString().split('T')[0],
    created_at: timestamp,
    notes: body.notes || 'Generated billing invoice',
  }

  if (!db.bills) db.bills = []
  db.bills.push(bill)

  // Append Debit entry to ledger
  if (!db.ledger) db.ledger = []
  const ledgerEntry = {
    id: nextId('ledger'),
    customer_id: customerId,
    customer_name: customer.name,
    entry_type: 'invoice',
    reference_no: bill.invoice_no,
    bill_id: bill.id,
    description: `Invoice #${bill.invoice_no} (${bill.bill_type} billing: ${validatedItems.map((i) => `${i.quantity}x ${i.cylinder_type}`).join(', ')})`,
    debit: total,
    credit: 0,
    created_at: timestamp,
    created_by: user.username,
  }
  db.ledger.push(ledgerEntry)

  // If initial payment was included
  if (paidAmount > 0) {
    const receiptNo = generateUniqueReceiptNo(db)
    const payment = {
      id: nextId('payments'),
      receipt_no: receiptNo,
      bill_id: bill.id,
      invoice_no: bill.invoice_no,
      customer_id: customerId,
      customer_name: customer.name,
      amount: paidAmount,
      payment_method: body.payment_method || 'Cash',
      reference: body.payment_reference || `Payment for ${bill.invoice_no}`,
      notes: 'Initial payment recorded with invoice creation',
      created_at: new Date(now.getTime() + 500).toISOString(),
      created_by: user.username,
    }
    if (!db.payments) db.payments = []
    db.payments.push(payment)

    db.ledger.push({
      id: nextId('ledger'),
      customer_id: customerId,
      customer_name: customer.name,
      entry_type: 'payment',
      reference_no: receiptNo,
      bill_id: bill.id,
      description: `Payment received (${payment.payment_method}) - Rec #${receiptNo}`,
      debit: 0,
      credit: paidAmount,
      created_at: payment.created_at,
      created_by: user.username,
    })
  }

  recordEvent({
    type: 'invoice.created',
    actor: user.username,
    description: `Created invoice ${invoiceNo} for ${customer.name} (PKR ${total.toLocaleString()})`,
    details: { invoice_no: invoiceNo, bill_id: bill.id, total, status },
  })

  saveDb()

  return bill
}

/**
 * Handle GET /payments
 */
export function handleGetPayments(token, queryParams = new URLSearchParams()) {
  const user = requireAuth(token, ['owner', 'manager', 'customer'])
  const db = getDb()
  let payments = [...(db.payments || [])]

  if (user.role === 'customer') {
    const customer = (db.customers || []).find((c) => c.phone === user.username || c.name.toLowerCase().includes(user.username.toLowerCase()))
    if (customer) {
      payments = payments.filter((p) => p.customer_id === customer.id)
    }
  }

  const customerId = queryParams.get('customer_id')
  if (customerId) {
    payments = payments.filter((p) => Number(p.customer_id) === Number(customerId))
  }

  const billId = queryParams.get('bill_id')
  if (billId) {
    payments = payments.filter((p) => Number(p.bill_id) === Number(billId))
  }

  return payments.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
}

/**
 * Handle POST /payments
 * Partial payment allowed; generates receipt number; updates bill and ledger
 */
export function handleRecordPayment(token, body) {
  const user = requireAuth(token, ['owner', 'manager', 'driver'])
  if (!body || typeof body !== 'object') {
    throw new ApiError(422, 'Request body is required')
  }

  const customerId = Number(body.customer_id)
  if (!customerId || isNaN(customerId)) {
    throw new ApiError(422, 'customer_id is required')
  }

  const db = getDb()
  const customer = (db.customers || []).find((c) => c.id === customerId)
  if (!customer) {
    throw new ApiError(404, `Customer #${customerId} not found`)
  }

  const amount = Number(body.amount)
  if (isNaN(amount) || amount <= 0) {
    throw new ApiError(422, 'Payment amount must be greater than 0')
  }

  let bill = null
  if (body.bill_id) {
    bill = (db.bills || []).find((b) => b.id === Number(body.bill_id))
    if (!bill) {
      throw new ApiError(404, `Bill #${body.bill_id} not found`)
    }
    if (Number(bill.customer_id) !== customerId) {
      throw new ApiError(409, `Bill #${bill.id} belongs to customer #${bill.customer_id}, not #${customerId}`)
    }

    // Update bill
    bill.paid_amount = (Number(bill.paid_amount) || 0) + amount
    bill.balance_due = Math.max(0, bill.total - bill.paid_amount)
    bill.status = bill.paid_amount >= bill.total ? 'paid' : 'partial'
  }

  const receiptNo = generateUniqueReceiptNo(db)
  const now = new Date()
  const timestamp = body.date || now.toISOString()

  const paymentRecord = {
    id: nextId('payments'),
    receipt_no: receiptNo,
    bill_id: bill ? bill.id : null,
    invoice_no: bill ? bill.invoice_no : null,
    customer_id: customerId,
    customer_name: customer.name,
    amount,
    payment_method: body.payment_method || 'Cash',
    reference: body.reference || (bill ? `Payment against ${bill.invoice_no}` : 'General account credit'),
    notes: body.notes || '',
    created_at: timestamp,
    created_by: user.username,
  }

  if (!db.payments) db.payments = []
  db.payments.push(paymentRecord)

  // Append Credit entry to Ledger
  if (!db.ledger) db.ledger = []
  const ledgerDescription = bill
    ? `Payment received (${paymentRecord.payment_method}) - Rec #${receiptNo} for Inv #${bill.invoice_no}`
    : `Payment received (${paymentRecord.payment_method}) - Rec #${receiptNo} on account`

  const ledgerEntry = {
    id: nextId('ledger'),
    customer_id: customerId,
    customer_name: customer.name,
    entry_type: 'payment',
    reference_no: receiptNo,
    bill_id: bill ? bill.id : null,
    description: ledgerDescription,
    debit: 0,
    credit: amount,
    created_at: timestamp,
    created_by: user.username,
  }
  db.ledger.push(ledgerEntry)

  recordEvent({
    type: 'payment.received',
    actor: user.username,
    description: `Recorded payment of PKR ${amount.toLocaleString()} from ${customer.name} (Receipt #${receiptNo})`,
    details: {
      receipt_no: receiptNo,
      amount,
      customer_id: customerId,
      bill_id: bill ? bill.id : null,
    },
  })

  saveDb()

  const newBalance = computeCustomerBalance(customerId)

  return {
    ok: true,
    payment: paymentRecord,
    receipt_no: receiptNo,
    bill,
    customer_balance: newBalance,
  }
}

/**
 * Handle GET /ledger
 * Append-only ledger view with recomputed running balance
 */
export function handleGetLedger(token, queryParams = new URLSearchParams()) {
  const user = requireAuth(token, ['owner', 'manager', 'customer'])
  const db = getDb()

  let customerId = queryParams.get('customer_id')
  if (user.role === 'customer') {
    const customer = (db.customers || []).find((c) => c.phone === user.username || c.name.toLowerCase().includes(user.username.toLowerCase()))
    if (customer) {
      customerId = String(customer.id)
    }
  }

  if (customerId) {
    const entries = computeCustomerLedgerWithBalances(customerId)
    const entryType = queryParams.get('entry_type')
    if (entryType && entryType !== 'all') {
      return entries.filter((e) => e.entry_type === entryType)
    }
    return entries
  }

  // Multi-customer / general ledger: calculate running balance per customer
  const allLedger = [...(db.ledger || [])]
  allLedger.sort((a, b) => new Date(a.created_at) - new Date(b.created_at) || a.id - b.id)

  const customerRunningBalances = {}
  const enriched = allLedger.map((entry) => {
    const cid = entry.customer_id
    if (!customerRunningBalances[cid]) customerRunningBalances[cid] = 0
    const debit = Number(entry.debit) || 0
    const credit = Number(entry.credit) || 0
    customerRunningBalances[cid] += debit - credit
    return {
      ...entry,
      debit,
      credit,
      balance: customerRunningBalances[cid],
    }
  })

  const entryType = queryParams.get('entry_type')
  let result = enriched
  if (entryType && entryType !== 'all') {
    result = result.filter((e) => e.entry_type === entryType)
  }

  // Return newest first for general ledger view
  return result.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0) || b.id - a.id)
}

/**
 * Handle POST /ledger/correction
 * Append-only rule: reason is required, never modifies an old row, appends a new row
 */
export function handlePostLedgerCorrection(token, body) {
  const user = requireAuth(token, ['owner', 'manager'])
  if (!body || typeof body !== 'object') {
    throw new ApiError(422, 'Request body is required')
  }

  const customerId = Number(body.customer_id)
  if (!customerId || isNaN(customerId)) {
    throw new ApiError(422, 'customer_id is required')
  }

  const db = getDb()
  const customer = (db.customers || []).find((c) => c.id === customerId)
  if (!customer) {
    throw new ApiError(404, `Customer #${customerId} not found`)
  }

  const reason = (body.reason || '').trim()
  if (!reason) {
    throw new ApiError(422, 'Reason is strictly required for ledger correction entries')
  }

  const amount = Number(body.amount)
  if (isNaN(amount) || amount <= 0) {
    throw new ApiError(422, 'Correction amount must be greater than 0')
  }

  const correctionType = body.correction_type || (body.debit ? 'debit' : 'credit')
  if (correctionType !== 'credit' && correctionType !== 'debit') {
    throw new ApiError(422, 'correction_type must be either credit or debit')
  }

  const referenceNo = generateUniqueCorrectionNo(db)
  const debit = correctionType === 'debit' ? amount : 0
  const credit = correctionType === 'credit' ? amount : 0
  const now = new Date()
  const timestamp = body.date || now.toISOString()

  const correctionEntry = {
    id: nextId('ledger'),
    customer_id: customerId,
    customer_name: customer.name,
    entry_type: 'correction',
    reference_no: referenceNo,
    bill_id: body.bill_id || null,
    corrected_entry_id: body.corrected_entry_id || null,
    description: `Correction: ${reason}`,
    reason,
    debit,
    credit,
    created_at: timestamp,
    created_by: user.username,
  }

  if (!db.ledger) db.ledger = []
  db.ledger.push(correctionEntry)

  recordEvent({
    type: 'ledger.correction',
    actor: user.username,
    description: `Posted ledger correction ${referenceNo} for ${customer.name} (${correctionType} PKR ${amount.toLocaleString()}) - Reason: ${reason}`,
    details: {
      reference_no: referenceNo,
      customer_id: customerId,
      correction_type: correctionType,
      amount,
      reason,
    },
  })

  saveDb()

  const newBalance = computeCustomerBalance(customerId)

  return {
    ok: true,
    entry: correctionEntry,
    reference_no: referenceNo,
    customer_balance: newBalance,
  }
}

/**
 * Handle GET /billing/loans (Customer debt ageing and loan analysis)
 */
export function handleGetLoans(token, queryParams = new URLSearchParams()) {
  requireAuth(token, ['owner', 'manager', 'ceo'])
  const db = getDb()
  const customers = db.customers || []
  const bills = db.bills || []
  const payments = db.payments || []

  const now = new Date()
  const rows = []

  let totalReceivables = 0
  let totalOverdue30 = 0
  let totalOverdue60 = 0
  let totalOverdue90 = 0
  let totalUnsecuredRisk = 0

  for (const cust of customers) {
    const balance = computeCustomerBalance(cust.id)
    const deposit = cust.deposit || 0
    const unsecuredExposure = Math.max(0, balance - deposit)

    // Unpaid/partial bills for this customer
    const custBills = bills.filter((b) => b.customer_id === cust.id && b.status !== 'paid')
    const custPayments = payments.filter((p) => p.customer_id === cust.id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    const lastPayment = custPayments[0] ? custPayments[0].created_at : null

    // Ageing analysis based on unpaid bills or balance age
    let bCurrent = 0
    let b30 = 0
    let b60 = 0
    let b90 = 0

    if (custBills.length > 0) {
      for (const bill of custBills) {
        const billDue = bill.balance_due || (bill.total - (bill.paid_amount || 0))
        const billAgeDays = Math.max(0, Math.floor((now - new Date(bill.created_at)) / 86400000))
        if (billAgeDays <= 30) {
          bCurrent += billDue
        } else if (billAgeDays <= 60) {
          b30 += billDue
        } else if (billAgeDays <= 90) {
          b60 += billDue
        } else {
          b90 += billDue
        }
      }
    } else if (balance > 0) {
      // If ledger shows balance with no specific bill, bucket by latest transaction
      bCurrent = balance
    }

    if (balance > 0 || queryParams.get('include_all') === 'true') {
      if (balance > 0) {
        totalReceivables += balance
        totalOverdue30 += b30
        totalOverdue60 += b60
        totalOverdue90 += b90
        totalUnsecuredRisk += unsecuredExposure
      }

      rows.push({
        customer_id: cust.id,
        code: cust.code || `C${String(cust.id).padStart(4, '0')}`,
        name: cust.name,
        phone: cust.phone,
        area: cust.area || 'Faisalabad',
        customer_type: cust.customer_type || 'domestic',
        cylinder_type: cust.cylinder_type || '11.8 kg',
        total_balance: balance,
        deposit,
        unsecured_risk: unsecuredExposure,
        ageing: {
          current: bCurrent,
          days_31_60: b30,
          days_61_90: b60,
          days_90_plus: b90,
        },
        unpaid_bills_count: custBills.length,
        last_payment_date: lastPayment,
      })
    }
  }

  // Sort by highest balance due first
  rows.sort((a, b) => b.total_balance - a.total_balance)

  return {
    summary: {
      total_receivables: totalReceivables,
      debtor_count: rows.filter((r) => r.total_balance > 0).length,
      overdue_30_days: totalOverdue30,
      overdue_60_days: totalOverdue60,
      overdue_90_days: totalOverdue90,
      unsecured_risk: totalUnsecuredRisk,
    },
    customers: rows,
  }
}

/**
 * Handle GET /billing/statement/:customer_id
 * Returns complete printable statement of account
 */
export function handleGetCustomerStatement(token, customerId) {
  requireAuth(token, ['owner', 'manager', 'customer'])
  const db = getDb()
  const customer = (db.customers || []).find((c) => c.id === Number(customerId))
  if (!customer) {
    throw new ApiError(404, `Customer #${customerId} not found`)
  }

  const ledgerEntries = computeCustomerLedgerWithBalances(customerId)
  const currentBalance = computeCustomerBalance(customerId)
  const unpaidBills = (db.bills || []).filter(
    (b) => b.customer_id === Number(customerId) && b.status !== 'paid'
  )

  return {
    customer,
    statement_date: new Date().toISOString(),
    deposit_held: customer.deposit || 0,
    current_balance: currentBalance,
    ledger: ledgerEntries,
    unpaid_bills: unpaidBills,
  }
}
