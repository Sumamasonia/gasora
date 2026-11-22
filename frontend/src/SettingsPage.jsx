import { useCallback, useEffect, useState } from 'react'
import { getSettings, putLowStock, putSettings } from './api'
import { setCurrency } from './ui'
import { useGuard } from './hooks'

export default function SettingsPage({ auth, onExpired }) {
  const { busy, error, run } = useGuard(onExpired)
  const [form, setForm] = useState(null)
  const [note, setNote] = useState('')
  const [formError, setFormError] = useState('')

  const load = useCallback(async () => {
    const s = await getSettings(auth.token)
    setForm({ currency: s.currency, depot_lat: String(s.depot_lat), depot_lon: String(s.depot_lon),
      overdue_days: String(s.overdue_days), low_stock: String(s.low_stock_threshold) })
  }, [auth.token])
  useEffect(() => { run(load) }, [run, load])
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const save = () => {
    const lat = Number(form.depot_lat), lon = Number(form.depot_lon), days = Number(form.overdue_days), low = Number(form.low_stock)
    if (!form.currency.trim() || form.currency.trim().length > 6) return setFormError('The currency label needs 1 to 6 characters.')
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return setFormError('Give the depot latitude and longitude as numbers (for example 31.4181 and 73.0776).')
    if (!Number.isInteger(days) || days < 1 || days > 60) return setFormError('Overdue days must be a whole number from 1 to 60.')
    if (!Number.isInteger(low) || low < 0) return setFormError('The stock warning level must be a whole number, 0 or more.')
    setFormError(''); setNote('')
    run(async () => {
      await putSettings(auth.token, { currency: form.currency.trim(), depot_lat: lat, depot_lon: lon, overdue_days: days })
      await putLowStock(auth.token, low)
      setCurrency(form.currency.trim())
      await load()
      setNote('Saved. The depot and overdue days apply to the next plan you create; open the Dispatch tab and press Refresh plan.')
    })
  }

  return (
    <div className="page">
      {error && <p className="error banner">{error}</p>}
      {form && (
        <div className="card">
          <h2>Settings</h2>
          <div className="formgrid">
            <label>Currency label (shown on screens and invoices)<input value={form.currency} onChange={set('currency')} maxLength={6} /></label>
            <label>Empties overdue after (days)<input inputMode="numeric" value={form.overdue_days} onChange={set('overdue_days')} /></label>
            <label>Warn when filled stock is at or below<input inputMode="numeric" value={form.low_stock} onChange={set('low_stock')} /></label>
            <label>Depot latitude<input inputMode="decimal" value={form.depot_lat} onChange={set('depot_lat')} /></label>
            <label>Depot longitude<input inputMode="decimal" value={form.depot_lon} onChange={set('depot_lon')} /></label>
          </div>
          <p className="muted">
            The depot is where vans start and end. Copy the numbers from a map (right-click the place in Google Maps and
            click the numbers). The later ageing steps stay at 30, 60 and 90 days. The price of a cylinder is on the Accounts tab.
          </p>
          {formError && <p className="error">{formError}</p>}
          <div className="row"><button disabled={busy} onClick={save}>Save settings</button></div>
          {note && <p className="muted">{note}</p>}
        </div>
      )}
    </div>
  )
}
