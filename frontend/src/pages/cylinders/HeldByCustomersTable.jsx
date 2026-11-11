import { useMemo, useState } from 'react'
import DataTable from '../../components/DataTable.jsx'

export default function HeldByCustomersTable({
  summary,
  customers = [],
  onNavigate,
  onFilterCustomerInRegister,
}) {
  const [search, setSearch] = useState('')

  // Map of customers by ID for fast lookup of metadata (area, phone, code, deposit, type)
  const customerMap = useMemo(() => {
    const map = new Map()
    customers.forEach((c) => map.set(c.id, c))
    return map
  }, [customers])

  // Extract held_by_customers list from summary, enriched with customer details
  const heldList = useMemo(() => {
    const rawList = summary?.held_by_customers || []
    return rawList.map((item) => {
      const cust = customerMap.get(item.customer_id)
      return {
        ...item,
        code: cust?.code || `C${String(item.customer_id).padStart(4, '0')}`,
        phone: cust?.phone || '—',
        area: cust?.area || '—',
        customer_type: cust?.customer_type || 'Domestic',
        deposit: cust?.deposit || 0,
        is_active: cust?.is_active ?? true,
      }
    })
  }, [summary, customerMap])

  // Total empties outstanding
  const emptiesOutstandingTotal = useMemo(() => {
    return heldList.reduce((acc, curr) => acc + (curr.cylinders || 0), 0)
  }, [heldList])

  // Filtered list based on search
  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return heldList
    return heldList.filter((item) => {
      return (
        (item.name && item.name.toLowerCase().includes(q)) ||
        (item.code && item.code.toLowerCase().includes(q)) ||
        (item.area && item.area.toLowerCase().includes(q)) ||
        (item.phone && item.phone.toLowerCase().includes(q))
      )
    })
  }, [heldList, search])

  const columns = [
    {
      key: 'code',
      label: 'Code',
      render: (val, row) => (
        <span
          className="code-badge"
          style={{ cursor: 'pointer' }}
          onClick={(e) => {
            e.stopPropagation()
            if (onNavigate) onNavigate(`customers/${row.customer_id}`)
          }}
          title="Go to customer profile"
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
          onClick={(e) => {
            e.stopPropagation()
            if (onNavigate) onNavigate(`customers/${row.customer_id}`)
          }}
          title="Go to customer profile"
        >
          {val}
          {!row.is_active && (
            <span className="badge-inactive" style={{ marginLeft: 8, fontSize: 11 }}>
              Inactive
            </span>
          )}
        </button>
      ),
    },
    {
      key: 'customer_type',
      label: 'Type',
      render: (val) => (
        <span
          style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: 'var(--radius-full)',
            fontSize: 12,
            fontWeight: 600,
            background: val === 'Commercial' ? 'rgba(2, 132, 199, 0.12)' : 'var(--bg-subtle)',
            color: val === 'Commercial' ? 'var(--color-primary)' : 'var(--text-secondary)',
          }}
        >
          {val}
        </span>
      ),
    },
    {
      key: 'area',
      label: 'Area / Location',
      render: (val) => val || '—',
    },
    {
      key: 'phone',
      label: 'Contact Phone',
      render: (val) => val || '—',
    },
    {
      key: 'cylinders',
      label: 'Empties Outstanding',
      render: (val) => (
        <span
          style={{
            fontWeight: 700,
            fontSize: 14,
            color: 'var(--text-primary)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#7b1fa2',
            }}
          />
          {val} {val === 1 ? 'cylinder' : 'cylinders'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      render: (_, row) => (
        <div className="table-actions" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="secondary table-action-btn"
            onClick={() => onNavigate && onNavigate(`customers/${row.customer_id}`)}
            title="Open customer profile"
          >
            Profile ➔
          </button>
          {onFilterCustomerInRegister && (
            <button
              type="button"
              className="ghost table-action-btn"
              onClick={() => onFilterCustomerInRegister(row.customer_id)}
              title="Show only cylinders held by this customer in register"
            >
              View in Register
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Top Highlight Summary Banner */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
        }}
      >
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderLeft: '5px solid #7b1fa2',
            borderRadius: 'var(--radius-lg)',
            padding: '18px 20px',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <span className="muted" style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase' }}>
            Empties Outstanding Total
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-primary)' }}>
              {emptiesOutstandingTotal}
            </span>
            <span className="muted" style={{ fontSize: 13 }}>
              cylinders in customer field
            </span>
          </div>
          <span className="muted" style={{ fontSize: 12 }}>
            Delivered cylinders currently held by customer accounts
          </span>
        </div>

        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            padding: '18px 20px',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <span className="muted" style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase' }}>
            Customers Holding Stock
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-primary)' }}>
              {heldList.length}
            </span>
            <span className="muted" style={{ fontSize: 13 }}>
              active accounts
            </span>
          </div>
          <span className="muted" style={{ fontSize: 12 }}>
            Accounts with 1 or more cylinders
          </span>
        </div>

        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            padding: '18px 20px',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <span className="muted" style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase' }}>
            Average Holdings
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-primary)' }}>
              {heldList.length > 0 ? (emptiesOutstandingTotal / heldList.length).toFixed(1) : 0}
            </span>
            <span className="muted" style={{ fontSize: 13 }}>
              cylinders / customer
            </span>
          </div>
          <span className="muted" style={{ fontSize: 12 }}>
            Field distribution density
          </span>
        </div>
      </div>

      {/* Filter / Search Card */}
      <div className="cylinders-toolbar-card">
        <div className="filter-row">
          <div className="search-input-wrap">
            <span className="search-icon-inside" aria-hidden="true">
              🔍
            </span>
            <input
              type="search"
              placeholder="Filter by customer name, code, phone, or area..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Filter customers holding cylinders"
            />
          </div>
          {search.trim() && (
            <button type="button" className="ghost" onClick={() => setSearch('')}>
              Clear
            </button>
          )}
        </div>
        <div className="filter-counts-summary">
          <span>
            Showing <strong>{filteredList.length}</strong> of {heldList.length} customer accounts
            {search.trim() && ' (filtered)'}
          </span>
          <span className="muted" style={{ fontSize: 12 }}>
            Click any customer to open their profile and view full delivery and cylinder histories.
          </span>
        </div>
      </div>

      {/* Held by Customers Table */}
      <DataTable
        columns={columns}
        data={filteredList}
        searchable={false}
        pageSize={5}
        onRowClick={(row) => onNavigate && onNavigate(`customers/${row.customer_id}`)}
        emptyTitle="No customers currently hold cylinders"
        emptyDescription="All delivered cylinders have been returned to the depot or none match your search."
      />
    </div>
  )
}
