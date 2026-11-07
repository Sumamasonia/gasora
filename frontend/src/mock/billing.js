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
