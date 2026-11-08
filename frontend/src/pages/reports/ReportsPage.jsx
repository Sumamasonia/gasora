import { useEffect, useMemo, useState } from 'react'
import { getReportData } from '../../api'
import EmptyState from '../../components/EmptyState'
import Spinner from '../../components/Spinner'
import { exportToCsv } from '../../lib/csv.js'
import './reports.css'

const REPORT_TABS = [
  { id: 'sales', label: 'Sales & Invoices', icon: '💰' },
  { id: 'expenses', label: 'Operating Expenses', icon: '💸' },
  { id: 'loans', label: 'Loans & Receivables', icon: '💳' },
  { id: 'stock', label: 'Depot Stock & Assets', icon: '📦' },
  { id: 'deliveries', label: 'Fleet Deliveries Log', icon: '🚚' },
  { id: 'empties_ageing', label: 'Empties Recovery Ageing', icon: '🛢️' },
]

export default function ReportsPage({ auth, onNavigate }) {
  const [selectedReport, setSelectedReport] = useState('sales')
  const [datePreset, setDatePreset] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const [reportData, setReportData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Compute preset dates
  const handlePresetSelect = (preset) => {
    setDatePreset(preset)
    const now = new Date()
    const todayStr = now.toISOString().split('T')[0]

    if (preset === 'all') {
      setFromDate('')
      setToDate('')
    } else if (preset === '30d') {
      const past = new Date(now.getTime() - 30 * 86400000)
      setFromDate(past.toISOString().split('T')[0])
      setToDate(todayStr)
    } else if (preset === 'this_month') {
      const y = now.getFullYear()
      const m = String(now.getMonth() + 1).padStart(2, '0')
      setFromDate(`${y}-${m}-01`)
      setToDate(todayStr)
    } else if (preset === 'last_month') {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)
      setFromDate(lastMonth.toISOString().split('T')[0])
      setToDate(lastMonthEnd.toISOString().split('T')[0])
    } else if (preset === 'ytd') {
      setFromDate(`${now.getFullYear()}-01-01`)
      setToDate(todayStr)
    }
  }

  // Load report data
  const loadData = async () => {
    try {
      setLoading(true)
      setError('')
      const params = {}
      if (fromDate) params.from_date = fromDate
      if (toDate) params.to_date = toDate
      if (searchQuery) params.search = searchQuery

      const data = await getReportData(auth.token, selectedReport, params)
      setReportData(data)
    } catch (err) {
      setError(err.message || `Failed to generate ${selectedReport} report`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [auth.token, selectedReport, fromDate, toDate, searchQuery])

  // Helpers
  const formatPkr = (val) => `PKR ${(Number(val) || 0).toLocaleString()}`

  // CSV Export handler
  const handleExportCsv = () => {
    if (!reportData || !reportData.rows || reportData.rows.length === 0) {
      alert('No rows available to export.')
      return
    }

    const rows = reportData.rows
    const todayStr = new Date().toISOString().split('T')[0]
    let columns = []

    if (selectedReport === 'sales') {
      columns = [
        { key: 'date', label: 'Date' },
        { key: 'invoice_no', label: 'Invoice #' },
        { key: 'customer_name', label: 'Customer' },
        { key: 'customer_code', label: 'Code' },
        { key: 'customer_area', label: 'Area' },
        { key: 'cylinder_type', label: 'Cylinder' },
        { key: 'quantity', label: 'Quantity' },
        { key: 'unit_price', label: 'Unit Rate (PKR)' },
        { key: 'total', label: 'Total Invoiced (PKR)' },
        { key: 'paid_amount', label: 'Paid Amount (PKR)' },
        { key: 'balance_due', label: 'Balance Due (PKR)' },
        { key: 'status', label: 'Status' },
      ]
    } else if (selectedReport === 'expenses') {
      columns = [
        { key: 'date', label: 'Date' },
        { key: 'category', label: 'Category' },
        { key: 'amount', label: 'Amount (PKR)' },
        { key: 'note', label: 'Description' },
        { key: 'vehicle_id', label: 'Vehicle' },
        { key: 'actor', label: 'Logged By' },
      ]
    } else if (selectedReport === 'loans') {
      columns = [
        { key: 'customer_name', label: 'Customer' },
        { key: 'customer_code', label: 'Code' },
        { key: 'phone', label: 'Phone' },
        { key: 'area', label: 'Area' },
        { key: 'total_balance', label: 'Outstanding Balance (PKR)' },
        { key: 'deposit', label: 'Deposit Held (PKR)' },
        { key: 'unsecured_risk', label: 'Unsecured Exposure (PKR)' },
        { key: 'current', label: 'Current 0-30d (PKR)' },
        { key: 'days_31_60', label: '31-60d (PKR)' },
        { key: 'days_61_90', label: '61-90d (PKR)' },
        { key: 'days_90_plus', label: '90+d (PKR)' },
        { key: 'last_payment_date', label: 'Last Payment Date' },
      ]
    } else if (selectedReport === 'stock') {
      columns = [
        { key: 'cylinder_type', label: 'Cylinder Type' },
        { key: 'total_assets', label: 'Total Registered' },
        { key: 'filled', label: 'Filled in Depot' },
        { key: 'empty_total', label: 'Empty in Depot' },
        { key: 'delivered', label: 'Delivered (with Customers)' },
        { key: 'threshold', label: 'Safety Threshold' },
        { key: 'status', label: 'Stock Status' },
      ]
    } else if (selectedReport === 'deliveries') {
      columns = [
        { key: 'date', label: 'Date' },
        { key: 'id', label: 'Delivery ID' },
        { key: 'customer_name', label: 'Customer' },
        { key: 'driver_name', label: 'Driver' },
        { key: 'vehicle_no', label: 'Vehicle' },
        { key: 'cylinder_type', label: 'Specification' },
        { key: 'cylinders_delivered', label: 'Delivered Qty' },
        { key: 'cylinders_collected', label: 'Collected Empties' },
        { key: 'interval_days', label: 'Refill Interval (Days)' },
        { key: 'notes', label: 'Notes' },
      ]
    } else if (selectedReport === 'empties_ageing') {
      columns = [
        { key: 'serial_no', label: 'Serial #' },
        { key: 'customer_name', label: 'Customer' },
        { key: 'cylinder_type', label: 'Cylinder' },
        { key: 'days_held', label: 'Days Held' },
        { key: 'bucket', label: 'Ageing Bucket' },
        { key: 'due_date', label: 'Return Due Date' },
        { key: 'deposit_held', label: 'Deposit Held (PKR)' },
      ]
    }

    exportToCsv(rows, columns, `gasora-${selectedReport}-report-${todayStr}.csv`)
  }

  // Print handler
  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="reports-container">
      {/* Print-Only Company Header */}
      <div className="print-only-header">
        <div className="print-company-name">Gasora LPG Distribution &amp; Delivery Intelligence</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>
          {reportData?.title || 'Operational Report'}
        </div>
        <div className="print-meta-row">
          <span>Date Range: {fromDate || 'Inception'} to {toDate || 'Present'}</span>
          <span>Printed on: {new Date().toLocaleString()} by {auth.username}</span>
        </div>
      </div>

      {/* Screen Header */}
      <div className="reports-header">
        <div>
          <h1>Reports &amp; Business Intelligence</h1>
          <p>
            Audit-grade operational records, financial ledgers, depot stock reconciliations, and fleet delivery logs.
          </p>
        </div>

        <div className="reports-header-actions">
          <span className="demo-data-badge">⚡ Demo Data (Mock Reconciled)</span>
          <button type="button" className="secondary" onClick={handleExportCsv} title="Download CSV spreadsheet">
            📥 Export CSV
          </button>
          <button type="button" className="secondary" onClick={handlePrint} title="Print or save as PDF">
            🖨️ Print Report
          </button>
        </div>
      </div>

      {/* Report Selection Tabs */}
      <div className="report-tabs-bar" role="tablist" aria-label="Select report type">
        {REPORT_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selectedReport === tab.id}
            className={`report-tab-btn ${selectedReport === tab.id ? 'active' : ''}`}
            onClick={() => {
              setSelectedReport(tab.id)
            }}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Filters Box */}
      <div className="reports-filter-box">
        <div className="filter-row">
          {/* Quick Date Range Presets */}
          <div className="date-preset-pills">
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginRight: 4 }}>Period:</span>
            {[
              { id: 'all', label: 'All Time' },
              { id: '30d', label: 'Last 30 Days' },
              { id: 'this_month', label: 'This Month' },
              { id: 'last_month', label: 'Last Month' },
              { id: 'ytd', label: 'Year to Date' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                className={`date-preset-pill ${datePreset === p.id ? 'active' : ''}`}
                onClick={() => handlePresetSelect(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="search-box-wrap">
            <span className="search-icon-inside">🔍</span>
            <input
              type="text"
              placeholder={`Search in ${REPORT_TABS.find((t) => t.id === selectedReport)?.label}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Custom Date Pickers */}
        <div className="custom-date-inputs">
          <span>From:</span>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value)
              setDatePreset('custom')
            }}
          />
          <span>To:</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value)
              setDatePreset('custom')
            }}
          />
          {(fromDate || toDate) && (
            <button
              type="button"
              className="btn-sm secondary"
              onClick={() => handlePresetSelect('all')}
              style={{ padding: '3px 8px', fontSize: 11 }}
            >
              Clear Dates
            </button>
          )}
        </div>
      </div>

      {/* Loading & Error States */}
      {loading && (
        <div style={{ padding: '50px 0', textAlign: 'center' }}>
          <Spinner size="lg" message="Compiling report rows and calculating financial balances..." />
        </div>
      )}

      {error && !loading && (
        <div className="error banner">
          ⚠️ {error}
          <button type="button" className="btn-sm" onClick={loadData} style={{ marginLeft: 12 }}>
            Retry
          </button>
        </div>
      )}

      {/* Summary KPI Strip */}
      {!loading && !error && reportData && (
        <>
          <div className="report-kpi-strip">
            {selectedReport === 'sales' && (
              <>
                <div className="report-kpi-card">
                  <span className="label">Total Invoiced</span>
                  <span className="val">{formatPkr(reportData.summary?.total_sales)}</span>
                  <span className="sub">{reportData.summary?.records_count} Invoices</span>
                </div>
                <div className="report-kpi-card">
                  <span className="label">Total Paid</span>
                  <span className="val" style={{ color: '#16a34a' }}>
                    {formatPkr(reportData.summary?.total_paid)}
                  </span>
                  <span className="sub">Direct Payments Received</span>
                </div>
                <div className="report-kpi-card">
                  <span className="label">Outstanding Balance</span>
                  <span className="val" style={{ color: '#d97706' }}>
                    {formatPkr(reportData.summary?.total_balance)}
                  </span>
                  <span className="sub">Unsettled Receivables</span>
                </div>
                <div className="report-kpi-card">
                  <span className="label">Cylinders Supplied</span>
                  <span className="val">{reportData.summary?.total_quantity} Units</span>
                  <span className="sub">Total Volume Invoiced</span>
                </div>
              </>
            )}

            {selectedReport === 'expenses' && (
              <>
                <div className="report-kpi-card">
                  <span className="label">Total Logged</span>
                  <span className="val" style={{ color: '#dc2626' }}>
                    {formatPkr(reportData.summary?.total_amount)}
                  </span>
                  <span className="sub">{reportData.summary?.records_count} Entries</span>
                </div>
                <div className="report-kpi-card">
                  <span className="label">Fuel Total</span>
                  <span className="val">{formatPkr(reportData.summary?.by_category?.fuel)}</span>
                  <span className="sub">Diesel for Fleet</span>
                </div>
                <div className="report-kpi-card">
                  <span className="label">Facility Rent</span>
                  <span className="val">{formatPkr(reportData.summary?.by_category?.rent)}</span>
                  <span className="sub">Depot Premises</span>
                </div>
                <div className="report-kpi-card">
                  <span className="label">Salaries &amp; Repairs</span>
                  <span className="val">
                    {formatPkr(
                      (reportData.summary?.by_category?.salary || 0) +
                        (reportData.summary?.by_category?.repair || 0)
                    )}
                  </span>
                  <span className="sub">Staff &amp; Equipment</span>
                </div>
              </>
            )}

            {selectedReport === 'loans' && (
              <>
                <div className="report-kpi-card">
                  <span className="label">Total Receivables</span>
                  <span className="val" style={{ color: '#ea580c' }}>
                    {formatPkr(reportData.summary?.total_receivables)}
                  </span>
                  <span className="sub">{reportData.summary?.debtor_count} Active Debtors</span>
                </div>
                <div className="report-kpi-card">
                  <span className="label">Unsecured Exposure</span>
                  <span className="val" style={{ color: '#dc2626' }}>
                    {formatPkr(reportData.summary?.unsecured_risk)}
                  </span>
                  <span className="sub">Exceeding Deposit Held</span>
                </div>
                <div className="report-kpi-card">
                  <span className="label">Overdue &gt; 30 Days</span>
                  <span className="val">{formatPkr(reportData.summary?.overdue_30_days)}</span>
                  <span className="sub">Awaiting Follow-up</span>
                </div>
                <div className="report-kpi-card">
                  <span className="label">Overdue &gt; 90 Days</span>
                  <span className="val" style={{ color: '#991b1b' }}>
                    {formatPkr(reportData.summary?.overdue_90_days)}
                  </span>
                  <span className="sub">High-Risk Balance</span>
                </div>
              </>
            )}

            {selectedReport === 'stock' && (
              <>
                <div className="report-kpi-card">
                  <span className="label">Total Assets</span>
                  <span className="val">{reportData.summary?.total_cylinders} Cylinders</span>
                  <span className="sub">Full Registered Fleet</span>
                </div>
                <div className="report-kpi-card">
                  <span className="label">Depot Filled</span>
                  <span className="val" style={{ color: '#16a34a' }}>
                    {reportData.summary?.total_filled} Units
                  </span>
                  <span className="sub">Ready for Immediate Route</span>
                </div>
                <div className="report-kpi-card">
                  <span className="label">In Refill Loop</span>
                  <span className="val">{reportData.summary?.total_empty} Units</span>
                  <span className="sub">Empty &amp; Recovered</span>
                </div>
                <div className="report-kpi-card">
                  <span className="label">With Customers</span>
                  <span className="val" style={{ color: '#2563eb' }}>
                    {reportData.summary?.total_delivered} Units
                  </span>
                  <span className="sub">Active Customer Possession</span>
                </div>
              </>
            )}

            {selectedReport === 'deliveries' && (
              <>
                <div className="report-kpi-card">
                  <span className="label">Total Refills</span>
                  <span className="val">{reportData.summary?.total_deliveries} Drops</span>
                  <span className="sub">Completed Stops</span>
                </div>
                <div className="report-kpi-card">
                  <span className="label">Cylinders Supplied</span>
                  <span className="val" style={{ color: '#16a34a' }}>
                    {reportData.summary?.cylinders_delivered} Delivered
                  </span>
                  <span className="sub">Filled Bottles Dispatched</span>
                </div>
                <div className="report-kpi-card">
                  <span className="label">Empties Returned</span>
                  <span className="val" style={{ color: '#2563eb' }}>
                    {reportData.summary?.cylinders_collected} Recovered
                  </span>
                  <span className="sub">Swapped At Drop</span>
                </div>
                <div className="report-kpi-card">
                  <span className="label">Average Refill Cycle</span>
                  <span className="val">{reportData.summary?.avg_interval_days} Days</span>
                  <span className="sub">Customer Interval Mean</span>
                </div>
              </>
            )}

            {selectedReport === 'empties_ageing' && (
              <>
                <div className="report-kpi-card">
                  <span className="label">In Customer Possession</span>
                  <span className="val">{reportData.summary?.total_delivered} Cylinders</span>
                  <span className="sub">Delivered State</span>
                </div>
                <div className="report-kpi-card">
                  <span className="label">Ready for Swap</span>
                  <span className="val" style={{ color: '#2563eb' }}>
                    {reportData.summary?.swap_candidates_count} Units
                  </span>
                  <span className="sub">Held &ge; 15 Days</span>
                </div>
                <div className="report-kpi-card">
                  <span className="label">Held &gt; 30 Days</span>
                  <span className="val" style={{ color: '#ea580c' }}>
                    {reportData.summary?.overdue_30_plus} Units
                  </span>
                  <span className="sub">Recovery Overdue</span>
                </div>
                <div className="report-kpi-card">
                  <span className="label">Held &gt; 60 Days</span>
                  <span className="val" style={{ color: '#dc2626' }}>
                    {reportData.summary?.overdue_60_plus} Units
                  </span>
                  <span className="sub">Critical Asset Risk</span>
                </div>
              </>
            )}
          </div>

          {/* Table Preview Card */}
          <div className="report-table-card">
            <div className="report-table-toolbar">
              <span className="report-table-title">
                {reportData.title} &middot; {reportData.rows.length} rows preview
              </span>
              <span className="muted" style={{ fontSize: 12 }}>
                Use Export CSV for full raw data spreadsheet
              </span>
            </div>

            {reportData.rows.length === 0 ? (
              <EmptyState
                icon="🔍"
                title="No Matching Records"
                message="No records match your selected date range and filter criteria. Try expanding the date range."
                actionLabel="Reset to All Time"
                onAction={() => handlePresetSelect('all')}
              />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="report-data-table">
                  {/* SALES REPORT TABLE */}
                  {selectedReport === 'sales' && (
                    <>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Invoice #</th>
                          <th>Customer</th>
                          <th>Area</th>
                          <th>Cylinder</th>
                          <th className="num-col">Qty</th>
                          <th className="num-col">Rate</th>
                          <th className="num-col">Total</th>
                          <th className="num-col">Paid</th>
                          <th className="num-col">Balance</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.rows.map((r) => (
                          <tr key={r.id}>
                            <td>{r.date}</td>
                            <td>
                              <strong>{r.invoice_no}</strong>
                            </td>
                            <td>
                              <div>{r.customer_name}</div>
                              <span className="muted" style={{ fontSize: 11 }}>
                                {r.customer_code}
                              </span>
                            </td>
                            <td>{r.customer_area}</td>
                            <td>{r.cylinder_type}</td>
                            <td className="num-col">{r.quantity}</td>
                            <td className="num-col">{formatPkr(r.unit_price)}</td>
                            <td className="num-col">
                              <strong>{formatPkr(r.total)}</strong>
                            </td>
                            <td className="num-col" style={{ color: '#16a34a' }}>
                              {formatPkr(r.paid_amount)}
                            </td>
                            <td className="num-col" style={{ color: r.balance_due > 0 ? '#ea580c' : '#64748b' }}>
                              {formatPkr(r.balance_due)}
                            </td>
                            <td>
                              <span
                                className={`badge ${
                                  r.status === 'paid' ? 'badge-success' : r.status === 'partial' ? 'badge-warning' : 'badge-danger'
                                }`}
                                style={{ textTransform: 'capitalize' }}
                              >
                                {r.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </>
                  )}

                  {/* EXPENSES REPORT TABLE */}
                  {selectedReport === 'expenses' && (
                    <>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Category</th>
                          <th>Description / Note</th>
                          <th>Vehicle</th>
                          <th>Logged By</th>
                          <th className="num-col">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.rows.map((r) => (
                          <tr key={r.id}>
                            <td>{r.date}</td>
                            <td>
                              <span className="pill" style={{ textTransform: 'capitalize' }}>
                                {r.category}
                              </span>
                            </td>
                            <td>{r.note}</td>
                            <td>{r.vehicle_id}</td>
                            <td>{r.actor}</td>
                            <td className="num-col">
                              <strong>{formatPkr(r.amount)}</strong>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </>
                  )}

                  {/* LOANS REPORT TABLE */}
                  {selectedReport === 'loans' && (
                    <>
                      <thead>
                        <tr>
                          <th>Customer</th>
                          <th>Area</th>
                          <th className="num-col">Total Debt</th>
                          <th className="num-col">Deposit Held</th>
                          <th className="num-col">Unsecured</th>
                          <th className="num-col">Current (0-30d)</th>
                          <th className="num-col">31-60d</th>
                          <th className="num-col">61-90d</th>
                          <th className="num-col">90+d</th>
                          <th>Last Payment</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.rows.map((r) => (
                          <tr key={r.customer_id}>
                            <td>
                              <strong>{r.customer_name}</strong>
                              <div className="muted" style={{ fontSize: 11 }}>
                                {r.customer_code} &middot; {r.phone}
                              </div>
                            </td>
                            <td>{r.area}</td>
                            <td className="num-col">
                              <strong style={{ color: r.total_balance > 0 ? '#ea580c' : '#16a34a' }}>
                                {formatPkr(r.total_balance)}
                              </strong>
                            </td>
                            <td className="num-col">{formatPkr(r.deposit)}</td>
                            <td className="num-col">
                              <span style={{ color: r.unsecured_risk > 0 ? '#dc2626' : '#64748b', fontWeight: 600 }}>
                                {formatPkr(r.unsecured_risk)}
                              </span>
                            </td>
                            <td className="num-col">{formatPkr(r.current)}</td>
                            <td className="num-col">{formatPkr(r.days_31_60)}</td>
                            <td className="num-col">{formatPkr(r.days_61_90)}</td>
                            <td className="num-col" style={{ color: r.days_90_plus > 0 ? '#dc2626' : undefined }}>
                              {formatPkr(r.days_90_plus)}
                            </td>
                            <td>{r.last_payment_date}</td>
                          </tr>
                        ))}
                      </tbody>
                    </>
                  )}

                  {/* STOCK REPORT TABLE */}
                  {selectedReport === 'stock' && (
                    <>
                      <thead>
                        <tr>
                          <th>Cylinder Specification</th>
                          <th className="num-col">Total Registered</th>
                          <th className="num-col">Filled in Depot</th>
                          <th className="num-col">Empty / In-Refill</th>
                          <th className="num-col">With Customers</th>
                          <th className="num-col">Safety Min</th>
                          <th>Health Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.rows.map((r) => (
                          <tr key={r.cylinder_type}>
                            <td>
                              <strong>{r.cylinder_type}</strong>
                            </td>
                            <td className="num-col">{r.total_assets}</td>
                            <td className="num-col" style={{ fontWeight: 600, color: '#16a34a' }}>
                              {r.filled}
                            </td>
                            <td className="num-col">{r.empty_total}</td>
                            <td className="num-col">{r.delivered}</td>
                            <td className="num-col">{r.threshold}</td>
                            <td>
                              <span
                                className={`badge ${r.is_low ? 'badge-danger' : 'badge-success'}`}
                              >
                                {r.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </>
                  )}

                  {/* DELIVERIES REPORT TABLE */}
                  {selectedReport === 'deliveries' && (
                    <>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Customer</th>
                          <th>Driver &amp; Vehicle</th>
                          <th>Type</th>
                          <th className="num-col">Delivered</th>
                          <th className="num-col">Collected</th>
                          <th className="num-col">Cycle</th>
                          <th>Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.rows.map((r) => (
                          <tr key={r.id}>
                            <td>{r.date}</td>
                            <td>
                              <strong>{r.customer_name}</strong>
                            </td>
                            <td>
                              <div>{r.driver_name}</div>
                              <span className="muted" style={{ fontSize: 11 }}>
                                {r.vehicle_no}
                              </span>
                            </td>
                            <td>{r.cylinder_type}</td>
                            <td className="num-col">
                              <strong>{r.cylinders_delivered}</strong>
                            </td>
                            <td className="num-col">{r.cylinders_collected}</td>
                            <td className="num-col">{r.interval_days} days</td>
                            <td>{r.notes}</td>
                          </tr>
                        ))}
                      </tbody>
                    </>
                  )}

                  {/* EMPTIES AGEING REPORT TABLE */}
                  {selectedReport === 'empties_ageing' && (
                    <>
                      <thead>
                        <tr>
                          <th>Serial #</th>
                          <th>Holder Customer</th>
                          <th>Specification</th>
                          <th className="num-col">Days Held</th>
                          <th>Ageing Bucket</th>
                          <th>Due Date</th>
                          <th className="num-col">Deposit Held</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.rows.map((r) => (
                          <tr key={r.cylinder_id}>
                            <td>
                              <strong>{r.serial_no}</strong>
                            </td>
                            <td>
                              <div>{r.customer_name}</div>
                              <span className="muted" style={{ fontSize: 11 }}>
                                {r.customer_area}
                              </span>
                            </td>
                            <td>{r.cylinder_type}</td>
                            <td className="num-col">
                              <strong style={{ color: r.days_held >= 30 ? '#dc2626' : undefined }}>
                                {r.days_held} days
                              </strong>
                            </td>
                            <td>
                              <span
                                className={`badge ${
                                  r.bucket === '0-14'
                                    ? 'badge-success'
                                    : r.bucket === '15-29'
                                    ? 'badge-info'
                                    : r.bucket === '30-59'
                                    ? 'badge-warning'
                                    : 'badge-danger'
                                }`}
                              >
                                {r.bucket} days
                              </span>
                            </td>
                            <td>{r.due_date}</td>
                            <td className="num-col">{formatPkr(r.deposit_held)}</td>
                            <td>
                              {r.is_swap_candidate && (
                                <button
                                  type="button"
                                  className="btn-sm secondary"
                                  onClick={() => onNavigate('dispatch')}
                                >
                                  Schedule Swap
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </>
                  )}
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
