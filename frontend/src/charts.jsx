import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { BAND_COLOR } from './colors'

const tip = { borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 8px 24px -8px rgb(20 18 58 / .2)', fontSize: 12 }

export function DeliveriesChart({ series, height = 240 }) {
  const data = series.map((d) => ({ ...d, label: d.day.slice(5) }))
  return (
    <div style={{ height }} role="img" aria-label="Cylinders delivered per day">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="gdel" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6d5ef0" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#6d5ef0" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#eef0f5" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <Tooltip contentStyle={tip} formatter={(v, n) => [v, n === 'cylinders' ? 'Cylinders' : 'Deliveries']} />
          <Area type="monotone" dataKey="cylinders" stroke="#5a48e0" strokeWidth={2.5} fill="url(#gdel)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export function RiskDonut({ counts }) {
  const data = ['Critical', 'High', 'Normal'].map((k) => ({ name: k, value: counts[k] || 0 }))
  const total = data.reduce((n, d) => n + d.value, 0)
  return (
    <div className="relative h-44 w-44">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" innerRadius={56} outerRadius={80} paddingAngle={total ? 3 : 0} stroke="none" cornerRadius={6}>
            {data.map((d) => <Cell key={d.name} fill={BAND_COLOR[d.name]} />)}
          </Pie>
          <Tooltip contentStyle={tip} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-slate-900">{total}</span>
        <span className="text-[11px] text-slate-500">customers</span>
      </div>
    </div>
  )
}

export function AgeingBars({ buckets, height = 200 }) {
  const data = buckets.map((b) => ({ name: `${b.label} d`, amount: b.amount, customers: b.customers }))
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#eef0f5" />
          <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <Tooltip contentStyle={tip} cursor={{ fill: '#f3f1ff' }} formatter={(v, n, p) => [`${Number(v).toLocaleString('en-US')} (${p.payload.customers} customers)`, 'Owed']} />
          <Bar dataKey="amount" radius={[8, 8, 0, 0]} fill="#6d5ef0" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
