import { useMemo, useState } from 'react'
import EmptyState from './EmptyState'

export default function DataTable({
  columns = [],
  data = [],
  keyField = 'id',
  searchable = true,
  searchPlaceholder = 'Search...',
  emptyTitle = 'No data available',
  emptyDescription = 'There are no items to display right now.',
  onRowClick,
  rowClassName,
  pagination = true,
  pageSize: initialPageSize = 12,
}) {
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState(null)
  const [sortAsc, setSortAsc] = useState(true)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(initialPageSize)

  // Filter rows based on query
  const filtered = useMemo(() => {
    if (!query.trim()) return data
    const q = query.toLowerCase()
    return data.filter((row) =>
      columns.some((col) => {
        const val = row[col.key]
        return val !== null && val !== undefined && String(val).toLowerCase().includes(q)
      })
    )
  }, [data, columns, query])

  // Sort rows based on active column and direction
  const sorted = useMemo(() => {
    if (!sortKey) return filtered
    return [...filtered].sort((a, b) => {
      const valA = a[sortKey]
      const valB = b[sortKey]
      if (valA === valB) return 0
      if (valA === null || valA === undefined) return 1
      if (valB === null || valB === undefined) return -1
      const res = valA > valB ? 1 : -1
      return sortAsc ? res : -res
    })
  }, [filtered, sortKey, sortAsc])

  // Reset page when search or data length changes
  useEffect(() => {
    setPage(0)
  }, [query, data.length])

  // Paginated slice
  const totalPages = Math.ceil(sorted.length / pageSize) || 1
  const paginatedRows = useMemo(() => {
    if (!pagination) return sorted
    const start = page * pageSize
    return sorted.slice(start, start + pageSize)
  }, [sorted, pagination, page, pageSize])

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(true)
    }
  }

  const startIdx = sorted.length === 0 ? 0 : page * pageSize + 1
  const endIdx = Math.min((page + 1) * pageSize, sorted.length)

  return (
    <div className="datatable-wrap">
      {searchable && (
        <div className="datatable-toolbar">
          <div className="datatable-search-wrapper">
            <span className="search-icon" aria-hidden="true">🔍</span>
            <input
              type="search"
              className="datatable-search"
              placeholder={searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Filter rows"
            />
          </div>
          <div className="datatable-toolbar-meta">
            <span className="datatable-count muted">
              Showing <strong>{sorted.length}</strong> of {data.length} records
            </span>
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <EmptyState
          title={query ? 'No matching results' : emptyTitle}
          description={query ? `No records matched "${query}". Try clearing the search.` : emptyDescription}
          action={query && <button type="button" className="secondary" onClick={() => setQuery('')}>Clear filter</button>}
        />
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="datatable-desktop">
            <table className="datatable">
              <thead>
                <tr>
                  {columns.map((col) => {
                    const isSorted = sortKey === col.key
                    const sortable = col.sortable !== false
                    return (
                      <th
                        key={col.key}
                        onClick={sortable ? () => handleSort(col.key) : undefined}
                        className={sortable ? 'sortable' : ''}
                        aria-sort={isSorted ? (sortAsc ? 'ascending' : 'descending') : undefined}
                      >
                        <div className="th-content">
                          <span>{col.label}</span>
                          {sortable && (
                            <span className="sort-arrow muted">
                              {isSorted ? (sortAsc ? ' ↑' : ' ↓') : ' ↕'}
                            </span>
                          )}
                        </div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((row) => {
                  const extraClass = rowClassName ? rowClassName(row) : ''
                  return (
                    <tr
                      key={row[keyField] ?? JSON.stringify(row)}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      className={[onRowClick ? 'clickable-row' : '', extraClass].filter(Boolean).join(' ')}
                    >
                      {columns.map((col) => (
                        <td key={col.key}>
                          {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card Stack (< 720px) */}
          <div className="datatable-mobile">
            {paginatedRows.map((row) => {
              const extraClass = rowClassName ? rowClassName(row) : ''
              return (
                <div
                  key={row[keyField] ?? JSON.stringify(row)}
                  className={['datatable-card', onRowClick ? 'clickable-card' : '', extraClass].filter(Boolean).join(' ')}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((col) => (
                    <div key={col.key} className="card-field-row">
                      <span className="card-field-label">{col.label}</span>
                      <span className="card-field-value">
                        {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                      </span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>

          {/* Pagination Bar */}
          {pagination && totalPages > 1 && (
            <div className="datatable-pagination">
              <span className="pagination-info muted">
                Showing {startIdx}–{endIdx} of {sorted.length}
              </span>
              <div className="pagination-controls">
                <button
                  type="button"
                  className="pagination-btn"
                  onClick={() => setPage((p) => Math.max(p - 1, 0))}
                  disabled={page === 0}
                  aria-label="Previous page"
                >
                  &larr; Prev
                </button>
                <div className="pagination-pages">
                  {Array.from({ length: totalPages }, (_, i) => i)
                    .filter((p) => p === 0 || p === totalPages - 1 || Math.abs(p - page) <= 1)
                    .map((p, idx, arr) => {
                      const prev = arr[idx - 1]
                      const showEllipsis = prev !== undefined && p - prev > 1
                      return (
                        <span key={p} style={{ display: 'inline-flex', alignItems: 'center' }}>
                          {showEllipsis && <span className="pagination-ellipsis">&hellip;</span>}
                          <button
                            type="button"
                            className={`pagination-page-btn ${page === p ? 'active' : ''}`}
                            onClick={() => setPage(p)}
                          >
                            {p + 1}
                          </button>
                        </span>
                      )
                    })}
                </div>
                <button
                  type="button"
                  className="pagination-btn"
                  onClick={() => setPage((p) => Math.min(p + 1, totalPages - 1))}
                  disabled={page >= totalPages - 1}
                  aria-label="Next page"
                >
                  Next &rarr;
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
