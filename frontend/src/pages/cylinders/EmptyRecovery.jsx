import { useCallback, useEffect, useMemo, useState } from 'react'
import { createUrgent, getRecoveryAgeing } from '../../api.js'
import DataTable from '../../components/DataTable.jsx'
import NotReady from '../../components/NotReady.jsx'
import Spinner from '../../components/Spinner.jsx'
import { useToast } from '../../components/Toast.jsx'

const ESTIMATED_CYLINDER_VALUE_PKR = 6000

export default function EmptyRecovery({ auth, onNavigate }) {
  const { showToast } = useToast()

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Sub-filter for bucket click: null | '0-14' | '15-29' | '30-59' | '60-89' | '90+'
  const [selectedBucket, setSelectedBucket] = useState(null)
  const [search, setSearch] = useState('')

  // Track cylinders added to urgent plan: Set of cylinder IDs
  const [addedPlanIds, setAddedPlanIds] = useState(new Set())
  const [addingId, setAddingId] = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getRecoveryAgeing(auth.token)
      setData(res)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [auth.token])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Handle Add to Next Plan
  const handleAddToPlan = async (item) => {
    setAddingId(item.cylinder_id)
    try {
      const note = `Empty recovery request: ${item.serial_no} (${item.days_held}d held at ${item.customer_name})`
      await createUrgent(auth.token, item.customer_id, note)
      setAddedPlanIds((prev) => new Set([...prev, item.cylinder_id]))
      showToast(`Added ${item.serial_no} (${item.customer_name}) to next dispatch plan`, 'success')
    } catch (err) {
      showToast(err.message || 'Failed to add to dispatch plan', 'danger')
    } finally {
      setAddingId(null)
    }
  }

  // Handle Add All Candidates for Customer
  const handleAddCustomerToPlan = async (customerSummary) => {
    const custCandidates = (customerSummary.cylinders || []).filter(
      (c) => c.is_swap_candidate && !addedPlanIds.has(c.cylinder_id)
    )
    if (custCandidates.length === 0) return

    setAddingId(`cust-${customerSummary.customer_id}`)
    try {
      const note = `Empty recovery swap: ${custCandidates.length} cylinder(s) held (max ${customerSummary.max_days_held}d)`
      await createUrgent(auth.token, customerSummary.customer_id, note)
      setAddedPlanIds((prev) => {
        const next = new Set(prev)
        custCandidates.forEach((c) => next.add(c.cylinder_id))
        return next
      })
      showToast(
        `Added ${customerSummary.name} (${custCandidates.length} swap cylinders) to next dispatch plan`,
        'success'
      )
    } catch (err) {
      showToast(err.message || 'Failed to add customer swap to plan', 'danger')
    } finally {
      setAddingId(null)
    }
  }

  // Print Handler
  const handlePrint = () => {
    window.print()
  }

  // NotReady check if endpoint missing
  if (error && (error.status === 404 || error.status === 0)) {
    return <NotReady endpoint="GET /recovery/ageing" />
  }

  // Filtered swap candidates
  const filteredCandidates = useMemo(() => {
    if (!data?.swap_candidates) return []
    return data.swap_candidates.filter((item) => {
      if (selectedBucket && item.bucket !== selectedBucket) {
        return false
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        return (
          (item.serial_no && item.serial_no.toLowerCase().includes(q)) ||
          (item.customer_name && item.customer_name.toLowerCase().includes(q)) ||
          (item.customer_code && item.customer_code.toLowerCase().includes(q)) ||
          (item.customer_area && item.customer_area.toLowerCase().includes(q))
        )
      }
      return true
    })
  }, [data?.swap_candidates, selectedBucket, search])

  // Filtered customer summaries
  const filteredCustomers = useMemo(() => {
    if (!data?.customers) return []
    return data.customers.filter((c) => {
      if (selectedBucket) {
        const hasBucket = c.cylinders && c.cylinders.some((cyl) => cyl.bucket === selectedBucket)
        if (!hasBucket) return false
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        return (
          (c.name && c.name.toLowerCase().includes(q)) ||
          (c.code && c.code.toLowerCase().includes(q)) ||
          (c.area && c.area.toLowerCase().includes(q))
        )
      }
      return true
    })
  }, [data?.customers, selectedBucket, search])

  // Candidates table columns
  const candidateColumns = [
    {
      key: 'serial_no',
      label: 'Serial Number',
      render: (val) => <span className="code-badge">{val}</span>,
    },
    {
      key: 'customer_name',
      label: 'Customer / Holder',
      render: (val, row) => (
        <button
          type="button"
          className="ghost"
          style={{
            padding: 0,
            minHeight: 'auto',
            fontWeight: 600,
            color: 'var(--color-primary)',
            textAlign: 'left',
          }}
          onClick={() => onNavigate && onNavigate(`customers/${row.customer_id}`)}
          title="Open customer profile"
        >
          {val}
          <span className="muted" style={{ display: 'block', fontSize: 11, fontWeight: 400 }}>
            {row.customer_area} • {row.customer_phone}
          </span>
        </button>
      ),
    },
    {
      key: 'cylinder_type',
      label: 'Size',
      render: (val) => <span style={{ fontWeight: 600 }}>{val}</span>,
    },
    {
      key: 'delivered_at',
      label: 'Delivery Date',
      render: (val) => (val ? new Date(val).toLocaleDateString() : '—'),
    },
    {
      key: 'days_held',
      label: 'Days Held',
      render: (val, row) => {
        let badgeCls = 'badge-recovered'
        if (val >= 90) badgeCls = 'badge-empty'
        else if (val >= 60) badgeCls = 'badge-delivered'

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className={badgeCls} style={{ width: 'fit-content' }}>
              {val} days
            </span>
            <span className="muted" style={{ fontSize: 11 }}>
              Bucket: {row.bucket}
            </span>
          </div>
        )
      },
    },
    {
      key: 'due_date',
      label: 'Return Due',
      render: (val, row) => (
        <span style={{ color: row.is_overdue ? 'var(--color-danger)' : 'var(--text-primary)' }}>
          {val || '—'} {row.is_overdue && '⚠️'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Next Dispatch Plan',
      sortable: false,
      render: (_, row) => {
        const isAdded = addedPlanIds.has(row.cylinder_id)
        const isBusy = addingId === row.cylinder_id

        return (
          <button
            type="button"
            className={isAdded ? 'ghost' : 'secondary'}
            disabled={isAdded || isBusy}
            onClick={() => handleAddToPlan(row)}
            style={{
              fontSize: 12,
              padding: '5px 12px',
              minHeight: 'auto',
              color: isAdded ? 'var(--color-success)' : undefined,
              fontWeight: 600,
            }}
            title={isAdded ? 'Already scheduled for next dispatch' : 'Create urgent recovery request'}
          >
            {isBusy ? 'Adding...' : isAdded ? '✓ Added to Plan' : '+ Add to Next Plan'}
          </button>
        )
      },
    },
  ]

  // Customer Deposit vs Empties Table Columns
  const customerColumns = [
    {
      key: 'code',
      label: 'Code',
      render: (val, row) => (
        <span
          className="code-badge"
          style={{ cursor: 'pointer' }}
          onClick={() => onNavigate && onNavigate(`customers/${row.customer_id}`)}
        >
          {val}
        </span>
      ),
    },
    {
      key: 'name',
      label: 'Customer Name',
      render: (val, row) => (
        <button
          type="button"
          className="ghost"
          style={{
            padding: 0,
            minHeight: 'auto',
            fontWeight: 600,
            color: 'var(--color-primary)',
            textAlign: 'left',
          }}
          onClick={() => onNavigate && onNavigate(`customers/${row.customer_id}`)}
        >
          {val}
          <span className="muted" style={{ display: 'block', fontSize: 11, fontWeight: 400 }}>
            {row.area}
          </span>
        </button>
      ),
    },
    {
      key: 'pending_empties',
      label: 'Pending Empties',
      render: (val) => (
        <span style={{ fontWeight: 700, fontSize: 14 }}>
          {val} {val === 1 ? 'cyl' : 'cyls'}
        </span>
      ),
    },
    {
      key: 'max_days_held',
      label: 'Longest Held',
      render: (val) => (
        <span style={{ fontWeight: 600, color: val >= 30 ? 'var(--color-danger)' : 'var(--text-primary)' }}>
          {val} days
        </span>
      ),
    },
    {
      key: 'deposit_pkr',
      label: 'Deposit on File',
      render: (val) => `Rs. ${(val || 0).toLocaleString()}`,
    },
    {
      key: 'asset_value',
      label: 'Est. Asset Value',
      render: (_, row) => {
        const estVal = (row.pending_empties || 0) * ESTIMATED_CYLINDER_VALUE_PKR
        return `Rs. ${estVal.toLocaleString()}`
      },
    },
    {
      key: 'coverage',
      label: 'Deposit vs Assets',
      render: (_, row) => {
        const estVal = (row.pending_empties || 0) * ESTIMATED_CYLINDER_VALUE_PKR
        const deposit = row.deposit_pkr || 0
        const diff = deposit - estVal

        if (diff >= 0) {
          return (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)',
                fontSize: 12,
                fontWeight: 600,
                background: 'rgba(22, 101, 52, 0.1)',
                color: 'var(--color-success)',
              }}
            >
              ✓ Covered
            </span>
          )
        }
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)',
              fontSize: 12,
              fontWeight: 600,
              background: 'rgba(220, 38, 38, 0.1)',
              color: 'var(--color-danger)',
            }}
          >
            ⚠️ Gap: Rs. {Math.abs(diff).toLocaleString()}
          </span>
        )
      },
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      render: (_, row) => {
        const unaddedSwapCount = (row.cylinders || []).filter(
          (c) => c.is_swap_candidate && !addedPlanIds.has(c.cylinder_id)
        ).length
        const isBusy = addingId === `cust-${row.customer_id}`

        return (
          <div className="table-actions" onClick={(e) => e.stopPropagation()}>
            {unaddedSwapCount > 0 ? (
              <button
                type="button"
                className="secondary table-action-btn"
                disabled={isBusy}
                onClick={() => handleAddCustomerToPlan(row)}
                title="Create urgent recovery request for all swap cylinders"
              >
                {isBusy ? 'Adding...' : `+ Plan Swap (${unaddedSwapCount})`}
              </button>
            ) : (
              <button
                type="button"
                className="ghost table-action-btn"
                onClick={() => onNavigate && onNavigate(`customers/${row.customer_id}`)}
              >
                Profile ➔
              </button>
            )}
          </div>
        )
      },
    },
  ]

  const buckets = data?.buckets || {
    '0-14': 0,
    '15-29': 0,
    '30-59': 0,
    '60-89': 0,
    '90+': 0,
  }

  return (
    <div className="empty-recovery-container" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Print-Only Header */}
      <div className="print-only" style={{ display: 'none' }}>
        <div className="print-page-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '18pt' }}>GASORA LPG DISTRIBUTION</h2>
              <h3 style={{ margin: '4px 0 0', fontSize: '13pt', color: '#555' }}>
                Cylinder Empty Recovery & Ageing Audit Report
              </h3>
            </div>
            <div style={{ textAlign: 'right', fontSize: '10pt', color: '#666' }}>
              <div>Generated: {new Date().toLocaleString()}</div>
              <div>Auditor: {auth?.username} ({auth?.role})</div>
              <div>Total Field Cylinders: {data?.total_delivered || 0}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Screen Header Controls (Hidden on Print) */}
      <div className="cylinders-header no-print">
        <div className="cylinders-title-wrap">
          <h2 style={{ fontSize: 20, margin: 0, fontWeight: 700 }}>
            Empty Recovery & Ageing Analysis
          </h2>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Monitor days held, audit collateral security deposits, and schedule swap candidates
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="ghost" onClick={loadData} disabled={loading}>
            🔄 Refresh
          </button>
          <button type="button" className="secondary" onClick={handlePrint}>
            🖨️ Print Ageing Report
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <Spinner size="lg" message="Computing cylinder field ageing & collateral risk..." />
        </div>
      ) : (
        <>
          {/* Ageing Buckets Summary Cards */}
          <div className="no-print">
            <div className="lifecycle-header" style={{ marginBottom: 10 }}>
              <span className="lifecycle-title">Field Duration Buckets (Days Since Delivery)</span>
              {selectedBucket && (
                <button
                  type="button"
                  className="ghost"
                  style={{ padding: '2px 8px', fontSize: 12 }}
                  onClick={() => setSelectedBucket(null)}
                >
                  Clear bucket filter (Showing: {selectedBucket} days)
                </button>
              )}
            </div>

            <div className="ageing-buckets-grid">
              {/* Bucket 0-14 */}
              <div
                className={`bucket-card bucket-0-14 ${selectedBucket === '0-14' ? 'active-filter' : ''}`}
                style={{
                  cursor: 'pointer',
                  outline: selectedBucket === '0-14' ? '2px solid var(--color-success)' : undefined,
                }}
                onClick={() => setSelectedBucket(selectedBucket === '0-14' ? null : '0-14')}
                title="Click to filter by 0-14 days"
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>
                    0–14 Days
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--color-success)', fontWeight: 600 }}>
                    Active Refill
                  </span>
                </div>
                <div style={{ fontSize: 28, fontWeight: 800 }}>{buckets['0-14']}</div>
                <span className="muted" style={{ fontSize: 11 }}>
                  Within normal cycle
                </span>
              </div>

              {/* Bucket 15-29 */}
              <div
                className={`bucket-card bucket-15-29 ${selectedBucket === '15-29' ? 'active-filter' : ''}`}
                style={{
                  cursor: 'pointer',
                  outline: selectedBucket === '15-29' ? '2px solid #f59e0b' : undefined,
                }}
                onClick={() => setSelectedBucket(selectedBucket === '15-29' ? null : '15-29')}
                title="Click to filter by 15-29 days"
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>
                    15–29 Days
                  </span>
                  <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>
                    Swap Due ⚡
                  </span>
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#f59e0b' }}>
                  {buckets['15-29']}
                </div>
                <span className="muted" style={{ fontSize: 11 }}>
                  Empty swap candidates
                </span>
              </div>

              {/* Bucket 30-59 */}
              <div
                className={`bucket-card bucket-30-59 ${selectedBucket === '30-59' ? 'active-filter' : ''}`}
                style={{
                  cursor: 'pointer',
                  outline: selectedBucket === '30-59' ? '2px solid #ea580c' : undefined,
                }}
                onClick={() => setSelectedBucket(selectedBucket === '30-59' ? null : '30-59')}
                title="Click to filter by 30-59 days"
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>
                    30–59 Days
                  </span>
                  <span style={{ fontSize: 11, color: '#ea580c', fontWeight: 600 }}>
                    Overdue
                  </span>
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#ea580c' }}>
                  {buckets['30-59']}
                </div>
                <span className="muted" style={{ fontSize: 11 }}>
                  Overdue follow-up
                </span>
              </div>

              {/* Bucket 60-89 */}
              <div
                className={`bucket-card bucket-60-89 ${selectedBucket === '60-89' ? 'active-filter' : ''}`}
                style={{
                  cursor: 'pointer',
                  outline: selectedBucket === '60-89' ? '2px solid var(--color-danger)' : undefined,
                }}
                onClick={() => setSelectedBucket(selectedBucket === '60-89' ? null : '60-89')}
                title="Click to filter by 60-89 days"
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>
                    60–89 Days
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--color-danger)', fontWeight: 600 }}>
                    Critical ⚠️
                  </span>
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--color-danger)' }}>
                  {buckets['60-89']}
                </div>
                <span className="muted" style={{ fontSize: 11 }}>
                  Severe dormancy
                </span>
              </div>

              {/* Bucket 90+ */}
              <div
                className={`bucket-card bucket-90plus ${selectedBucket === '90+' ? 'active-filter' : ''}`}
                style={{
                  cursor: 'pointer',
                  outline: selectedBucket === '90+' ? '2px solid #7b1fa2' : undefined,
                }}
                onClick={() => setSelectedBucket(selectedBucket === '90+' ? null : '90+')}
                title="Click to filter by 90+ days"
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>
                    90+ Days
                  </span>
                  <span style={{ fontSize: 11, color: '#7b1fa2', fontWeight: 600 }}>
                    High Risk
                  </span>
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#7b1fa2' }}>
                  {buckets['90+']}
                </div>
                <span className="muted" style={{ fontSize: 11 }}>
                  Asset recovery priority
                </span>
              </div>
            </div>
          </div>

          {/* Filter Bar (No Print) */}
          <div className="cylinders-toolbar-card no-print">
            <div className="filter-row">
              <div className="search-input-wrap">
                <span className="search-icon-inside" aria-hidden="true">
                  🔍
                </span>
                <input
                  type="search"
                  placeholder="Search by customer, serial number, area, or code..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Filter recovery candidates"
                />
              </div>
              {(search.trim() || selectedBucket) && (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setSearch('')
                    setSelectedBucket(null)
                  }}
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>

          {/* SECTION 1: Swap Candidates (15+ Days) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                  ⚡ Swap Candidates (15+ Days Held)
                </h3>
                <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
                  Cylinders past the standard 15-day return window ready for empty recovery on the next route
                </p>
              </div>
              <span className="muted" style={{ fontSize: 12 }}>
                {filteredCandidates.length} candidate(s)
              </span>
            </div>

            <DataTable
              columns={candidateColumns}
              data={filteredCandidates}
              searchable={false}
              pageSize={5}
              emptyTitle="No swap candidates found"
              emptyDescription={
                selectedBucket
                  ? `No swap candidates in bucket ${selectedBucket} matching criteria.`
                  : 'All field cylinders are within their first 14 days of delivery.'
              }
            />
          </div>

          {/* SECTION 2: Deposit vs Pending Empties per Customer */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                  🛡️ Deposit vs. Pending Empties per Customer
                </h3>
                <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
                  Assesses whether the customer&apos;s security deposit adequately covers the replacement value of unreturned cylinders
                </p>
              </div>
              <span className="muted" style={{ fontSize: 12 }}>
                Valuation rate: Rs. {ESTIMATED_CYLINDER_VALUE_PKR.toLocaleString()} / cylinder
              </span>
            </div>

            <DataTable
              columns={customerColumns}
              data={filteredCustomers}
              searchable={false}
              pageSize={5}
              emptyTitle="No customer data"
              emptyDescription="No customers holding delivered cylinders matching current filters."
            />
          </div>

          {/* Print Only Summary Table */}
          <div className="print-only" style={{ display: 'none', marginTop: 24 }}>
            <h3>Full Cylinder Ageing Register</h3>
            <table>
              <thead>
                <tr>
                  <th>Serial #</th>
                  <th>Size</th>
                  <th>Customer</th>
                  <th>Area</th>
                  <th>Delivery Date</th>
                  <th>Days Held</th>
                  <th>Due Date</th>
                  <th>Bucket</th>
                </tr>
              </thead>
              <tbody>
                {(data?.cylinders || []).map((c) => (
                  <tr key={c.cylinder_id}>
                    <td>{c.serial_no}</td>
                    <td>{c.cylinder_type}</td>
                    <td>{c.customer_name}</td>
                    <td>{c.customer_area}</td>
                    <td>{new Date(c.delivered_at).toLocaleDateString()}</td>
                    <td>{c.days_held} days</td>
                    <td>{c.due_date}</td>
                    <td>{c.bucket}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
