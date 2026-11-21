import { useEffect, useState } from 'react'
import { askAssistant, getAssistant } from './api'
import { useGuard } from './hooks'

const EXAMPLES = ['How much did we bill in the last 30 days compared with what we collected?', 'Is stock low?', 'Which ageing group owes the most?']

export default function AssistantPage({ auth, onExpired }) {
  const { busy, error, run } = useGuard(onExpired)
  const [status, setStatus] = useState(null)
  const [q, setQ] = useState('')
  const [chat, setChat] = useState([])

  useEffect(() => { run(async () => setStatus(await getAssistant(auth.token))) }, [run, auth.token])
  const ask = (text) => {
    const question = (text ?? q).trim()
    if (!question) return
    setQ('')
    run(async () => { const r = await askAssistant(auth.token, question); setChat((c) => [{ q: question, a: r.answer }, ...c]) })
  }

  return (
    <div className="page">
      {error && <p className="error banner">{error}</p>}
      <div className="card">
        <h2>Business assistant</h2>
        <p className="muted">Answers questions from the totals on the Reports tab. It is sent totals and counts only (no customer names, phone numbers or addresses), it cannot change anything, and it can be wrong: check important figures on the pages.</p>
        {status && !status.configured && <p className="error">Not set up. Set the GASORA_GEMINI_KEY environment variable and restart the server.</p>}
        <div className="row">
          <input placeholder="Ask a question" maxLength={500} value={q} disabled={!status?.configured} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && ask()} />
          <button disabled={busy || !status?.configured || !q.trim()} onClick={() => ask()}>{busy ? 'Thinking...' : 'Ask'}</button>
        </div>
        <div className="row">{EXAMPLES.map((e) => <button key={e} className="secondary" disabled={busy || !status?.configured} onClick={() => ask(e)}>{e}</button>)}</div>
      </div>
      {chat.map((c, i) => (
        <div className="card" key={i}><strong>{c.q}</strong><div style={{ whiteSpace: 'pre-wrap' }}>{c.a}</div></div>
      ))}
    </div>
  )
}
