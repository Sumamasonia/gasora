import { useCallback, useEffect, useMemo, useState } from 'react'
import { getCustomers } from '../../api'
import DataTable from '../../components/DataTable'
import KpiTile from '../../components/KpiTile'
import NotReady from '../../components/NotReady'
import Spinner from '../../components/Spinner'
import CustomerDeactivateModal from './CustomerDeactivateModal'
import CustomerModal from './CustomerModal'
import './customers.css'

export default function CustomerList({ auth, onNavigate, onOpenToggleActive }) {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [deactivateModalOpen, setDeactivateModalOpen] = useState(false)
  const [togglingCustomer, setTogglingCustomer] = useState(null)

  // Filters
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all') // 'all' | 'domestic' | 'commercial'
  const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'active' | 'inactive'
  const [areaFilter, setAreaFilter] = useState('all')

  const fetchCustomers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getCustomers(auth.token)
      setCustomers(data || [])
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [auth.token])

  useEffect(() => {
    fetchCustomers()
  }, [fetchCustomers])

  const handleOpenCreate = () => {
    setSelectedCustomer(null)
    setModalOpen(true)
  }

  const handleOpenEdit = (cust) => {
    setSelectedCustomer(cust)
    setModalOpen(true)
  }

  const handleOpenToggleActive = (cust) => {
    setTogglingCustomer(cust)
    setDeactivateModalOpen(true)
  }

  const handleCustomerSaved = () => {
    fetchCustomers()
  }

  // Extract unique areas from loaded customers for the dropdown
  const uniqueAreas = useMemo(() => {
    const set = new Set()
    customers.forEach((c) => {
      if (c.area) set.add(c.area.trim())
    })
    return Array.from(set).sort()
  }, [customers])

  // KPI Calculations
  const stats = useMemo(() => {
    const total = customers.length
    const active = customers.filter((c) => c.is_active !== false).length
    const inactive = total - active
    const commercial = customers.filter((c) => c.customer_type === 'commercial').length
    const domestic = customers.filter((c) => c.customer_type === 'domestic').length
    return { total, active, inactive, commercial, domestic }
  }, [customers])

  // Filtered customer list
  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      // Search matching code, name, phone, area
      if (search.trim()) {
        const q = search.toLowerCase()
        const matchesCode = c.code ? c.code.toLowerCase().includes(q) : false
        const matchesName = c.name ? c.name.toLowerCase().includes(q) : false
        const matchesPhone = c.phone ? c.phone.toLowerCase().includes(q) : false
        const matchesArea = c.area ? c.area.toLowerCase().includes(q) : false
        if (!matchesCode && !matchesName && !matchesPhone && !matchesArea) {
          return false
        }
      }

      // Filter by type
      if (typeFilter !== 'all' && c.customer_type !== typeFilter) {
        return false
      }

      // Filter by status
      if (statusFilter === 'active' && c.is_active === false) {
        return false
      }
      if (statusFilter === 'inactive' && c.is_active !== false) {
        return false
      }

      // Filter by area
      if (areaFilter !== 'all' && c.area !== areaFilter) {
        return false
      }

      return true
    })
  }, [customers, search, typeFilter, statusFilter, areaFilter])

  // Check if any filter is active
  const hasActiveFilters = search.trim() !== '' || typeFilter !== 'all' || statusFilter !== 'all' || areaFilter !== 'all'

  const clearFilters = () => {
    setSearch('')
    setTypeFilter('all')
    setStatusFilter('all')
    setAreaFilter('all')
  }

  // NotReady check if real backend lacks the endpoint (e.g. 404)
  if (error && (error.status === 404 || error.status === 0)) {
    return <NotReady endpoint="GET /customers" />
  }

  // Columns definition for DataTable
  const columns = [
    {
      key: 'code',
      label: 'Customer ID',
      render: (val, row) => (
        <span className="code-badge">{val || `C${String(row.id).padStart(4, '0')}`}</span>
      ),
    },
    {
      key: 'name',
      label: 'Customer Name',
      render: (val, row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{val}</div>
          <div className="muted" style={{ fontSize: 12 }}>{row.address}</div>
        </div>
      ),
    },
    {
      key: 'phone',
      label: 'Phone',
      render: (val) => <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{val}</span>,
    },
    {
      key: 'area',
      label: 'Area',
      render: (val) => val || '—',
    },
    {
      key: 'customer_type',
      label: 'Type',
      render: (val) => (
        <span className={val === 'commercial' ? 'badge-commercial' : 'badge-domestic'}>
          {val === 'commercial' ? '🏢 Commercial' : '🏠 Domestic'}
        </span>
      ),
    },
    {
      key: 'cylinder_type',
      label: 'Cylinder',
      render: (val) => val || '11.8 kg',
    },
    {
      key: 'demand',
      label: 'Demand',
      render: (val) => `${val || 1} cyl/order`,
    },
    {
      key: 'deposit',
      label: 'Deposit',
      render: (val) => (val !== undefined ? `PKR ${(val || 0).toLocaleString()}` : '—'),
    },
    {
      key: 'is_active',
      label: 'Status',
      render: (val) => (
        <span className={val !== false ? 'badge-active' : 'badge-inactive'}>
          {val !== false ? '● Active' : '○ Inactive'}
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
            onClick={() => onNavigate(`customers/${row.id}`)}
            title="View customer profile"
          >
            Profile
          </button>
          <button
            type="button"
            className="ghost table-action-btn"
            onClick={() => handleOpenEdit(row)}
            title="Edit customer"
          >
            Edit
          </button>
          <button
            type="button"
            className={row.is_active !== false ? 'ghost table-action-btn' : 'secondary table-action-btn'}
            onClick={() => handleOpenToggleActive(row)}
            title={row.is_active !== false ? 'Deactivate customer' : 'Reactivate customer'}
            style={{ color: row.is_active !== false ? 'var(--color-danger)' : 'var(--color-success)' }}
          >
            {row.is_active !== false ? 'Deactivate' : 'Reactivate'}
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="customers-page">
      {/* Top Header & Quick Actions */}
      <div className="customers-header">
        <div className="customers-title-wrap">
          <h1>Customer Management</h1>
          <p className="muted">Manage customer directory, LPG cylinder allocations, and delivery profiles</p>
        </div>
        <div className="customers-header-actions">
          <button type="button" onClick={handleOpenCreate}>
            + Add Customer
          </button>
        </div>
      </div>

      {/* KPI Tiles Header */}
      <div className="customers-kpi-grid">
        <KpiTile
          title="Total Registered"
          value={stats.total}
          subtitle="All directory accounts"
          icon="👥"
          onClick={() => setStatusFilter('all')}
        />
        <KpiTile
          title="Active in Planning"
          value={stats.active}
          subtitle="Available for daily routes"
          icon="✅"
          trend={{ positive: true, label: `${Math.round((stats.active / (stats.total || 1)) * 100)}% active` }}
          onClick={() => setStatusFilter('active')}
        />
        <KpiTile
          title="Inactive / Paused"
          value={stats.inactive}
          subtitle="Excluded from dispatch"
          icon="⏸️"
          onClick={() => setStatusFilter('inactive')}
        />
        <KpiTile
          title="Commercial Accounts"
          value={stats.commercial}
          subtitle="Restaurants & bakeries"
          icon="🏢"
          onClick={() => setTypeFilter('commercial')}
        />
        <KpiTile
          title="Domestic Households"
          value={stats.domestic}
          subtitle="11.8 kg home delivery"
          icon="🏠"
          onClick={() => setTypeFilter('domestic')}
        />
      </div>

      {/* Search & Filter Toolbar */}
      <div className="customers-filter-card">
        <div className="filter-row">
          <div className="search-input-wrap">
            <span className="search-icon-inside" aria-hidden="true">🔍</span>
            <input
              type="search"
              placeholder="Search by name, phone (03xx), area, or ID (C0001)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search customers"
            />
          </div>

          <select
            className="filter-select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Filter by customer type"
          >
            <option value="all">All Types</option>
            <option value="commercial">Commercial</option>
            <option value="domestic">Domestic</option>
          </select>

          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by account status"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>

          <select
            className="filter-select"
            value={areaFilter}
            onChange={(e) => setAreaFilter(e.target.value)}
            aria-label="Filter by delivery area"
          >
            <option value="all">All Areas ({uniqueAreas.length})</option>
            {uniqueAreas.map((area) => (
              <option key={area} value={area}>{area}</option>
            ))}
          </select>

          {hasActiveFilters && (
            <button type="button" className="ghost" onClick={clearFilters}>
              Reset Filters
            </button>
          )}
        </div>

        <div className="filter-counts-summary">
          <span>
            Showing <strong>{filteredCustomers.length}</strong> of {customers.length} total customers
            {hasActiveFilters && ' (filtered)'}
          </span>
          {stats.inactive > 0 && (
            <span className="muted">
              Note: Inactive customers are greyed out and excluded from daily dispatch routes.
            </span>
          )}
        </div>
      </div>

      {/* Main Customers Table */}
      {loading ? (
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <Spinner size="lg" message="Loading customer directory..." />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={filteredCustomers}
          searchable={false}
          onRowClick={(row) => onNavigate(`customers/${row.id}`)}
          rowClassName={(row) => (row.is_active === false ? 'row-inactive' : '')}
          emptyTitle="No customers match your criteria"
          emptyDescription="Try clearing your search query or filters to view all customer accounts."
        />
      )}

      <CustomerModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        customer={selectedCustomer}
        token={auth.token}
        onSuccess={handleCustomerSaved}
      />

      <CustomerDeactivateModal
        isOpen={deactivateModalOpen}
        onClose={() => setDeactivateModalOpen(false)}
        customer={togglingCustomer}
        token={auth.token}
        onSuccess={handleCustomerSaved}
      />
    </div>
  )
}
