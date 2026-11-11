import { ApiError } from '../api.js'
import { handleLogin, handleMe } from './auth.js'
import { handleGetAuditEvents, handleVerifyAudit } from './audit.js'
import { handleAssistantChat } from './assistant.js'
import { handleDeleteNote, handleGetNotes, handleSaveNote } from './notes.js'
import {
  handleGetBackup,
  handleGetSettings,
  handleResetDemoData,
  handleRestoreBackup,
  handleUpdateSettings,
} from './settings.js'
import {
  handleCreateBill,
  handleGetBill,
  handleGetBills,
  handleGetCustomerStatement,
  handleGetLedger,
  handleGetLoans,
  handleGetPayments,
  handlePostLedgerCorrection,
  handlePostSale,
  handleRecordPayment,
} from './billing.js'
import {
  handleCreateCustomer,
  handleDeleteCustomer,
  handleGetCustomer,
  handleGetCustomerCylinders,
  handleGetCustomerDeliveries,
  handleGetCustomerLedger,
  handleGetCustomers,
  handleUpdateCustomer,
} from './customers.js'
import {
  handleCreateCylinder,
  handleGetCylinder,
  handleGetCylinderHistory,
  handleGetCylinders,
  handleGetCylinderSummary,
  handleGetRecoveryAgeing,
  handleTransitionCylinder,
} from './cylinders.js'
import {
  handleAssignRoute,
  handleCreateUrgent,
  handleDeliverStop,
  handleGetMyRoutes,
  handleGetPlan,
  handleGetRoutes,
  handleGetUrgent,
  handlePostPaths,
  handlePublishPlan,
  handleSkipStop,
} from './dispatch.js'
import { handleCreateUser, handleGetUsers, handleUpdateUser } from './users.js'
import {
  handleCreateMyRequest,
  handleGetMyBalance,
  handleGetMyBills,
  handleGetMyDeliveryStatus,
  handleGetMyNextDelivery,
  handleGetMyOrders,
} from './customerPortal.js'
import { getDb, saveDb } from './db.js'
import { requireAuth } from './auth.js'
import { handleGetDashboardSummary, handleGetReport } from './dashboard.js'
import { handleGetEvaluationResults } from './evaluation.js'
import {
  handleCreateExpense,
  handleCreatePurchase,
  handleGetExpenses,
  handleGetFuelEstimate,
  handleGetPurchases,
  handleGetStockMovements,
  handleGetStockSettings,
  handleGetStockSummary,
  handleUpdatePurchase,
  handleUpdateStockSettings,
  handleVerifyPurchase,
} from './stockExpenses.js'

// Simulate realistic network latency (150 - 400 ms)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const randomLatency = () => delay(150 + Math.floor(Math.random() * 251))

