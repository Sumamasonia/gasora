import { BAND_COLOR } from './colors'

export function Badge({ band }) {
  return <span className="badge" style={{ background: BAND_COLOR[band] || '#666' }}>{band}</span>
}

export function UrgentTag() {
  return <span className="badge" style={{ background: BAND_COLOR.Urgent }}>Urgent request</span>
}

export function SwapTag() {
  return <span className="badge" style={{ background: BAND_COLOR.Swap }}>Swap</span>
}

// The currency label is set by the owner (Settings tab) and loaded at sign-in.
let currencyLabel = 'Rs'
export const setCurrency = (c) => { currencyLabel = c || 'Rs' }
export const currency = () => currencyLabel
export const rs = (n) => `${currencyLabel} ${Math.round(Number(n)).toLocaleString('en-US')}`
