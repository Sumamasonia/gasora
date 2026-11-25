import { BAND_COLOR } from './colors'

const soft = (c) => ({ background: `${c}1f`, color: c, boxShadow: `inset 0 0 0 1px ${c}33` })

export function Badge({ band }) {
  return <span className="badge" style={soft(BAND_COLOR[band] || '#666')}>{band}</span>
}

export function UrgentTag() {
  return <span className="badge" style={soft(BAND_COLOR.Urgent)}>Urgent request</span>
}

export function SwapTag() {
  return <span className="badge" style={soft(BAND_COLOR.Swap)}>Swap</span>
}

const TONES = {
  brand: 'from-brand-500 to-brand-700 shadow-brand-600/30',
  green: 'from-emerald-400 to-emerald-600 shadow-emerald-600/30',
  amber: 'from-amber-400 to-orange-500 shadow-orange-500/30',
  red: 'from-rose-400 to-red-600 shadow-red-600/30',
  sky: 'from-sky-400 to-blue-600 shadow-blue-600/30',
}

// A big-number tile with a coloured icon chip, used on the Overview and the summary screens.
export function Kpi({ icon: Icon, label, value, sub, tone = 'brand', warn }) {
  return (
    <div className={`rise flex items-start gap-3.5 rounded-2xl bg-white p-4 shadow-soft ring-1 ${warn ? 'ring-amber-300' : 'ring-slate-200/70'}`}>
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg ${TONES[tone]}`}>
        {Icon && <Icon size={21} />}
      </span>
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-slate-500">{label}</div>
        <div className="truncate text-2xl font-bold tracking-tight text-slate-900">{value}</div>
        {sub && <div className="text-xs text-slate-500">{sub}</div>}
      </div>
    </div>
  )
}

// The currency label is set by the owner (Settings tab) and loaded at sign-in.
let currencyLabel = 'Rs'
export const setCurrency = (c) => { currencyLabel = c || 'Rs' }
export const currency = () => currencyLabel
export const rs = (n) => `${currencyLabel} ${Math.round(Number(n)).toLocaleString('en-US')}`
