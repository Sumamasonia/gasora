import { BAND_COLOR } from './colors'

export function Badge({ band }) {
  return <span className="badge" style={{ background: BAND_COLOR[band] || '#666' }}>{band}</span>
}

export function UrgentTag() {
  return <span className="badge" style={{ background: BAND_COLOR.Urgent }}>Urgent request</span>
}