// Main mock router that intercepts API calls in demo mode
export async function mockRequest(path, { token, method = 'GET', body } = {}) {
  await randomLatency()

  const [rawPath, queryString] = path.split('?')
  const normalizedPath = rawPath
  const queryParams = new URLSearchParams(queryString || '')

  if (method === 'GET' && normalizedPath === '/health') {
    return { status: 'ok' }
  }

  // Auth endpoints
  if (method === 'POST' && normalizedPath === '/auth/login') {
    return handleLogin(body)
  }
  if (method === 'GET' && normalizedPath === '/auth/me') {
    return handleMe(token)
  }

  // Customer Portal Endpoints (/me/*) - Strictly Customer Role
  if (normalizedPath === '/me/orders' && method === 'GET') {
    return handleGetMyOrders(token)
  }
  if (normalizedPath === '/me/bills' && method === 'GET') {
    return handleGetMyBills(token)
  }
  if (normalizedPath === '/me/balance' && method === 'GET') {
    return handleGetMyBalance(token)
  }
  if (normalizedPath === '/me/next-delivery' && method === 'GET') {
    return handleGetMyNextDelivery(token)
  }
  if (normalizedPath === '/me/delivery-status' && method === 'GET') {
    return handleGetMyDeliveryStatus(token)
  }
  if (normalizedPath === '/me/requests' && method === 'POST') {
    return handleCreateMyRequest(token, body)
  }

  // Customer cylinders
  const customerCylindersMatch = normalizedPath.match(/^\/customers\/([^\/]+)\/cylinders$/)
  if (customerCylindersMatch) {
    const customerId = customerCylindersMatch[1]
    if (method === 'GET') {
      return handleGetCustomerCylinders(token, customerId)
    }
  }

  // Customer ledger
  const customerLedgerMatch = normalizedPath.match(/^\/customers\/([^\/]+)\/ledger$/)
  if (customerLedgerMatch) {
    const customerId = customerLedgerMatch[1]
    if (method === 'GET') {
      return handleGetCustomerLedger(token, customerId)
    }
  }

  // Customer deliveries
  const customerDeliveriesMatch = normalizedPath.match(/^\/customers\/([^\/]+)\/deliveries$/)
  if (customerDeliveriesMatch) {
    const customerId = customerDeliveriesMatch[1]
    if (method === 'GET') {
      return handleGetCustomerDeliveries(token, customerId)
    }
  }

  // Customer collection endpoints
  if (normalizedPath === '/customers') {
    if (method === 'GET') {
      return handleGetCustomers(token)
    }
    if (method === 'POST') {
      return handleCreateCustomer(token, body)
    }
  }

  // Customer item endpoints
  const customerIdMatch = normalizedPath.match(/^\/customers\/([^\/]+)$/)
  if (customerIdMatch) {
    const customerId = customerIdMatch[1]
    if (method === 'GET') {
      return handleGetCustomer(token, customerId)
    }
    if (method === 'PUT' || method === 'PATCH') {
      return handleUpdateCustomer(token, customerId, body)
    }
    if (method === 'DELETE') {
      return handleDeleteCustomer(token, customerId)
    }
  }

  // Cylinder summary (must be before :id match)
  if (method === 'GET' && normalizedPath === '/cylinders/summary') {
    return handleGetCylinderSummary(token)
  }

  // Empty recovery ageing endpoint (mock-only)
  if (method === 'GET' && normalizedPath === '/recovery/ageing') {
    return handleGetRecoveryAgeing(token)
  }

  // Cylinder history endpoint
  const cylinderHistoryMatch = normalizedPath.match(/^\/cylinders\/(\d+)\/history$/)
  if (cylinderHistoryMatch) {
    const cylinderId = parseInt(cylinderHistoryMatch[1], 10)
    if (method === 'GET') {
      return handleGetCylinderHistory(token, cylinderId)
    }
  }

  // Cylinder transition endpoint
  const cylinderTransitionMatch = normalizedPath.match(/^\/cylinders\/(\d+)\/transition$/)
  if (cylinderTransitionMatch) {
    const cylinderId = parseInt(cylinderTransitionMatch[1], 10)
    if (method === 'POST') {
      return handleTransitionCylinder(token, cylinderId, body)
    }
  }

  // Cylinder collection endpoints (GET /cylinders, POST /cylinders)
  if (normalizedPath === '/cylinders') {
    if (method === 'GET') {
      return handleGetCylinders(token, queryParams)
    }
    if (method === 'POST') {
      return handleCreateCylinder(token, body)
    }
  }

  // Single cylinder endpoint (GET /cylinders/:id)
  const cylinderIdMatch = normalizedPath.match(/^\/cylinders\/(\d+)$/)
  if (cylinderIdMatch) {
    const cylinderId = parseInt(cylinderIdMatch[1], 10)
    if (method === 'GET') {
      return handleGetCylinder(token, cylinderId)
    }
  }

  // Planning & Dispatch endpoints
  if (method === 'GET' && normalizedPath === '/plan/today') {
    return handleGetPlan(token, queryParams)
  }
  if (method === 'POST' && normalizedPath === '/plan/publish') {
    return handlePublishPlan(token, body)
  }
  if (method === 'GET' && normalizedPath === '/routes') {
    return handleGetRoutes(token, queryParams)
  }
  const routeAssignMatch = normalizedPath.match(/^\/routes\/(\d+)\/assign$/)
  if (routeAssignMatch) {
    const routeId = parseInt(routeAssignMatch[1], 10)
    if (method === 'PATCH') {
      return handleAssignRoute(token, routeId, body)
    }
  }
  if (method === 'GET' && normalizedPath === '/my-routes') {
    return handleGetMyRoutes(token)
  }
  const deliverStopMatch = normalizedPath.match(/^\/route-stops\/(\d+)\/deliver$/)
  if (deliverStopMatch) {
    const stopId = parseInt(deliverStopMatch[1], 10)
    if (method === 'POST') {
      return handleDeliverStop(token, stopId, body)
    }
  }
  const skipStopMatch = normalizedPath.match(/^\/route-stops\/(\d+)\/skip$/)
  if (skipStopMatch) {
    const stopId = parseInt(skipStopMatch[1], 10)
    if (method === 'POST') {
      return handleSkipStop(token, stopId, body)
    }
  }
  if (normalizedPath === '/urgent') {
    if (method === 'GET') {
      return handleGetUrgent(token)
    }
    if (method === 'POST') {
      return handleCreateUrgent(token, body)
    }
  }
  if (method === 'POST' && normalizedPath === '/paths') {
    return handlePostPaths(token, body)
  }

  if (method === 'POST' && normalizedPath === '/sales') {
    return handlePostSale(token, body)
  }

  // Bills & Invoices endpoints
  if (normalizedPath === '/bills' || normalizedPath === '/billing/invoices') {
    if (method === 'GET') {
      return handleGetBills(token, queryParams)
    }
    if (method === 'POST') {
      return handleCreateBill(token, body)
    }
  }

  const singleBillMatch = normalizedPath.match(/^\/(?:bills|billing\/invoices)\/(\d+)$/)
  if (singleBillMatch) {
    const billId = parseInt(singleBillMatch[1], 10)
    if (method === 'GET') {
      return handleGetBill(token, billId)
    }
  }

  // Payments endpoints
  if (normalizedPath === '/payments') {
    if (method === 'GET') {
      return handleGetPayments(token, queryParams)
    }
    if (method === 'POST') {
      return handleRecordPayment(token, body)
    }
  }

  // Ledger endpoints (append-only)
  if (normalizedPath === '/ledger') {
    if (method === 'GET') {
      return handleGetLedger(token, queryParams)
    }
  }
  if (normalizedPath === '/ledger/correction') {
    if (method === 'POST') {
      return handlePostLedgerCorrection(token, body)
    }
  }

  // Debt ageing & Loans endpoint
  if (normalizedPath === '/billing/loans' || normalizedPath === '/billing/ageing' || normalizedPath === '/loans') {
    if (method === 'GET') {
      return handleGetLoans(token, queryParams)
    }
  }

  // Printable statement of account
  const statementMatch = normalizedPath.match(/^\/billing\/statements?\/(\d+)$/)
  if (statementMatch) {
    const custId = parseInt(statementMatch[1], 10)
    if (method === 'GET') {
      return handleGetCustomerStatement(token, custId)
    }
  }

  // Stock & Inventory endpoints
  if (method === 'GET' && normalizedPath === '/stock/summary') {
    return handleGetStockSummary(token)
  }
  if (method === 'GET' && normalizedPath === '/stock/movements') {
    return handleGetStockMovements(token)
  }
  if (normalizedPath === '/stock/purchases') {
    if (method === 'GET') {
      return handleGetPurchases(token, queryParams)
    }
    if (method === 'POST') {
      return handleCreatePurchase(token, body)
    }
  }

  const verifyPurchaseMatch = normalizedPath.match(/^\/stock\/purchases\/(\d+)\/verify$/)
  if (verifyPurchaseMatch) {
    const purchaseId = parseInt(verifyPurchaseMatch[1], 10)
    if (method === 'POST' || method === 'PATCH') {
      return handleVerifyPurchase(token, purchaseId)
    }
  }

  const singlePurchaseMatch = normalizedPath.match(/^\/stock\/purchases\/(\d+)$/)
  if (singlePurchaseMatch) {
    const purchaseId = parseInt(singlePurchaseMatch[1], 10)
    if (method === 'PUT' || method === 'PATCH') {
      return handleUpdatePurchase(token, purchaseId, body)
    }
  }

  // Dashboard summary endpoint (Phase F7)
  if (method === 'GET' && (normalizedPath === '/dashboard/summary' || normalizedPath === '/dashboard')) {
    return handleGetDashboardSummary(token)
  }

  // Reports endpoint (Phase F7 - Module 10)
  const reportMatch = normalizedPath.match(/^\/reports\/([a-zA-Z0-9_-]+)$/)
  if (reportMatch && method === 'GET') {
    return handleGetReport(token, reportMatch[1], queryParams)
  }
  if (normalizedPath === '/reports' && method === 'GET') {
    const reportType = queryParams.get('type') || 'sales'
    return handleGetReport(token, reportType, queryParams)
  }

  // Evaluation results endpoint (Phase F7 - Module 17)
  if (method === 'GET' && (normalizedPath === '/evaluation/results' || normalizedPath === '/evaluation')) {
    return handleGetEvaluationResults(token)
  }

  // Operating Expenses endpoints
  if (method === 'GET' && normalizedPath === '/expenses/fuel-estimate') {
    return handleGetFuelEstimate(token)
  }
  if (normalizedPath === '/expenses') {
    if (method === 'GET') {
      return handleGetExpenses(token, queryParams)
    }
    if (method === 'POST') {
      return handleCreateExpense(token, body)
    }
  }

  // Stock Settings endpoints
  if (normalizedPath === '/settings/stock' || normalizedPath === '/stock/settings') {
    if (method === 'GET') {
      return handleGetStockSettings(token)
    }
    if (method === 'PUT' || method === 'PATCH') {
      return handleUpdateStockSettings(token, body)
    }
  }

  // Agency Settings, Backup, Restore & Demo Reset
  if (normalizedPath === '/settings') {
    if (method === 'GET') {
      const res = handleGetSettings(token)
      if (res.status >= 400) throw new ApiError(res.status, res.data.detail)
      return res.data
    }
    if (method === 'PUT' || method === 'PATCH') {
      const res = handleUpdateSettings(token, body)
      if (res.status >= 400) throw new ApiError(res.status, res.data.detail)
      return res.data
    }
  }

  if (normalizedPath === '/settings/backup' || normalizedPath === '/backup') {
    if (method === 'GET') {
      const res = handleGetBackup(token)
      if (res.status >= 400) throw new ApiError(res.status, res.data.detail)
      return res.data
    }
  }

  if (normalizedPath === '/settings/restore' || normalizedPath === '/restore') {
    if (method === 'POST') {
      const res = handleRestoreBackup(token, body)
      if (res.status >= 400) throw new ApiError(res.status, res.data.detail)
      return res.data
    }
  }

  if (normalizedPath === '/settings/reset' || normalizedPath === '/demo/reset') {
    if (method === 'POST') {
      const res = handleResetDemoData(token)
      if (res.status >= 400) throw new ApiError(res.status, res.data.detail)
      return res.data
    }
  }

  // Audit & Chain Verification Endpoints
  if (method === 'GET' && normalizedPath === '/audit/verify') {
    const res = handleVerifyAudit(token, getDb())
    if (res.status >= 400) {
      throw new ApiError(res.status, res.data.detail || 'Audit verification error')
    }
    return res.data
  }
  if (method === 'GET' && (normalizedPath === '/audit/events' || normalizedPath === '/events')) {
    const res = handleGetAuditEvents(token, getDb())
    if (res.status >= 400) {
      throw new ApiError(res.status, res.data.detail || 'Audit events error')
    }
    return res.data
  }

  // AI Business Assistant (Could Item)
  if (method === 'POST' && (normalizedPath === '/assistant/chat' || normalizedPath === '/ai/chat')) {
    const res = handleAssistantChat(token, body)
    if (res.status >= 400) {
      throw new ApiError(res.status, res.data.detail || 'Assistant error')
    }
    return res.data
  }

  // Notes & Utilities Endpoints
  if (normalizedPath === '/notes') {
    if (method === 'GET') {
      const dateQuery = queryParams.get('date')
      const res = handleGetNotes(token, dateQuery)
      if (res.status >= 400) throw new ApiError(res.status, res.data.detail)
      return res.data
    }
    if (method === 'POST' || method === 'PUT') {
      const res = handleSaveNote(token, body)
      if (res.status >= 400) throw new ApiError(res.status, res.data.detail)
      return res.data
    }
  }
  const singleNoteMatch = normalizedPath.match(/^\/notes\/(\d+)$/)
  if (singleNoteMatch) {
    const noteId = parseInt(singleNoteMatch[1], 10)
    if (method === 'DELETE') {
      const res = handleDeleteNote(token, noteId)
      if (res.status >= 400) throw new ApiError(res.status, res.data.detail)
      return res.data
    }
  }

  // User endpoints
  if (method === 'GET' && normalizedPath === '/users') {
    return handleGetUsers(token)
  }
  if (method === 'POST' && normalizedPath === '/users') {
    return handleCreateUser(token, body)
  }
  const singleUserMatch = normalizedPath.match(/^\/users\/(\d+)$/)
  if (singleUserMatch) {
    const userId = parseInt(singleUserMatch[1], 10)
    if (method === 'PATCH' || method === 'PUT') {
      return handleUpdateUser(token, userId, body)
    }
  }

  throw new ApiError(404, `Mock endpoint not found: ${method} ${path}`)
}
