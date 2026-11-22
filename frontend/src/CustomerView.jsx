import { useCallback, useEffect, useState } from 'react'
import { downloadFile, getMe, postMyRequest } from './api'
import { rs } from './ui'
import { useGuard } from './hooks'

export default function CustomerView({ auth, onSignOut, onExpired }) {
  const { busy, error, run } = useGuard(onExpired)
  const [me, setMe] = useState(null)
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState('')
  const load = useCallback(async () => { setMe(await getMe(auth.token)) }, [auth.token])
  useEffect(() => { run(load) }, [run, load])

  const send = (urgent) => run(async () => {
    setMsg('')
    await postMyRequest(auth.token, urgent, note.trim())
    setNote('')
    setMsg(urgent ? 'Your urgent request was sent. The agency will try to reach you today.' : 'Your request was sent. The agency will contact you.')
    await load()
  })

  return (
    <div className="app">
      <header>
        <strong>Gasora</strong>
        <span className="muted">{me ? me.name : auth.username}</span>
        <span className="spacer" />
        <button className="secondary" disabled={busy} onClick={() => run(load)}>Refresh</button>
        <button className="secondary" onClick={onSignOut}>Sign out</button>
      </header>
      <div className="page">
        {error && <p className="error banner">{error}</p>}
        {me && (
          <>
            <div className="card">
              <h2>Your account</h2>
              <div className="tiles">
                <div className={me.balance > 0 ? 'tile warn' : 'tile'}><div className="muted">{me.balance > 0 ? 'You owe' : 'Balance'}</div><div className="tilevalue">{rs(me.balance)}</div></div>
                <div className="tile"><div className="muted">Last delivery</div><div className="tilevalue">{me.last_delivery || 'none yet'}</div></div>
                <div className="tile"><div className="muted">Empty cylinders you hold</div><div className="tilevalue">{me.empties_held}</div>{me.empties_days !== null && <div className="muted">for {me.empties_days} days</div>}</div>
              </div>
              <p className="muted">Next delivery: {me.next_expected}. This is an estimate from your own past orders, not a promise.</p>
              {me.price !== null && <p className="muted">Price per cylinder: {rs(me.price)}.</p>}
            </div>

            <div className="card">
              <h2>Ask for a delivery</h2>
              <input placeholder="Note for the agency (optional, max 200 characters)" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="row">
                <button disabled={busy} onClick={() => send(false)}>Request a delivery</button>
                <button className="secondary" disabled={busy} onClick={() => send(true)} title="Use this only if you have run out">I have run out (urgent)</button>
              </div>
              {msg && <p>{msg}</p>}
              {me.open_requests.length > 0 && (
                <ul>{me.open_requests.map((r, i) => <li key={i}>{r.kind} request from {r.date}{r.note ? `: ${r.note}` : ''} (waiting)</li>)}</ul>
              )}
            </div>

            <div className="card">
              <h2>Bills and payments</h2>
              <div className="tablewrap">
                <table>
                  <thead><tr><th>Date</th><th>What</th><th>Amount</th><th /></tr></thead>
                  <tbody>
                    {me.entries.map((e, i) => (
                      <tr key={i}>
                        <td>{e.date}</td><td>{e.kind}{e.invoice_number ? ` ${e.invoice_number}` : ''}</td>
                        <td>{e.amount > 0 ? '+' : ''}{e.amount.toLocaleString('en-US')}</td>
                        <td>{e.invoice_id && <button className="secondary" disabled={busy} onClick={() => run(() => downloadFile(auth.token, `/me/invoices/${e.invoice_id}/pdf`, `${e.invoice_number}.pdf`))}>PDF</button>}</td>
                      </tr>
                    ))}
                    {me.entries.length === 0 && <tr><td colSpan="4" className="muted">Nothing yet.</td></tr>}
                  </tbody>
                </table>
              </div>
              <p className="muted">Showing your latest 30 entries. A positive amount is a bill; a negative amount is a payment.</p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
