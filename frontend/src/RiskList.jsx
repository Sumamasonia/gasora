import { useEffect, useMemo, useState } from 'react'
import { BAND_COLOR } from './colors'
import Pagination from './components/Pagination'
import { Badge, UrgentTag } from './ui'

export default function RiskList({
  riskTable = [],
  selectedCustomerId = null,
  onSelectCustomer = null,
}) {
  const [bandFilter, setBandFilter] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortKey, setSortKey] = useState('risk')
  const [sortAsc, setSortAsc] = useState(false)

  // Pagination (5 items per page)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 5

  useEffect(() => {
    setPage(0)
  }, [bandFilter, searchQuery])

  // Compute counts for filter pills
  const counts = useMemo(() => {
    const map = { All: riskTable.length, Urgent: 0, Critical: 0, High: 0, Normal: 0 }
    riskTable.forEach((r) => {
      if (r.urgent) {
        map.Urgent = (map.Urgent || 0) + 1
      } else if (map[r.band] !== undefined) {
        map[r.band] += 1
      }
    })
    return map
  }, [riskTable])

  // Filter and sort the table
  const processedRows = useMemo(() => {
    let list = riskTable.slice()

    // 1. Filter by band
    if (bandFilter !== 'All') {
      if (bandFilter === 'Urgent') {
        list = list.filter((r) => r.urgent || r.band === 'Urgent')
      } else {
        list = list.filter((r) => !r.urgent && r.band === bandFilter)
      }
    }

    // 2. Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter((r) => (r.name || '').toLowerCase().includes(q) || String(r.customer_id).includes(q))
    }

    // 3. Sort: Urgent rows always on top unless sorting specifically, then by sortKey
    list.sort((a, b) => {
      // Urgent rows stay on top
      if (a.urgent && !b.urgent) return -1
      if (!a.urgent && b.urgent) return 1

      let comp = 0
      if (sortKey === 'name') {
        comp = a.name.localeCompare(b.name)
      } else if (sortKey === 'risk') {
        comp = a.risk - b.risk
      } else if (sortKey === 'days_since_delivery') {
        const valA = a.days_since_delivery ?? -1
        const valB = b.days_since_delivery ?? -1
        comp = valA - valB
      } else if (sortKey === 'window_days') {
        const valA = a.window_days ? a.window_days[0] : 999
        const valB = b.window_days ? b.window_days[0] : 999
        comp = valA - valB
      } else if (sortKey === 'deliveries_seen') {
        comp = (a.deliveries_seen || 0) - (b.deliveries_seen || 0)
      }

      return sortAsc ? comp : -comp
    })

    return list
  }, [riskTable, bandFilter, searchQuery, sortKey, sortAsc])

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(false)
    }
  }

  const renderSortIndicator = (key) => {
    if (sortKey !== key) return <span className="sort-indicator muted">&udhar;</span>
    return <span className="sort-indicator active">{sortAsc ? '▲' : '▼'}</span>
  }

  return (
    <section className="risk-list-section">
      <div className="risk-list-header">
        <div className="risk-title-row">
          <h3>Customer Depletion &amp; Risk</h3>
          <span className="muted" style={{ fontSize: 12 }}>
            {processedRows.length} of {riskTable.length} customers
          </span>
        </div>
        <p className="muted" style={{ fontSize: 12, margin: '2px 0 10px' }}>
          Predictive depletion window &amp; 48-hour run-out risk. Click any row to locate on map.
        </p>

        {/* Quick Search */}
        <div className="risk-search-bar">
          <input
            type="search"
            className="risk-search-input"
            placeholder="🔍 Search at-risk customer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Filter Pills by Band */}
        <div className="band-filter-pills" role="tablist" aria-label="Filter customers by risk band">
          {['All', 'Urgent', 'Critical', 'High', 'Normal'].map((band) => {
            const count = counts[band] || 0
            const isActive = bandFilter === band
            let pillColor = 'var(--color-primary)'
            if (band === 'Urgent') pillColor = BAND_COLOR.Urgent
            if (band === 'Critical') pillColor = BAND_COLOR.Critical
            if (band === 'High') pillColor = BAND_COLOR.High
            if (band === 'Normal') pillColor = BAND_COLOR.Normal

            return (
              <button
                key={band}
                type="button"
                className={`band-filter-pill ${isActive ? 'active' : ''}`}
                onClick={() => setBandFilter(band)}
                style={{
                  '--pill-accent': pillColor,
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                <span>{band}</span>
                <span className="pill-count">{count}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Sortable Table */}
      <div className="risk-table-container">
        <table className="risk-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('name')} className="col-name" style={{ cursor: 'pointer' }}>
                Customer {renderSortIndicator('name')}
              </th>
              <th onClick={() => handleSort('risk')} className="col-band" style={{ cursor: 'pointer' }}>
                Risk &amp; Band {renderSortIndicator('risk')}
              </th>
              <th onClick={() => handleSort('days_since_delivery')} className="col-days" style={{ cursor: 'pointer' }}>
                Days Ago {renderSortIndicator('days_since_delivery')}
              </th>
              <th onClick={() => handleSort('window_days')} className="col-window" style={{ cursor: 'pointer' }}>
                Refill Window {renderSortIndicator('window_days')}
              </th>
              <th onClick={() => handleSort('deliveries_seen')} className="col-seen" style={{ cursor: 'pointer' }}>
                History {renderSortIndicator('deliveries_seen')}
              </th>
            </tr>
          </thead>
          <tbody>
            {processedRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty-cell muted" style={{ textAlign: 'center', padding: '24px 12px' }}>
                  No customers found matching &quot;{searchQuery || bandFilter}&quot;.
                </td>
              </tr>
            ) : (
              processedRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((row) => {
                const isSelected = selectedCustomerId !== null && Number(row.customer_id) === Number(selectedCustomerId)
                const isUrgent = Boolean(row.urgent)

                return (
                  <tr
                    key={row.customer_id}
                    className={`risk-row ${isUrgent ? 'urgent-row' : ''} ${isSelected ? 'selected' : ''}`}
                    onClick={() => onSelectCustomer && onSelectCustomer(isSelected ? null : row.customer_id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className="customer-name-cell">
                      <div className="customer-name-wrapper">
                        <strong className="name-text">{row.name}</strong>
                        {isUrgent && <UrgentTag />}
                      </div>
                    </td>

                    <td className="band-cell">
                      <div className="band-wrapper">
                        {isUrgent ? (
                          <span className="badge" style={{ background: BAND_COLOR.Urgent }}>
                            Urgent
                          </span>
                        ) : (
                          <Badge band={row.band} />
                        )}
                        <span className="risk-pct muted">
                          {Math.round(row.risk * 100)}%
                        </span>
                      </div>
                    </td>

                    <td className="days-cell">
                      {row.days_since_delivery !== null ? (
                        <span className="days-value">
                          {row.days_since_delivery} <span className="muted">days</span>
                        </span>
                      ) : (
                        <span className="muted italic">No delivery</span>
                      )}
                    </td>

                    <td className="window-cell">
                      {row.window_days ? (
                        <span className="window-tag">
                          {row.window_days[0]} &ndash; {row.window_days[1]} d
                        </span>
                      ) : (
                        <span className="muted">&mdash;</span>
                      )}
                    </td>

                    <td className="seen-cell">
                      <span className="seen-badge" title={`${row.deliveries_seen || 0} recorded deliveries`}>
                        {row.deliveries_seen || 0} seen
                      </span>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      <Pagination
        currentPage={page}
        totalPages={Math.ceil(processedRows.length / PAGE_SIZE)}
        totalItems={processedRows.length}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />
    </section>
  )
}
