import { useCallback, useEffect, useState } from 'react'
import { createCustomer, getCustomers, updateCustomer } from './api'
import { useGuard } from './hooks'

const EMPTY = { name: '', phone: '', address: '', lat: '', lon: '', demand: 1 }

function toBody(f) {
  return {
    name: f.name.trim(),
    phone: f.phone.trim() || null,
    address: f.address.trim() || null,
    lat: Number(f.lat),
    lon: Number(f.lon),
    demand: Number(f.demand),
  }
}

export default function CustomersPage({ auth, onExpired }) {
  const { busy, error, run } = useGuard(onExpired)
  const [customers, setCustomers] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState(null)       // customer id being edited, or null for a new customer
  const [filter, setFilter] = useState('')
  const [formError, setFormError] = useState('')

  const load = useCallback(async () => { setCustomers(await getCustomers(auth.token)) }, [auth.token])
  useEffect(() => { run(load) }, [run, load])

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const reset = () => { setForm(EMPTY); setEditing(null); setFormError('') }

  const save = () => {
    if (!form.name.trim()) return setFormError('Name is required.')
    if (form.lat === '' || form.lon === '' || Number.isNaN(Number(form.lat)) || Number.isNaN(Number(form.lon))) {
      return setFormError('Latitude and longitude are required numbers (for example 31.4180 and 73.0790).')
    }
    setFormError('')
    run(async () => {
      const body = toBody(form)
      if (editing) await updateCustomer(auth.token, editing, body)
      else await createCustomer(auth.token, body)
      reset()
      await load()
    })
  }

  const shown = customers.filter((c) =>
    `${c.name} ${c.phone || ''} ${c.address || ''}`.toLowerCase().includes(filter.toLowerCase()))

  return (
    <div className="page">
      {error && <p className="error banner">{error}</p>}
      <div className="card">
        <h2>{editing ? `Edit customer ${editing}` : 'Add a customer'}</h2>
        <div className="formgrid">
          <label>Name<input value={form.name} onChange={set('name')} /></label>
          <label>Phone<input value={form.phone} onChange={set('phone')} /></label>
          <label>Address<input value={form.address} onChange={set('address')} /></label>
          <label>Latitude<input value={form.lat} onChange={set('lat')} inputMode="decimal" /></label>
          <label>Longitude<input value={form.lon} onChange={set('lon')} inputMode="decimal" /></label>
          <label>Cylinders per refill<input type="number" min="1" max="10" value={form.demand} onChange={set('demand')} /></label>
        </div>
        {formError && <p className="error">{formError}</p>}
        <div className="row">
          <button disabled={busy} onClick={save}>{editing ? 'Save changes' : 'Add customer'}</button>
          {editing && <button className="secondary" onClick={reset}>Cancel</button>}
        </div>
        <p className="muted">Coordinates can be copied from a map: right-click the place in Google Maps and click the numbers.</p>
      </div>

      <div className="card">
        <div className="row">
          <h2 style={{ margin: 0 }}>Customers ({customers.length})</h2>
          <input placeholder="Search name, phone or address" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <div className="tablewrap">
          <table>
            <thead><tr><th>ID</th><th>Name</th><th>Phone</th><th>Address</th><th>Cyl.</th><th /></tr></thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id}>
                  <td>{c.id}</td><td>{c.name}</td><td>{c.phone || ''}</td><td>{c.address || ''}</td><td>{c.demand}</td>
                  <td>
                    <button className="secondary" onClick={() => {
                      setEditing(c.id)
                      setForm({ name: c.name, phone: c.phone || '', address: c.address || '', lat: c.lat, lon: c.lon, demand: c.demand })
                      window.scrollTo({ top: 0 })
                    }}>Edit</button>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan="6" className="muted">No customers match.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
