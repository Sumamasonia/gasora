import { useCallback, useEffect, useMemo, useState } from 'react'
import { getCustomers, getCylinders, getCylinderSummary } from '../../api.js'
import DataTable from '../../components/DataTable.jsx'
import NotReady from '../../components/NotReady.jsx'
import Spinner from '../../components/Spinner.jsx'
import AddCylinderModal from './AddCylinderModal.jsx'
import CylinderDetailDrawer from './CylinderDetailDrawer.jsx'
import CylinderSummaryStrip from './CylinderSummaryStrip.jsx'
import EmptyRecovery from './EmptyRecovery.jsx'
import HeldByCustomersTable from './HeldByCustomersTable.jsx'
import './cylinders.css'

export default function CylinderRegister({ auth, onNavigate, onSelectCylinder, route, onExpired }) {
  const isOwner = auth?.role === 'owner'

  const initialTab =
    route === 'cylinders/recovery' ? 'recovery' : route === 'cylinders/held' ? 'held' : 'register'
  const [activeTab, setActiveTab] = useState(initialTab)

  useEffect(() => {
    if (route === 'cylinders/recovery') setActiveTab('recovery')
    else if (route === 'cylinders/held') setActiveTab('held')
    else if (route === 'cylinders') setActiveTab('register')
  }, [route])

  const handleTabChange = (tab) => {
    setActiveTab(tab)
    if (onNavigate) {
      if (tab === 'recovery') onNavigate('cylinders/recovery')
      else if (tab === 'held') onNavigate('cylinders/held')
      else onNavigate('cylinders')
    }
  }

  const [summary, setSummary] = useState(null)
  const [cylinders, setCylinders] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Filters
  const [search, setSearch] = useState('')
  const [selectedState, setSelectedState] = useState(null) // 'Empty' | 'Filled' | 'Delivered' | 'Recovered' | null
  const [selectedOwner, setSelectedOwner] = useState('all') // 'all' | 'Company' | 'Customer'
  const [selectedType, setSelectedType] = useState('all') // 'all' | '11.8 kg' | '15 kg' | '45.4 kg'
  const [selectedHolder, setSelectedHolder] = useState('all')

  // Add Cylinder Modal
  const [addModalOpen, setAddModalOpen] = useState(false)
  // Selected cylinder for detail drawer
  const [selectedCylinderId, setSelectedCylinderId] = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [sumData, cylsData, custsData] = await Promise.all([
        getCylinderSummary(auth.token).catch(() => null),
        getCylinders(auth.token),
        getCustomers(auth.token).catch(() => []),
      ])
      setSummary(sumData)
      setCylinders(cylsData || [])
      setCustomers(custsData || [])
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [auth.token])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Customer map for rapid holder lookups
  const customerMap = useMemo(() => {
    const map = new Map()
    customers.forEach((c) => map.set(c.id, c))
    return map
  }, [customers])

  // Customers currently holding cylinders for dropdown filter
  const holdingCustomers = useMemo(() => {
    const set = new Set()
    cylinders.forEach((c) => {
      if (c.customer_id) set.add(c.customer_id)
    })
    return Array.from(set)
      .map((cid) => customerMap.get(cid) || { id: cid, name: `Customer #${cid}` })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [cylinders, customerMap])

  // Filtered cylinders list
  const filteredCylinders = useMemo(() => {
    return cylinders.filter((c) => {
      // Search by serial_no
      if (search.trim()) {
        const q = search.trim().toUpperCase()
        if (!c.serial_no.toUpperCase().includes(q)) return false
      }

      // Filter by state
      if (selectedState && c.state !== selectedState) {
        return false
      }

      // Filter by owner
      if (selectedOwner !== 'all' && c.owner !== selectedOwner) {
        return false
      }

      // Filter by type
      if (selectedType !== 'all' && c.cylinder_type !== selectedType) {
        return false
      }

      // Filter by holder
      if (selectedHolder !== 'all') {
        if (selectedHolder === 'depot') {
          if (c.customer_id !== null) return false
        } else {
          if (c.customer_id !== Number(selectedHolder)) return false
        }
      }

      return true
    })
  }, [cylinders, search, selectedState, selectedOwner, selectedType, selectedHolder])

  const hasActiveFilters =
    search.trim() !== '' ||
    selectedState !== null ||
    selectedOwner !== 'all' ||
    selectedType !== 'all' ||
    selectedHolder !== 'all'

  const clearFilters = () => {
    setSearch('')
    setSelectedState(null)
    setSelectedOwner('all')
    setSelectedType('all')
    setSelectedHolder('all')
  }

  // Handle register success
  const handleCylinderCreated = () => {
    loadData()
  }

  const handleSelectCylinder = (row) => {
    setSelectedCylinderId(row.id)
    if (onSelectCylinder) onSelectCylinder(row)
  }

  // NotReady check if real endpoint is missing
  if (error) {
    if (error.status === 401) {
      onExpired?.()
      return null
    }
    if (error.status === 404 || error.status === 501 || error.status === 0) {
      return <NotReady endpoint="GET /cylinders" />
    }
    return (
      <div className="cylinders-page">
        <div className="card" style={{ padding: 24, textAlign: 'center' }}>
          <p className="error banner">{error.message || String(error)}</p>
          <button type="button" onClick={loadData} style={{ marginTop: 12 }}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  // Table columns definition
  const columns = [
    {
      key: 'serial_no',
      label: 'Serial Number',
      render: (val, row) => (
        <span
          className="code-badge"
          style={{ cursor: 'pointer', fontSize: 13 }}
          onClick={(e) => {
            e.stopPropagation()
            handleSelectCylinder(row)
          }}
          title="View cylinder timeline"
        >
          {val}
        </span>
      ),
    },
    {
      key: 'cylinder_type',
      label: 'Cylinder Size',
      render: (val) => <span style={{ fontWeight: 600 }}>{val}</span>,
    },
    {
      key: 'state',
      label: 'Current State',
      render: (val) => {
        const cls =
          val === 'Empty'
            ? 'badge-empty'
            : val === 'Filled'
            ? 'badge-filled'
            : val === 'Delivered'
            ? 'badge-delivered'
            : 'badge-recovered'
        return <span className={cls}>● {val}</span>
      },
    },
    {
      key: 'owner',
      label: 'Owner',
      render: (val) => (
        <span className={val === 'Company' ? 'badge-company' : 'badge-customer-owner'}>
          {val}
        </span>
      ),
    },
    {
      key: 'customer_id',
      label: 'Current Holder / Location',
      render: (val) => {
        if (!val) {
          return <span className="muted">Depot (Main Plant)</span>
        }
        const cust = customerMap.get(val)
        return (
          <button
            type="button"
            className="ghost"
            style={{
              padding: 0,
              minHeight: 'auto',
              color: 'var(--color-primary)',
              fontWeight: 500,
              fontSize: 13,
              textAlign: 'left',
            }}
            onClick={(e) => {
              e.stopPropagation()
              onNavigate(`customers/${val}`)
            }}
            title="View customer profile"
          >
            📍 {cust ? cust.name : `Customer #${val}`}
          </button>
        )
      },
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
            onClick={() => handleSelectCylinder(row)}
            title="Open cylinder detail drawer"
          >
            History & Moves ➔
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="cylinders-page">
      {/* Page Header */}
      <div className="cylinders-header">
        <div className="cylinders-title-wrap">
          <h1>Cylinder Register & Lifecycle</h1>
          <p className="muted">
            Track four-step LPG cylinder transitions, asset ownership, and field holdings
          </p>
        </div>
        <div className="cylinders-header-actions">
          {isOwner && (
            <button type="button" onClick={() => setAddModalOpen(true)}>
              + Register Cylinder
            </button>
          )}
        </div>
      </div>

      {/* Sub Navigation Tabs */}
      <div className="cylinders-nav-tabs">
        <button
          type="button"
          className={`cylinders-nav-tab ${activeTab === 'register' ? 'active' : ''}`}
          onClick={() => handleTabChange('register')}
        >
          📦 Cylinder Register
        </button>
        <button
          type="button"
          className={`cylinders-nav-tab ${activeTab === 'held' ? 'active' : ''}`}
          onClick={() => handleTabChange('held')}
        >
          👥 Held by Customers {summary?.held_by_customers?.length ? `(${summary.held_by_customers.length})` : ''}
        </button>
        <button
          type="button"
          className={`cylinders-nav-tab ${activeTab === 'recovery' ? 'active' : ''}`}
          onClick={() => handleTabChange('recovery')}
        >
          ⏳ Empty Recovery & Ageing
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <Spinner size="lg" message="Loading cylinder inventory & lifecycle summary..." />
        </div>
      ) : activeTab === 'recovery' ? (
        <EmptyRecovery auth={auth} onNavigate={onNavigate} />
      ) : activeTab === 'held' ? (
        <HeldByCustomersTable
          summary={summary}
          customers={customers}
          onNavigate={onNavigate}
          onFilterCustomerInRegister={(cid) => {
            setSelectedHolder(String(cid))
            handleTabChange('register')
          }}
        />
      ) : (
        <>
          {/* Summary Cards & 4-Step Lifecycle Strip */}
          <CylinderSummaryStrip
            summary={summary}
            selectedState={selectedState}
            onSelectState={setSelectedState}
          />

          {/* Register Filter & Search Card */}
          <div className="cylinders-toolbar-card">
            <div className="filter-row">
              <div className="search-input-wrap">
                <span className="search-icon-inside" aria-hidden="true">🔍</span>
                <input
                  type="search"
                  placeholder="Search by serial number (e.g. CYL-11-001)..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search serial number"
                />
              </div>

              {/* State Filter */}
              <select
                className="filter-select"
                value={selectedState || 'all'}
                onChange={(e) => setSelectedState(e.target.value === 'all' ? null : e.target.value)}
                aria-label="Filter by state"
              >
                <option value="all">All States (4)</option>
                <option value="Empty">Empty Stock</option>
                <option value="Filled">Filled & Ready</option>
                <option value="Delivered">Delivered</option>
                <option value="Recovered">Recovered Empties</option>
              </select>

              {/* Owner Filter */}
              <select
                className="filter-select"
                value={selectedOwner}
                onChange={(e) => setSelectedOwner(e.target.value)}
                aria-label="Filter by owner"
              >
                <option value="all">All Owners</option>
                <option value="Company">Company Owned</option>
                <option value="Customer">Customer Owned</option>
              </select>

              {/* Cylinder Type Filter */}
              <select
                className="filter-select"
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                aria-label="Filter by cylinder size"
              >
                <option value="all">All Sizes</option>
                <option value="11.8 kg">11.8 kg</option>
                <option value="15 kg">15 kg</option>
                <option value="45.4 kg">45.4 kg</option>
              </select>

              {/* Holder Filter */}
              <select
                className="filter-select"
                value={selectedHolder}
                onChange={(e) => setSelectedHolder(e.target.value)}
                aria-label="Filter by holder"
              >
                <option value="all">All Locations</option>
                <option value="depot">Depot (Not at Customer)</option>
                {holdingCustomers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              {hasActiveFilters && (
                <button type="button" className="ghost" onClick={clearFilters}>
                  Clear Filters
                </button>
              )}
            </div>

            <div className="filter-counts-summary">
              <span>
                Showing <strong>{filteredCylinders.length}</strong> of {cylinders.length} cylinders
                {hasActiveFilters && ' (filtered)'}
              </span>
              <span className="muted" style={{ fontSize: 12 }}>
                Rule: Stock moves (Empty ➔ Filled, Recovered ➔ Empty) are owner-only.
              </span>
            </div>
          </div>

          {/* Register Data Table */}
          <DataTable
            columns={columns}
            data={filteredCylinders}
            searchable={false}
            onRowClick={handleSelectCylinder}
            emptyTitle="No cylinders match your filter criteria"
            emptyDescription="Try clearing your search query or adjusting your filters."
          />
        </>
      )}

      {/* Add Cylinder Modal */}
      <AddCylinderModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        token={auth.token}
        onSuccess={handleCylinderCreated}
      />

      {/* Cylinder Detail Drawer */}
      <CylinderDetailDrawer
        isOpen={Boolean(selectedCylinderId)}
        onClose={() => setSelectedCylinderId(null)}
        cylinderId={selectedCylinderId}
        auth={auth}
        customers={customers}
        onNavigate={onNavigate}
        onCylinderUpdated={loadData}
      />
    </div>
  )
}
