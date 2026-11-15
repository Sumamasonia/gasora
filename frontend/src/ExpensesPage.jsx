import { useCallback, useEffect, useState } from 'react'
import { getExpenses, postExpense } from './api'
import { useGuard } from './hooks'

const rs = (n) => `Rs ${Number(n).toLocaleString('en-US')}`
const iso = (d) => d.toISOString().slice(0, 10)
const RANGES = {
  all: { label: 'All time', start: () => '' },
  month: { label: 'Last 30 days', start: () => iso(new Date(Date.now() - 30 * 864e5)) },
  week: { label: 'Last 7 days', start: () => iso(new Date(Date.now() - 7 * 864e5)) },
}

export default function ExpensesPage({ auth, onExpired }) {
  const { busy, error, run } = useGuard(onExpired)
  const [data, setData] = useState(null)
  const [range, setRange] = useState('month')
  const [category, setCategory] = useState('fuel')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [formError, setFormError] = useState('')

  const load = useCallback(async () => { setData(await getExpenses(auth.token, RANGES[range].start())) }, [auth.token, range])
  useEffect(() => { run(load) }, [run, load])

  const add = () => {
    if (!/^-?\d+$/.test(amount.trim()) || Number(amount) === 0) return setFormError('Enter a whole number of rupees that is not zero.')
    if (Number(amount) < 0 && !note.trim()) return setFormError('A correction (negative amount) needs a note that says why.')
    setFormError('')
    run(async () => {
      await postExpense(auth.token, { category, amount: Number(amount), note: note.trim() || null })
      setAmount(''); setNote(''); await load()
    })
  }

  return (
    <div className="page">
      {error && <p className="error banner">{error}</p>}
      <div className="card">
        <h2>Add an expense</h2>
        <div className="row">
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {(data?.categories || ['fuel', 'salary', 'maintenance', 'rent', 'other']).map((c) => <option key={c}>{c}</option>)}
          </select>
          <input style={{ maxWidth: 140 }} placeholder="Rupees" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <input placeholder="Note (e.g. van 1, 3 trips)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button disabled={busy} onClick={add}>Add expense</button>
        </div>
        <p className="muted">Entries are never edited or deleted. To fix a mistake, add the same category with a negative amount and a note.</p>
        {formError && <p className="error">{formError}</p>}
      </div>

      <div className="card">
        <div className="row">
          <h2 style={{ margin: 0 }}>Expenses</h2>
          <select value={range} onChange={(e) => setRange(e.target.value)}>
            {Object.entries(RANGES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        {data && (
          <>
            <div className="counts">
              <div><strong>{rs(data.total)}</strong> in total</div>
              {Object.entries(data.by_category).filter(([, v]) => v !== 0).map(([k, v]) => (
                <div key={k} className="muted">{k}: {rs(v)}</div>
              ))}
            </div>
            <div className="tablewrap">
              <table>
                <thead><tr><th>Date</th><th>Category</th><th>Amount</th><th>Note</th><th>By</th></tr></thead>
                <tbody>
                  {data.entries.map((e) => (
                    <tr key={e.id}><td>{e.day}</td><td>{e.category}</td><td>{e.amount.toLocaleString('en-US')}</td>
                      <td className="muted">{e.note || ''}</td><td>{e.actor}</td></tr>
                  ))}
                  {data.entries.length === 0 && <tr><td colSpan="5" className="muted">No expenses in this period.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
