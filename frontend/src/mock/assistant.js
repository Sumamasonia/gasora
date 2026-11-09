// Mock AI Business Assistant - rule-based NLP answering from live mock state
// Module 20/21: "AI business assistant (Could): read-only chat that answers from mock data with keyword rules"
import { getDb } from './db.js'

export function handleAssistantChat(token, body) {
  const query = (body?.message || '').toLowerCase().trim()
  const db = getDb()

  if (!query) {
    return {
      status: 200,
      data: {
        reply: "Hello! I am your Gasora AI Business Assistant. Ask me anything about your current inventory, overdue balances, dispatch routes, or operational expenses.",
        suggestions: ["Who is overdue?", "Stock today", "Recent sales", "Urgent requests"],
        timestamp: new Date().toISOString(),
      },
    }
  }

  // 1. Overdue Accounts / Outstanding Debts
  if (query.includes('overdue') || query.includes('debt') || query.includes('unpaid') || query.includes('balance')) {
    const customers = db.customers || []
    const bills = db.bills || []
    const overdueThreshold = db.settings?.overdue_days || 15

    const overdueCustomers = customers.filter((c) => (c.balance || 0) > 0)
    const totalOutstanding = overdueCustomers.reduce((sum, c) => sum + (c.balance || 0), 0)

    if (overdueCustomers.length === 0) {
      return {
        status: 200,
        data: {
          reply: "✅ Excellent news! There are currently **no overdue customer balances** in the system. All customer accounts are fully settled.",
          suggestions: ["Stock today", "Recent sales", "Urgent requests"],
          timestamp: new Date().toISOString(),
        },
      }
    }

    const lines = overdueCustomers
      .sort((a, b) => (b.balance || 0) - (a.balance || 0))
      .slice(0, 5)
      .map(
        (c) =>
          `• **${c.name}** (${c.area || 'Faisalabad'}): **₨ ${c.balance.toLocaleString()}** (Contact: ${c.phone || 'N/A'})`
      )

    const reply = `⚠️ Found **${overdueCustomers.length} customer(s)** with outstanding balance totaling **₨ ${totalOutstanding.toLocaleString()}**:\n\n` +
      lines.join('\n') +
      (overdueCustomers.length > 5 ? `\n\n*...and ${overdueCustomers.length - 5} more account(s).*` : '') +
      `\n\n💡 *Payment terms: Invoices older than ${overdueThreshold} days are marked overdue.*`

    return {
      status: 200,
      data: {
        reply,
        suggestions: ["Stock today", "Recent sales", "Urgent requests"],
        timestamp: new Date().toISOString(),
      },
    }
  }

  // 2. Stock / Inventory Today
  if (query.includes('stock') || query.includes('cylinder') || query.includes('inventory')) {
    const cylinders = db.cylinders || []
    const filled = cylinders.filter((c) => c.status === 'filled').length
    const empty = cylinders.filter((c) => c.status === 'empty').length
    const atCustomer = cylinders.filter((c) => c.status === 'with_customer' || c.status === 'in_circulation').length
    const maintenance = cylinders.filter((c) => c.status === 'maintenance' || c.status === 'condemned').length
    const total = cylinders.length

    // Breakdown by weight
    const by11 = cylinders.filter((c) => (c.type || c.size) === '11.8 kg' && c.status === 'filled').length
    const by15 = cylinders.filter((c) => (c.type || c.size) === '15 kg' && c.status === 'filled').length
    const by45 = cylinders.filter((c) => (c.type || c.size) === '45.4 kg' && c.status === 'filled').length

    const lowStockLevel = db.settings?.low_stock_level || 25
    const isLow = filled < lowStockLevel

    const reply = `📦 **Depot Stock Summary Today:**\n\n` +
      `• **Filled Ready for Dispatch:** ${filled} cylinders ${isLow ? '⚠️ *(BELOW REORDER THRESHOLD)*' : '✅'}\n` +
      `• **Empty at Depot:** ${empty} cylinders\n` +
      `• **Circulating with Customers:** ${atCustomer} cylinders\n` +
      `• **In Maintenance / Test:** ${maintenance} cylinders\n` +
      `• **Total Fleet Assets:** ${total} cylinders\n\n` +
      `**Filled Inventory Breakdown by Size:**\n` +
      `• Domestic (11.8 kg): **${by11}** filled\n` +
      `• Commercial (15.0 kg): **${by15}** filled\n` +
      `• Industrial (45.4 kg): **${by45}** filled\n\n` +
      (isLow ? `🚨 **Alert:** Filled stock (${filled}) is below the minimum buffer of ${lowStockLevel}. Consider placing a bulk refill purchase.` : `Depot buffer is healthy.`)

    return {
      status: 200,
      data: {
        reply,
        suggestions: ["Who is overdue?", "Recent sales", "Urgent requests"],
        timestamp: new Date().toISOString(),
      },
    }
  }

  // 3. Sales / Revenue / Billing
  if (query.includes('sale') || query.includes('revenue') || query.includes('bill') || query.includes('income')) {
    const bills = db.bills || []
    const totalBilled = bills.reduce((sum, b) => sum + (b.total_amount || b.amount || 0), 0)
    const paidBills = bills.filter((b) => b.status === 'paid')
    const totalCollected = paidBills.reduce((sum, b) => sum + (b.total_amount || b.amount || 0), 0)
    const pendingCollection = totalBilled - totalCollected

    const reply = `💰 **Sales & Revenue Snapshot:**\n\n` +
      `• **Total Invoices Issued:** ${bills.length} invoices\n` +
      `• **Gross Billed Value:** **₨ ${totalBilled.toLocaleString()}**\n` +
      `• **Realized Collections:** **₨ ${totalCollected.toLocaleString()}** (${bills.length ? Math.round((totalCollected / totalBilled) * 100) : 0}% recovery rate)\n` +
      `• **Pending Receivables:** **₨ ${pendingCollection.toLocaleString()}**\n\n` +
      `*Latest transaction:* Invoice #${bills[bills.length - 1]?.id || 'N/A'} for ₨ ${(bills[bills.length - 1]?.total_amount || 0).toLocaleString()} to ${bills[bills.length - 1]?.customer_name || 'Customer'}.`

    return {
      status: 200,
      data: {
        reply,
        suggestions: ["Who is overdue?", "Stock today", "Operating expenses"],
        timestamp: new Date().toISOString(),
      },
    }
  }

  // 4. Urgent Requests / Emergency Dispatches
  if (query.includes('urgent') || query.includes('emergency') || query.includes('priority')) {
    const urgent = (db.urgent_requests || []).filter((u) => u.status !== 'completed' && u.status !== 'cancelled')

    if (urgent.length === 0) {
      return {
        status: 200,
        data: {
          reply: "✅ No pending urgent requests right now! All emergency demands have been serviced or incorporated into dispatch.",
          suggestions: ["Who is overdue?", "Stock today", "Active routes"],
          timestamp: new Date().toISOString(),
        },
      }
    }

    const lines = urgent.map(
      (u) => `• **${u.name || 'Customer'}** (ID #${u.customer_id}): "${u.note || 'Urgent refill'}" [Status: ${u.status}]`
    )

    const reply = `🚨 **Attention:** There are **${urgent.length} open urgent request(s)** awaiting dispatch planning:\n\n` +
      lines.join('\n') +
      `\n\n*Urgent requests receive priority slotting on the next routing engine run.*`

    return {
      status: 200,
      data: {
        reply,
        suggestions: ["Active routes", "Stock today", "Who is overdue?"],
        timestamp: new Date().toISOString(),
      },
    }
  }

  // 5. Routes / Dispatch / Drivers
  if (query.includes('route') || query.includes('driver') || query.includes('dispatch') || query.includes('delivery')) {
    const routes = db.deliveries || []
    const drivers = (db.users || []).filter((u) => u.role === 'driver')

    const reply = `🚚 **Dispatch & Operations Status:**\n\n` +
      `• **Registered Drivers:** ${drivers.length} driver(s) (${drivers.map((d) => d.name || d.username).join(', ') || 'None'})\n` +
      `• **Active Route Deliveries:** ${routes.length} stops recorded\n` +
      `• **Depot Hub:** ${db.settings?.depot?.name || 'Main Depot Faisalabad'}\n\n` +
      `Drivers receive optimized stop sequences and record empty cylinder pickups at each customer location.`

    return {
      status: 200,
      data: {
        reply,
        suggestions: ["Urgent requests", "Stock today", "Who is overdue?"],
        timestamp: new Date().toISOString(),
      },
    }
  }

  // 6. Expenses / Operating Costs
  if (query.includes('expense') || query.includes('cost') || query.includes('fuel') || query.includes('operating')) {
    const expenses = db.expenses || []
    const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || e.amount_pkr || 0), 0)

    const categories = {}
    expenses.forEach((e) => {
      const cat = e.category || 'General'
      categories[cat] = (categories[cat] || 0) + (e.amount || e.amount_pkr || 0)
    })

    const catLines = Object.entries(categories).map(
      ([cat, amt]) => `• ${cat}: **₨ ${amt.toLocaleString()}**`
    )

    const reply = `💸 **Operating Expenses Summary:**\n\n` +
      `• **Total Recorded Expenses:** **₨ ${totalExpenses.toLocaleString()}**\n\n` +
      `**Category Breakdown:**\n` +
      (catLines.join('\n') || '• No category expenses logged yet.')

    return {
      status: 200,
      data: {
        reply,
        suggestions: ["Recent sales", "Stock today", "Who is overdue?"],
        timestamp: new Date().toISOString(),
      },
    }
  }

  // 7. Fallback / General Help
  return {
    status: 200,
    data: {
      reply: `I understand operational questions about your LPG agency. Here are common questions I can answer directly from your live database:\n\n` +
        `• *"Who is overdue?"* — lists customers with unpaid invoices and outstanding debt.\n` +
        `• *"Stock today"* — shows depot filled and empty cylinders, size breakdown, and buffer alerts.\n` +
        `• *"Recent sales"* — provides revenue, billed totals, and collection rates.\n` +
        `• *"Urgent requests"* — surfaces open emergency cylinder orders.\n` +
        `• *"Operating expenses"* — breaks down operational costs and fuel expenditure.\n` +
        `• *"Active routes"* — checks driver delivery progress and vehicle allocations.`,
      suggestions: ["Who is overdue?", "Stock today", "Recent sales", "Urgent requests"],
      timestamp: new Date().toISOString(),
    },
  }
}
