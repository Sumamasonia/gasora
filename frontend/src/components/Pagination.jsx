export default function Pagination({
  currentPage = 0,
  totalPages = 1,
  totalItems = 0,
  pageSize = 5,
  onPageChange,
}) {
  if (totalPages <= 1) return null

  const startIdx = totalItems === 0 ? 0 : currentPage * pageSize + 1
  const endIdx = Math.min((currentPage + 1) * pageSize, totalItems)

  return (
    <div className="datatable-pagination" style={{ marginTop: 12 }}>
      <span className="pagination-info muted">
        Showing <strong>{startIdx}</strong>–<strong>{endIdx}</strong> of {totalItems} records
      </span>
      <div className="pagination-controls">
        <button
          type="button"
          className="pagination-btn"
          onClick={() => onPageChange(Math.max(currentPage - 1, 0))}
          disabled={currentPage === 0}
          aria-label="Previous page"
        >
          &larr; Prev
        </button>

        <div className="pagination-pages">
          {Array.from({ length: totalPages }, (_, i) => i)
            .filter((p) => p === 0 || p === totalPages - 1 || Math.abs(p - currentPage) <= 1)
            .map((p, idx, arr) => {
              const prev = arr[idx - 1]
              const showEllipsis = prev !== undefined && p - prev > 1
              return (
                <span key={p} style={{ display: 'inline-flex', alignItems: 'center' }}>
                  {showEllipsis && <span className="pagination-ellipsis">&hellip;</span>}
                  <button
                    type="button"
                    className={`pagination-page-btn ${currentPage === p ? 'active' : ''}`}
                    onClick={() => onPageChange(p)}
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
          onClick={() => onPageChange(Math.min(currentPage + 1, totalPages - 1))}
          disabled={currentPage >= totalPages - 1}
          aria-label="Next page"
        >
          Next &rarr;
        </button>
      </div>
    </div>
  )
}
