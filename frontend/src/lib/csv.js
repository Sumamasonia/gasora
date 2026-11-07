/**
 * Reusable CSV Export Utility
 * Converts an array of objects to CSV and triggers browser download
 *
 * @param {Array<Object>} rows - Data rows to export
 * @param {Array<{ key: string, label: string, format?: (val: any, row: Object) => string }>} columns - Column definitions
 * @param {string} filename - Download filename (e.g. 'gasora-ledger-2026.csv')
 */
export function exportToCsv(rows, columns, filename = 'export.csv') {
  if (!rows || rows.length === 0) {
    alert('No data available to export.')
    return
  }

  // Escape special CSV characters (quotes, commas, newlines)
  const escapeCell = (value) => {
    if (value === null || value === undefined) return '""'
    const stringVal = String(value)
    if (stringVal.includes('"') || stringVal.includes(',') || stringVal.includes('\n') || stringVal.includes('\r')) {
      return `"${stringVal.replace(/"/g, '""')}"`
    }
    return `"${stringVal}"`
  }

  // Header row
  const headerLine = columns.map((col) => escapeCell(col.label)).join(',')

  // Data rows
  const dataLines = rows.map((row) => {
    return columns
      .map((col) => {
        let val = row[col.key]
        if (col.format && typeof col.format === 'function') {
          val = col.format(val, row)
        }
        return escapeCell(val)
      })
      .join(',')
  })

  const csvContent = '\uFEFF' + [headerLine, ...dataLines].join('\r\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })

  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.setAttribute('href', url)
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
