import { useState } from 'react'
import {
  ArrowRight, BarChart3, Boxes, Check, ClipboardCheck, Cylinder, Flame, LineChart, MapPin, Menu, Radar, Route, ShieldCheck,
  Smartphone, Truck, Users, X, Wallet, Bell,
} from 'lucide-react'

const ROUTE_COLORS = ['#5a48e0', '#0ea5e9', '#f97316']

// A drawn (not live) picture of the dispatch screen: roads, three routes, risk pins.
function MapMock() {
  const routes = [
    { c: ROUTE_COLORS[0], pts: [[90, 330], [150, 250], [230, 230], [300, 160], [390, 130], [470, 70]] },
    { c: ROUTE_COLORS[1], pts: [[90, 330], [170, 380], [270, 350], [350, 400], [450, 360], [540, 300]] },
    { c: ROUTE_COLORS[2], pts: [[90, 330], [140, 300], [210, 310], [330, 270], [430, 230], [560, 190]] },
  ]
  const band = ['#dc2626', '#ea8a00', '#16a34a']
  return (
    <svg viewBox="0 0 640 440" className="h-full w-full" role="img" aria-label="Example routes on a map">
      <rect width="640" height="440" fill="#eef0fb" />
      {[40, 110, 180, 250, 320, 390].map((y) => <line key={y} x1="0" x2="640" y1={y} y2={y + 14} stroke="#fff" strokeWidth="9" />)}
      {[60, 150, 240, 330, 420, 510, 600].map((x) => <line key={x} y1="0" y2="440" x1={x} x2={x - 22} stroke="#fff" strokeWidth="9" />)}
      <path d="M0 410 C140 360 260 430 420 380 S600 330 640 350 L640 440 L0 440Z" fill="#cfe4f7" opacity=".7" />
      <rect x="360" y="40" width="120" height="70" rx="14" fill="#d8f0df" opacity=".8" />
      {routes.map((r, i) => (
        <g key={i}>
          <polyline points={r.pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={r.c} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          {r.pts.slice(1).map(([x, y], n) => (
            <g key={n}>
              <circle cx={x} cy={y} r="13" fill={band[(i + n) % 3]} stroke="#fff" strokeWidth="3" />
              <text x={x} y={y + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">{n + 1}</text>
            </g>
          ))}
        </g>
      ))}
      <circle cx="90" cy="330" r="17" fill="#14123a" stroke="#fff" strokeWidth="4" />
      <circle cx="90" cy="330" r="6" fill="#fff" />
    </svg>
  )
}

function Hero({ onLogin }) {
  return (
    <section className="relative overflow-hidden px-5 pb-24 pt-36 text-center sm:pt-44">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-brand-100 via-brand-50 to-white" />
      <div className="pointer-events-none absolute left-1/2 top-24 h-96 w-[60rem] -translate-x-1/2 rounded-full bg-brand-400/20 blur-3xl" />
      <div className="relative mx-auto max-w-4xl">
        <span className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-brand-700 shadow-soft ring-1 ring-brand-100">
          <Radar size={14} /> Predictive refill planning for LPG distributors
        </span>
        <h1 className="mx-auto mb-5 mt-6 text-5xl font-extrabold leading-[1.05] tracking-tight text-slate-900 sm:text-6xl lg:text-7xl">
          Deliver gas <span className="bg-gradient-to-r from-brand-600 to-sky-500 bg-clip-text text-transparent">before</span> your customers run out
        </h1>
        <p className="mx-auto mb-9 max-w-2xl text-lg text-slate-600 sm:text-xl">
          Gasora predicts who needs a refill next, plans the day&rsquo;s delivery routes, and keeps your stock, ledger and invoices together.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button className="!rounded-2xl !bg-gradient-to-b !from-amber-300 !to-amber-500 !px-7 !py-3.5 !text-base !text-slate-900 !shadow-lg !shadow-amber-500/30 hover:!from-amber-300 hover:!to-amber-400" onClick={onLogin}>
            Sign in to Gasora <ArrowRight size={18} />
          </button>
          <a href="#how" className="inline-flex items-center rounded-2xl bg-white px-7 py-3.5 text-base font-semibold text-brand-700 no-underline shadow-soft ring-1 ring-brand-200 hover:bg-brand-50 hover:no-underline">
            See how it works
          </a>
        </div>
      </div>

      {/* collage of the product */}
      <div className="relative mx-auto mt-16 max-w-5xl">
        <div className="overflow-hidden rounded-3xl bg-white shadow-2xl shadow-brand-900/20 ring-1 ring-slate-200">
          <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
            <span className="h-3 w-3 rounded-full bg-red-300" /><span className="h-3 w-3 rounded-full bg-amber-300" /><span className="h-3 w-3 rounded-full bg-emerald-300" />
            <span className="ml-3 rounded-md bg-white px-3 py-1 text-xs text-slate-400 ring-1 ring-slate-200">gasora / dispatch</span>
          </div>
          <div className="grid lg:grid-cols-[1fr_300px]">
            <div className="relative h-72 sm:h-[26rem]">
              <MapMock />
              <div className="absolute left-3 top-3 flex flex-wrap gap-2">
                {['3 vehicles', '24 stops', '412 min', '96 km'].map((t) => <span key={t} className="rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-slate-700 shadow-soft ring-1 ring-slate-200">{t}</span>)}
              </div>
            </div>
            <div className="hidden space-y-3 bg-slate-50 p-4 text-left lg:block">
              {[['Customer 055', 'Critical', '87%', '#dc2626'], ['Customer 112', 'Critical', '81%', '#dc2626'], ['Customer 031', 'High', '46%', '#ea8a00'], ['Customer 078', 'Normal', '18%', '#16a34a']].map(([n, b, r, c]) => (
                <div key={n} className="rounded-xl bg-white p-3 shadow-soft ring-1 ring-slate-200/70">
                  <div className="flex items-center justify-between text-sm"><strong>{n}</strong><span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `${c}1f`, color: c }}>{b}</span></div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: r, background: c }} /></div>
                  <div className="mt-1 text-[11px] text-slate-500">{r} run-out risk</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="absolute -bottom-10 -left-4 hidden w-56 rotate-[-3deg] rounded-3xl bg-ink p-3 text-left text-white shadow-2xl sm:block lg:-left-10">
          <div className="mb-2 flex items-center gap-2 text-xs text-brand-200"><Smartphone size={14} /> Driver app</div>
          <div className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/10">
            <div className="flex items-center gap-2 text-sm font-semibold"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-xs">1</span> Customer 055</div>
            <div className="mt-1 text-[11px] text-brand-100">2 cylinders &middot; owes Rs 500</div>
            <div className="mt-3 rounded-lg bg-emerald-500 py-1.5 text-center text-xs font-semibold">Delivered</div>
          </div>
        </div>
        <div className="absolute -right-4 -top-8 hidden w-52 rotate-[3deg] rounded-2xl bg-white p-4 text-left shadow-2xl ring-1 ring-slate-200 sm:block lg:-right-10">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><Bell size={14} className="text-red-500" /> Urgent request</div>
          <div className="mt-1 text-sm font-semibold">Customer 204 has run out</div>
          <div className="text-[11px] text-slate-500">Added to today&rsquo;s plan at high priority</div>
        </div>
      </div>
    </section>
  )
}

const FEATURES = [
  [Radar, 'Refill prediction', 'A refill window and a 48-hour run-out risk for every customer, learned from delivery history, even when some records are only approximate.'],
  [Route, 'Smart route planning', 'Capacity-aware routes on real roads. Risky customers are visited first and the rest are added when it is worth the distance.'],
  [Cylinder, 'Cylinder tracking', 'Every cylinder has a state, an owner and a holder. Empties held by customers are aged and scheduled as swaps.'],
  [Wallet, 'Ledger & invoices', 'Append-only ledger with correcting entries, partial payments, PDF invoices and a WhatsApp share link.'],
  [Boxes, 'Stock & expenses', 'Purchases raise stock, deliveries lower it. Fuel and running costs sit next to your sales.'],
  [ShieldCheck, 'Audit you can trust', 'A hash-chained log of every important action. Change one old row and the check fails at that row.'],
]

const STEPS = [
  [LineChart, 'Learn', 'Gasora fits each customer’s refill pattern from past deliveries.'],
  [Radar, 'Predict', 'It scores who is likely to run out in the next 48 hours.'],
  [Route, 'Plan', 'It builds today’s routes, balancing risk against distance and van capacity.'],
  [Truck, 'Deliver', 'Drivers get a manifest, tap Delivered, and the books update.'],
]

const ROLES = [
  [Users, 'Owner', 'Dispatch, money, stock, reports, staff and settings.'],
  [ClipboardCheck, 'Manager', 'Sales, payments, purchases and expenses within limits.'],
  [Truck, 'Driver', 'Today’s stops in order, balance owed, empties to collect.'],
  [Smartphone, 'Customer', 'Request a delivery, see bills and the next expected date.'],
  [BarChart3, 'CEO', 'A read-only summary of sales, cash and stock on a phone.'],
]

export default function Landing({ onLogin }) {
  const [open, setOpen] = useState(false)
  const links = [['Features', '#features'], ['How it works', '#how'], ['Roles', '#roles'], ['Evidence', '#evidence']]
  return (
    <div className="h-full overflow-y-auto scroll-smooth bg-white">
      {/* nav */}
      <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-6 sm:pt-5">
        <div className="mx-auto flex max-w-6xl items-center gap-4 rounded-2xl bg-white/90 px-4 py-2.5 shadow-soft ring-1 ring-slate-200/70 backdrop-blur">
          <a href="#top" className="flex items-center gap-2 no-underline hover:no-underline">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 text-white"><Flame size={19} /></span>
            <span className="text-xl font-extrabold tracking-tight text-brand-700">gasora</span>
          </a>
          <nav className="ml-6 hidden gap-1 md:flex">
            {links.map(([l, h]) => <a key={l} href={h} className="rounded-lg px-3 py-2 text-sm font-semibold text-brand-700 no-underline hover:bg-brand-50 hover:no-underline">{l}</a>)}
          </nav>
          <span className="flex-1" />
          <button className="secondary !hidden sm:!inline-flex" onClick={onLogin}>Log in</button>
          <button className="!bg-gradient-to-b !from-amber-300 !to-amber-500 !text-slate-900 !shadow-amber-500/30" onClick={onLogin}>Sign in</button>
          <button className="secondary !p-2 md:!hidden" aria-label="Menu" onClick={() => setOpen(!open)}>{open ? <X size={18} /> : <Menu size={18} />}</button>
        </div>
        {open && (
          <div className="mx-auto mt-2 max-w-6xl rounded-2xl bg-white p-2 shadow-soft ring-1 ring-slate-200 md:hidden">
            {links.map(([l, h]) => <a key={l} href={h} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm font-semibold text-brand-700 no-underline hover:bg-brand-50">{l}</a>)}
          </div>
        )}
      </header>

      <div id="top" />
      <Hero onLogin={onLogin} />

      {/* features */}
      <section id="features" className="mx-auto max-w-6xl px-5 py-24">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <h2 className="m-0 text-4xl font-extrabold tracking-tight sm:text-5xl">One system for the whole delivery day</h2>
          <p className="mt-4 text-lg text-slate-600">From the first prediction to the last payment, every step uses the same records.</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([Icon, t, d]) => (
            <div key={t} className="group rounded-3xl bg-gradient-to-br from-white to-brand-50/70 p-7 shadow-soft ring-1 ring-slate-200/70 transition hover:-translate-y-1 hover:shadow-xl">
              <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-600/30"><Icon size={23} /></span>
              <h3 className="m-0 text-xl font-bold">{t}</h3>
              <p className="mb-0 mt-2 text-slate-600">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* how */}
      <section id="how" className="bg-gradient-to-br from-ink via-brand-900 to-brand-700 px-5 py-24 text-white">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <h2 className="m-0 text-4xl font-extrabold tracking-tight !text-white sm:text-5xl">How a day with Gasora runs</h2>
            <p className="mt-4 text-lg text-brand-100">Four steps, repeated every morning.</p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(([Icon, t, d], i) => (
              <div key={t} className="relative rounded-3xl bg-white/8 p-6 ring-1 ring-white/15 backdrop-blur">
                <span className="absolute right-5 top-4 text-5xl font-extrabold text-white/10">{i + 1}</span>
                <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-white/15"><Icon size={21} /></span>
                <h3 className="m-0 text-lg font-bold !text-white">{t}</h3>
                <p className="mb-0 mt-2 text-sm text-brand-100">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* roles */}
      <section id="roles" className="mx-auto max-w-6xl px-5 py-24">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <h2 className="m-0 text-4xl font-extrabold tracking-tight sm:text-5xl">A screen for everyone on the team</h2>
          <p className="mt-4 text-lg text-slate-600">Each role sees only what it needs, on a desktop or a phone.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {ROLES.map(([Icon, t, d]) => (
            <div key={t} className="rounded-2xl bg-white p-5 text-center shadow-soft ring-1 ring-slate-200/70">
              <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600"><Icon size={22} /></span>
              <h3 className="m-0 text-base font-bold">{t}</h3>
              <p className="mb-0 mt-1.5 text-sm text-slate-600">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* evidence */}
      <section id="evidence" className="bg-brand-50 px-5 py-24">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
          <div>
            <h2 className="m-0 text-4xl font-extrabold tracking-tight sm:text-5xl">Tested before it is trusted</h2>
            <p className="mt-4 text-lg text-slate-600">
              The planner was compared with reactive delivery and with simple average-interval rules in a simulator of 200 customers on a real city road network.
              The test plan was written down first and frozen, then confirmed once on 20 fresh random seeds.
            </p>
            <ul className="mt-6 list-none space-y-3 p-0">
              {['Pre-registered protocol and a logged list of every variant tried', 'Paired comparisons with 95% bootstrap intervals', 'Limits reported openly, including that this is a simulation'].map((t) => (
                <li key={t} className="flex items-start gap-3"><span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white"><Check size={14} /></span><span>{t}</span></li>
              ))}
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[['200', 'simulated customers'], ['20', 'confirmation seeds'], ['6', 'policies compared'], ['2', 'vehicles per day']].map(([n, l]) => (
              <div key={l} className="rounded-3xl bg-white p-7 text-center shadow-soft ring-1 ring-slate-200/70">
                <div className="bg-gradient-to-r from-brand-600 to-sky-500 bg-clip-text text-5xl font-extrabold text-transparent">{n}</div>
                <div className="mt-1 text-sm font-medium text-slate-600">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* cta */}
      <section className="px-5 py-24">
        <div className="relative mx-auto max-w-5xl overflow-hidden rounded-[2rem] bg-gradient-to-br from-brand-700 to-brand-500 px-6 py-16 text-center text-white shadow-2xl shadow-brand-700/30">
          <div className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
          <MapPin className="mx-auto mb-4 opacity-80" size={32} />
          <h2 className="m-0 text-4xl font-extrabold tracking-tight !text-white">Ready to see today&rsquo;s plan?</h2>
          <p className="mx-auto mb-8 mt-3 max-w-xl text-lg text-brand-100">Sign in to open the dashboard, the dispatch map and the driver screens.</p>
          <button className="!rounded-2xl !bg-gradient-to-b !from-amber-300 !to-amber-500 !px-8 !py-3.5 !text-base !text-slate-900" onClick={onLogin}>Sign in <ArrowRight size={18} /></button>
        </div>
      </section>

      <footer className="border-t border-slate-200 px-5 py-10 text-center text-sm text-slate-500">
        <div className="mb-2 flex items-center justify-center gap-2 font-bold text-brand-700"><Flame size={16} /> Gasora</div>
        UAF BS Computer Science final-year project &middot; Python, FastAPI, OR-Tools, React, Leaflet
      </footer>
    </div>
  )
}
