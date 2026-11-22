import { useCallback, useEffect, useState } from 'react'
import { createUser, getCustomers, getStaffActivity, resetUserPassword, setUserActive } from './api'
import { useGuard } from './hooks'

const ROLE_HELP = {
  owner: 'Everything',
  manager: 'Enters sales, payments, purchases and expenses; cannot set prices, correct balances or manage staff',
  driver: 'Own routes and deliveries only',
  ceo: 'Read-only summary numbers',
  customer: 'Sees own bills, balance and next delivery; can place requests (link to a customer record)',
}

export default function StaffPage({ auth, onExpired }) {
  const { busy, error, run } = useGuard(onExpired)
  const [data, setData] = useState(null)
  const [days, setDays] = useState(30)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('driver')
  const [customers, setCustomers] = useState([])
  const [customerId, setCustomerId] = useState('')
  const [formError, setFormError] = useState('')

  const load = useCallback(async () => { setData(await getStaffActivity(auth.token, days)) }, [auth.token, days])
  useEffect(() => { run(load) }, [run, load])
  useEffect(() => { run(async () => setCustomers(await getCustomers(auth.token))) }, [run, auth.token])

  const add = () => {
    if (name.trim().length < 3) return setFormError('The username needs at least 3 characters.')
    if (password.length < 8) return setFormError('The password needs at least 8 characters.')
    if (role === 'customer' && !customerId) return setFormError('Choose which customer this login belongs to.')
    setFormError('')
    run(async () => {
      await createUser(auth.token, { username: name.trim(), password, role, customer_id: role === 'customer' ? Number(customerId) : null })
      setName(''); setPassword(''); setCustomerId(''); await load()
    })
  }
  const reset = (u) => {
    const pw = window.prompt(`New password for ${u.username} (8+ characters). They will be signed out everywhere.`)
    if (pw === null) return
    if (pw.length < 8) return setFormError('The password needs at least 8 characters.')
    setFormError('')
    run(async () => { await resetUserPassword(auth.token, u.user_id, pw); setFormError(`Password changed for ${u.username}. Tell them the new password in person or by phone.`) })
  }
  const toggle = (u) => run(async () => { await setUserActive(auth.token, u.user_id, !u.active); await load() })

  return (
    <div className="page">
      {error && <p className="error banner">{error}</p>}
      <div className="card">
        <h2>Add a staff account</h2>
        <div className="row">
          <input placeholder="Username" value={name} onChange={(e) => setName(e.target.value)} />
          <input type="password" placeholder="Password (8+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} />
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {Object.keys(ROLE_HELP).map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          {role === 'customer' && (
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Customer...</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <button disabled={busy} onClick={add}>Add</button>
        </div>
        <p className="muted">{role}: {ROLE_HELP[role]}.</p>
        {formError && <p className="error">{formError}</p>}
      </div>
      <div className="card">
        <div className="row">
          <h2 style={{ margin: 0 }}>Staff and activity</h2>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
          </select>
        </div>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Username</th><th>Role</th><th>Status</th><th>Actions logged</th><th>Last action</th><th>Most common</th><th /></tr></thead>
            <tbody>
              {data?.staff.map((u) => (
                <tr key={u.user_id} style={u.active ? undefined : { opacity: 0.55 }}>
                  <td>{u.username}</td><td>{u.role}</td><td>{u.active ? 'active' : 'switched off'}</td>
                  <td>{u.events}</td><td className="muted">{u.last_event ? u.last_event.slice(0, 16).replace('T', ' ') : 'none'}</td>
                  <td className="muted">{u.top_types.map(([t, n]) => `${t} (${n})`).join(', ')}</td>
                  <td>{u.username !== auth.username && (
                    <>
                      <button className="secondary" disabled={busy} onClick={() => toggle(u)}>{u.active ? 'Switch off' : 'Switch on'}</button>{' '}
                      <button className="secondary" disabled={busy} onClick={() => reset(u)}>Reset password</button>
                    </>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">A switched-off person cannot sign in and an open session stops working. Accounts are never deleted, so their history stays. Activity comes from the audit log, which records the logged actions only (deliveries, payments and so on), not page views.</p>
      </div>
    </div>
  )
}
