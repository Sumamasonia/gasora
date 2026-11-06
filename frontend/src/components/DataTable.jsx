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
}) {
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState(null)
  const [sortAsc, setSortAsc] = useState(true)

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

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(true)
    }
  }

  return (
    <div className="datatable-wrap">
      {searchable && (
        <div className="datatable-toolbar">
          <input
            type="search"
            className="datatable-search"
            placeholder={searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter rows"
          />
          <span className="datatable-count muted">
            Showing {sorted.length} of {data.length}
          </span>
        </div>
      )}

      {sorted.length === 0 ? (
        <EmptyState
          title={query ? 'No matching results' : emptyTitle}
          description={query ? `No records matched "${query}". Try clearing the search.` : emptyDescription}
          action={query && <button className="secondary" onClick={() => setQuery('')}>Clear filter</button>}
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
                {sorted.map((row) => {
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
            {sorted.map((row) => {
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
        </>
      )}
    </div>
  )
}
