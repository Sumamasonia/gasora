import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle, ArrowRight, Boxes, Cylinder, HandCoins, Inbox, Map as MapIcon, Receipt, ShoppingCart, TrendingUp, Users, Wallet,
} from 'lucide-react'
import { getDashboard, getPlan } from './api'
import { AgeingBars, DeliveriesChart, RiskDonut } from './charts'
import { BAND_COLOR } from './colors'
import { useGuard } from './hooks'
import { Badge, Kpi, rs } from './ui'

const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export default function Overview({ auth, onExpired, go }) {
  const { busy, error, run } = useGuard(onExpired)
  const [d, setD] = useState(null)
  const [plan, setPlan] = useState(null)
  const load = useCallback(async () => {
    const [dash, p] = await Promise.all([getDashboard(auth.token), getPlan(auth.token, 1)])
    setD(dash); setPlan(p)
  }, [auth.token])
  useEffect(() => { run(load) }, [run, load])

  const counts = { Normal: 0, High: 0, Critical: 0 }
  plan?.risk_table.forEach((r) => { if (counts[r.band] !== undefined) counts[r.band] += 1 })
  const atRisk = plan ? [...plan.risk_table].filter((r) => r.risk >= 0.1).sort((a, b) => b.risk - a.risk).slice(0, 6) : []
  const planned = plan ? plan.routes.reduce((n, r) => n + r.stops.length, 0) : 0
  const m = d?.money_30_days
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="page">
      <section className="rise relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-900 via-brand-700 to-brand-500 p-6 text-white shadow-soft sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 right-40 h-56 w-56 rounded-full bg-sky-300/20 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="m-0 text-sm text-brand-100">{today}</p>
            <h2 className="mb-1 mt-1 text-2xl font-bold !text-white sm:text-3xl">{greeting()}, {auth.username}</h2>
            <p className="m-0 max-w-xl text-sm text-brand-100">
              {plan
                ? <>The planner expects <strong className="text-white">{planned}</strong> stops today, with <strong className="text-white">{counts.Critical}</strong> customers in the critical band{d?.open_urgent ? <> and <strong className="text-white">{d.open_urgent}</strong> urgent request(s) waiting</> : ''}.</>
                : 'Loading today’s plan...'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <button className="!bg-white !bg-none !text-brand-700 !shadow-lg hover:!bg-brand-50" onClick={() => go('dispatch')}><MapIcon size={16} /> Open dispatch <ArrowRight size={15} /></button>
            <button className="!bg-white/15 !bg-none !text-white !shadow-none !ring-1 !ring-inset !ring-white/30 hover:!bg-white/25" onClick={() => go('sales')}><ShoppingCart size={16} /> Record a sale</button>
          </div>
        </div>
      </section>

      {error && <p className="error banner">{error}</p>}
      {!d && !error && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-24" />)}</div>
      )}

      {d && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi icon={Cylinder} tone="brand" label="Delivered today" value={`${d.today.cylinders}`} sub={`${d.today.deliveries} deliveries`} />
            <Kpi icon={TrendingUp} tone="sky" label="Last 7 days" value={`${d.last_7_days.cylinders}`} sub={`${d.last_7_days.deliveries} deliveries · 30 days: ${d.last_30_days.cylinders}`} />
            <Kpi icon={Users} tone="green" label="Customers" value={d.customers} sub={`${d.open_urgent} urgent open`} warn={d.open_urgent > 0} />
            <Kpi icon={Boxes} tone={d.stock.low || d.stock.negative ? 'amber' : 'green'} label="Filled stock" value={d.stock.tracking ? d.stock.on_hand : 'not tracked'}
              sub={d.stock.negative ? 'below zero: check the count' : d.stock.low ? 'running low' : 'on hand'} warn={d.stock.low || d.stock.negative} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi icon={Receipt} tone="brand" label="Billed (30 days)" value={rs(m.billed)} />
            <Kpi icon={Wallet} tone="green" label="Received (30 days)" value={rs(m.collected)} />
            <Kpi icon={HandCoins} tone="amber" label="Expenses (30 days)" value={rs(m.expenses)} />
            <Kpi icon={AlertTriangle} tone={d.receivables.total_owed > 0 ? 'red' : 'green'} label="Owed by customers" value={rs(d.receivables.total_owed)}
              sub={`${d.receivables.customers_owing} customers · oldest ${d.receivables.oldest_days} days`} />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="card rise xl:col-span-2">
              <div className="flex items-center justify-between"><h2>Cylinders delivered, last 14 days</h2><span className="muted">hover for details</span></div>
              <DeliveriesChart series={d.series} />
            </div>
            <div className="card rise">
              <h2>Run-out risk today</h2>
              <div className="flex flex-wrap items-center justify-center gap-4">
                <RiskDonut counts={counts} />
                <ul className="m-0 list-none space-y-2 p-0 text-sm">
                  {['Critical', 'High', 'Normal'].map((k) => (
                    <li key={k} className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: BAND_COLOR[k] }} />{k}<strong className="ml-auto pl-4">{counts[k]}</strong></li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="card rise xl:col-span-2">
              <div className="flex items-center justify-between">
                <h2>Customers most likely to run out</h2>
                <button className="secondary !py-1 !text-xs" onClick={() => go('dispatch')}>See plan <ArrowRight size={13} /></button>
              </div>
              {atRisk.length === 0 && <p className="muted">No customer is above 10% risk right now.</p>}
              <ul className="m-0 list-none space-y-3 p-0">
                {atRisk.map((r) => (
                  <li key={r.customer_id} className="flex items-center gap-3">
                    <span className="w-36 shrink-0 truncate text-sm font-medium">{r.name}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full" style={{ width: `${Math.max(4, Math.round(r.risk * 100))}%`, background: BAND_COLOR[r.band] }} />
                    </div>
                    <span className="w-10 text-right text-sm font-semibold">{Math.round(r.risk * 100)}%</span>
                    <Badge band={r.band} />
                  </li>
                ))}
              </ul>
            </div>
            <div className="card rise">
              <h2>Amounts owed by age</h2>
              <AgeingBars buckets={d.receivables.buckets} />
              <div className="flex gap-2">
                <button className="secondary flex-1 !text-xs" onClick={() => go('accounts')}><Wallet size={14} /> Accounts</button>
                <button className="secondary flex-1 !text-xs" onClick={() => go('requests')}><Inbox size={14} /> Requests</button>
              </div>
            </div>
          </div>
        </>
      )}
      {busy && !d && <span className="sr-only">Loading</span>}
    </div>
  )
}
