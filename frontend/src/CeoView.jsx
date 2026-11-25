import { useCallback, useEffect, useState } from 'react'
import { getDashboard } from './api'
import { useGuard } from './hooks'
import { rs } from './ui'
import { RefreshCw } from 'lucide-react'
import Shell from './Shell'


export default function CeoView({ auth, onSignOut, onExpired, onPassword }) {
  const { busy, error, run } = useGuard(onExpired)
  const [d, setD] = useState(null)
  const load = useCallback(async () => { setD(await getDashboard(auth.token)) }, [auth.token])
  useEffect(() => { run(load) }, [run, load])
  const m = d?.money_30_days
  return (
    <Shell brand="Gasora Summary" title="Summary" user={{ username: auth.username, role: 'read only', onPassword, onSignOut }}
      actions={<button className="secondary" disabled={busy} onClick={() => run(load)}><RefreshCw size={15} /> Refresh</button>}>
      <div className="page">
        {error && <p className="error banner">{error}</p>}
        {d && (
          <>
            <div className="card">
              <h2>Deliveries</h2>
              <div className="tiles">
                <div className="tile"><div className="muted">Today</div><div className="tilevalue">{d.today.cylinders}</div><div className="muted">cylinders</div></div>
                <div className="tile"><div className="muted">Last 7 days</div><div className="tilevalue">{d.last_7_days.cylinders}</div><div className="muted">cylinders</div></div>
                <div className="tile"><div className="muted">Last 30 days</div><div className="tilevalue">{d.last_30_days.cylinders}</div><div className="muted">cylinders</div></div>
              </div>
            </div>
            <div className="card">
              <h2>Money, last 30 days</h2>
              <div className="tiles">
                <div className="tile"><div className="muted">Billed</div><div className="tilevalue">{rs(m.billed)}</div></div>
                <div className="tile"><div className="muted">Received</div><div className="tilevalue">{rs(m.collected)}</div></div>
                <div className="tile"><div className="muted">Expenses</div><div className="tilevalue">{rs(m.expenses)}</div></div>
                <div className="tile"><div className="muted">Recorded cash net</div><div className="tilevalue">{rs(m.recorded_cash_net)}</div></div>
              </div>
              <p className="muted">Recorded money in and out, not an accounting profit.</p>
            </div>
            <div className="card">
              <h2>Owed and stock</h2>
              <div className="tiles">
                <div className="tile"><div className="muted">Owed by customers</div><div className="tilevalue">{rs(d.receivables.total_owed)}</div><div className="muted">{d.receivables.customers_owing} customers, oldest {d.receivables.oldest_days} days</div></div>
                <div className={d.stock.low ? 'tile warn' : 'tile'}><div className="muted">Filled stock</div><div className="tilevalue">{d.stock.tracking ? d.stock.on_hand : 'not tracked'}</div>{d.stock.low && <div className="muted">low</div>}</div>
              </div>
            </div>
          </>
        )}
      </div>
    </Shell>
  )
}
