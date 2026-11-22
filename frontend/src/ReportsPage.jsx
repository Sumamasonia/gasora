import { useCallback, useEffect, useState } from 'react'
import { downloadFile, getDashboard } from './api'
import { useGuard } from './hooks'
import { rs } from './ui'

const KINDS = [['deliveries', 'Deliveries'], ['invoices', 'Invoices'], ['ledger', 'Customer ledger'],
  ['expenses', 'Expenses'], ['stock', 'Stock movements'], ['customers', 'Customers']]

function Tile({ label, value, sub, warn }) {
  return (
    <div className={warn ? 'tile warn' : 'tile'}>
      <div className="muted">{label}</div>
      <div className="tilevalue">{value}</div>
      {sub && <div className="muted">{sub}</div>}
    </div>
  )
}

function Bars({ series }) {
  const max = Math.max(1, ...series.map((d) => d.cylinders))
  const w = 28, gap = 6, h = 90
  return (
    <svg role="img" aria-label="Cylinders delivered per day, last 14 days" width={series.length * (w + gap)} height={h + 34}>
      {series.map((d, i) => {
        const bar = Math.round((d.cylinders / max) * h)
        return (
          <g key={d.day} transform={`translate(${i * (w + gap)},0)`}>
            <rect x="0" y={h - bar} width={w} height={bar} rx="3" fill="#2f6fdb"><title>{`${d.day}: ${d.cylinders} cylinders, ${d.deliveries} deliveries`}</title></rect>
            <text x={w / 2} y={h - bar - 3} textAnchor="middle" fontSize="10" fill="currentColor">{d.cylinders || ''}</text>
            <text x={w / 2} y={h + 14} textAnchor="middle" fontSize="10" fill="currentColor">{d.day.slice(8)}</text>
          </g>
        )
      })}
    </svg>
  )
}

export default function ReportsPage({ auth, onExpired }) {
  const { busy, error, run } = useGuard(onExpired)
  const [d, setD] = useState(null)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [kind, setKind] = useState('deliveries')
  const [note, setNote] = useState('')

  const load = useCallback(async () => { setD(await getDashboard(auth.token)) }, [auth.token])
  useEffect(() => { run(load) }, [run, load])

  const save = (path, name, message) => run(async () => { await downloadFile(auth.token, path, name); setNote(message) })
  const range = [start && `start=${start}`, end && `end=${end}`].filter(Boolean).join('&')
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="page">
      {error && <p className="error banner">{error}</p>}
      {d && (
        <>
          <div className="card">
            <h2>Today and recent days</h2>
            <div className="tiles">
              <Tile label="Delivered today" value={`${d.today.cylinders} cylinders`} sub={`${d.today.deliveries} deliveries`} />
              <Tile label="Last 7 days" value={`${d.last_7_days.cylinders} cylinders`} sub={`${d.last_7_days.deliveries} deliveries`} />
              <Tile label="Last 30 days" value={`${d.last_30_days.cylinders} cylinders`} sub={`${d.last_30_days.deliveries} deliveries`} />
              <Tile label="Customers" value={d.customers} sub={`${d.open_urgent} urgent open`} warn={d.open_urgent > 0} />
              <Tile label="Filled stock" value={d.stock.tracking ? d.stock.on_hand : 'not tracked'}
                sub={d.stock.negative ? 'below zero: check the count' : d.stock.low ? 'low' : ''} warn={d.stock.low || d.stock.negative} />
            </div>
            <div className="tablewrap"><Bars series={d.series} /></div>
          </div>

          <div className="card">
            <h2>Money, last 30 days</h2>
            {!d.price_set && <p className="error">No cylinder price is set, so deliveries are not being billed. Set it on the Accounts tab.</p>}
            <div className="tiles">
              <Tile label="Billed" value={rs(d.money_30_days.billed)} />
              <Tile label="Payments received" value={rs(d.money_30_days.collected)} />
              <Tile label="Expenses" value={rs(d.money_30_days.expenses)} />
              <Tile label="Stock bought" value={rs(d.money_30_days.stock_purchases)} />
              <Tile label="Recorded cash net" value={rs(d.money_30_days.recorded_cash_net)} warn={d.money_30_days.recorded_cash_net < 0}
                sub="payments minus expenses minus stock bought" />
            </div>
            <p className="muted">These are recorded money in and out, not an accounting profit. Sales on credit count only when paid.</p>
          </div>

          <div className="card">
            <div className="row">
              <h2 style={{ margin: 0 }}>Amounts owed</h2>
              <button disabled={busy} onClick={() => save('/reports/receivables.pdf', `amounts-owed-${today}.pdf`, 'Saved the ageing report.')}>Download PDF</button>
            </div>
            <div className="counts">
              <div><strong>{rs(d.receivables.total_owed)}</strong> owed by {d.receivables.customers_owing} {d.receivables.customers_owing === 1 ? "customer" : "customers"}</div>
              <div className="muted">oldest debt: {d.receivables.oldest_days} days</div>
            </div>
            <div className="tablewrap">
              <table>
                <thead><tr><th>Age of oldest debt</th><th>Customers</th><th>Amount</th></tr></thead>
                <tbody>{d.receivables.buckets.map((b) => <tr key={b.label}><td>{b.label} days</td><td>{b.customers}</td><td>{b.amount.toLocaleString('en-US')}</td></tr>)}</tbody>
              </table>
            </div>
            {d.receivables.top.length > 0 && (
              <p className="muted">Longest outstanding: {d.receivables.top.map((r) => `${r.name} (${rs(r.balance)}, ${r.days} days)`).join('; ')}</p>
            )}
          </div>
        </>
      )}

      <div className="card">
        <h2>Export to a spreadsheet (CSV)</h2>
        <div className="row">
          <select value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <label className="inline">From <input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
          <label className="inline">To <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
          <button disabled={busy} onClick={() => save(`/export/${kind}.csv${range ? `?${range}` : ''}`, `gasora-${kind}-${today}.csv`, 'Saved the CSV file.')}>Download</button>
        </div>
        <p className="muted">The dates do not apply to the customers list. The files contain customer names and phone numbers: keep them private.</p>
      </div>

      <div className="card">
        <h2>Backup</h2>
        <p>Downloads one file with a copy of the database and the audit log, and checks the audit chain while doing so.</p>
        <div className="row">
          <button disabled={busy} onClick={() => save('/backup', `gasora-backup-${today}.zip`, 'Saved the backup. Keep a copy on another device.')}>Download backup</button>
        </div>
        <p className="muted">To restore: stop the server, then run <code>python -m backend.manage restore FILE.zip --force</code>. The current files are kept under a new name.</p>
      </div>
      {note && <p className="muted">{note}</p>}
    </div>
  )
}
