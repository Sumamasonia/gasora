import { useCallback, useEffect, useMemo, useState } from 'react'
import { getAuditEvents, getSettings, updateSettings, verifyAudit } from '../../api'
import Modal from '../../components/Modal'
import NotReady from '../../components/NotReady'
import Pagination from '../../components/Pagination'
import Spinner from '../../components/Spinner'
import './admin.css'

export default function AuditPage({ auth, onNavigate, onExpired }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toastMessage, setToastMessage] = useState('')

  // Verification state
  const [verifying, setVerifying] = useState(false)
  const [verifyResult, setVerifyResult] = useState(null)
  const [tamperSimulated, setTamperSimulated] = useState(false)
  const [togglingTamper, setTogglingTamper] = useState(false)

  // Filters
  const [search, setSearch] = useState('')
  const [actorFilter, setActorFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')

  // Pagination (5 items per page)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 5

  useEffect(() => {
    setPage(0)
  }, [search, actorFilter, typeFilter])

  // Selected event modal
  const [selectedEvent, setSelectedEvent] = useState(null)

  // Fetch events & settings
  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const [eventsList, settings] = await Promise.all([
        getAuditEvents(auth.token),
        getSettings(auth.token).catch(() => ({})),
      ])
      setEvents(eventsList || [])
      setTamperSimulated(Boolean(settings?.simulate_tampered_audit))
    } catch (err) {
      if (err && err.status === 401) { onExpired?.(); return; }
      setError(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }, [auth.token])

  useEffect(() => {
    if (auth?.role === 'owner' || auth?.role === 'ceo') {
      fetchData()
    }
  }, [auth?.role, fetchData])

  // Run audit chain verification
  const handleVerify = async () => {
    setVerifying(true)
    setError('')
    try {
      const res = await verifyAudit(auth.token)
      setVerifyResult(res)
      if (res.ok) {
        setToastMessage(`✓ Verification Complete: ${res.message}`)
      } else {
        setToastMessage(`⚠️ Verification Failed: ${res.message}`)
      }
      setTimeout(() => setToastMessage(''), 5000)
    } catch (err) {
      setError(err.message || 'Verification request failed')
    } finally {
      setVerifying(false)
    }
  }

  // Toggle simulate tampered row
  const handleToggleTamper = async () => {
    setTogglingTamper(true)
    try {
      const newState = !tamperSimulated
      await updateSettings(auth.token, { simulate_tampered_audit: newState })
      setTamperSimulated(newState)
      setVerifyResult(null) // Reset verify state to let user verify again
      setToastMessage(
        newState
          ? '⚠️ Simulation Enabled: Event row #3 has been tampered in memory. Click "Verify Log Chain" to see detection.'
          : '✓ Simulation Disabled: All event log hashes restored to valid state.'
      )
      setTimeout(() => setToastMessage(''), 5000)
    } catch (err) {
      setError(err.message || 'Failed to update tamper simulation')
    } finally {
      setTogglingTamper(false)
    }
  }

  // Filtered Events
  const filteredEvents = useMemo(() => {
    return [...events]
      .reverse() // Newest first
      .filter((e) => {
        const actor = (e.actor || '').toLowerCase()
        const eventType = (e.event_type || e.type || '').toLowerCase()
        const desc = (e.description || '').toLowerCase()
        const payloadStr = JSON.stringify(e.payload || e.details || '').toLowerCase()
        const hash = (e.hash || '').toLowerCase()
        const s = search.toLowerCase()

        const matchSearch =
          !s ||
          actor.includes(s) ||
          eventType.includes(s) ||
          desc.includes(s) ||
          payloadStr.includes(s) ||
          hash.includes(s)

        const matchActor = actorFilter === 'all' || e.actor === actorFilter
        const matchType = typeFilter === 'all' || (e.event_type || e.type) === typeFilter

        return matchSearch && matchActor && matchType
      })
  }, [events, search, actorFilter, typeFilter])

  // Distinct actors and types for dropdowns
  const distinctActors = useMemo(() => {
    const set = new Set(events.map((e) => e.actor).filter(Boolean))
    return Array.from(set)
  }, [events])

  const distinctTypes = useMemo(() => {
    const set = new Set(events.map((e) => e.event_type || e.type).filter(Boolean))
    return Array.from(set)
  }, [events])

  // Non-owner / non-CEO guard
  if (auth?.role !== 'owner' && auth?.role !== 'ceo') {
    return (
      <div className="admin-page-container">
        <div className="customer-card urgent-banner" style={{ textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🔒</div>
          <h2>Access Restricted</h2>
          <p className="muted" style={{ margin: '8px 0 16px 0' }}>
            The activity log and cryptographic verification ledger is restricted to Owner and CEO accounts.
          </p>
          <button type="button" onClick={() => onNavigate('dispatch')}>
            Return to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-page-container">
      {/* Page Header */}
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">
            <span>🛡️</span>
            <span>Activity Log & Chain Verification</span>
          </h1>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Append-only, SHA-256 hash-chained event stream. Any modification or deletion of past records breaks the cryptographic link.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            type="button"
            className="secondary"
            onClick={fetchData}
            disabled={loading}
            style={{ fontSize: 13 }}
          >
            ↻ Refresh Log
          </button>
          <button
            type="button"
            onClick={handleVerify}
            disabled={verifying}
            style={{
              background: verifyResult?.ok === false ? '#dc2626' : '#2563eb',
              color: '#fff',
              fontWeight: 700,
            }}
          >
            {verifying ? 'Verifying Hashes...' : '🛡️ Verify Log Chain'}
          </button>
        </div>
      </div>

      {toastMessage && (
        <div
          style={{
            background: toastMessage.includes('⚠️') ? '#fef2f2' : '#dcfce7',
            borderColor: toastMessage.includes('⚠️') ? '#fca5a5' : '#86efac',
            color: toastMessage.includes('⚠️') ? '#991b1b' : '#15803d',
            padding: '10px 14px',
            borderRadius: 8,
            marginBottom: 16,
            fontWeight: 700,
            fontSize: 13,
            border: '1px solid',
          }}
        >
          {toastMessage}
        </div>
      )}

      {error && (
        <div
          style={{
            background: '#fee2e2',
            borderColor: '#fca5a5',
            color: '#b91c1c',
            padding: '10px 14px',
            borderRadius: 8,
            marginBottom: 16,
            fontWeight: 600,
            fontSize: 13,
            border: '1px solid',
          }}
        >
          {typeof error === 'string' ? error : error?.message || 'Error loading audit events'}
        </div>
      )}

      {/* Verification Status Card */}
      <div
        className="admin-card"
        style={{
          borderLeft: `5px solid ${
            verifyResult === null
              ? '#94a3b8'
              : verifyResult.ok
              ? '#16a34a'
              : '#dc2626'
          }`,
          background:
            verifyResult === null
              ? '#f8fafc'
              : verifyResult.ok
              ? '#f0fdf4'
              : '#fef2f2',
          padding: 16,
          marginBottom: 20,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 20 }}>
                {verifyResult === null ? '🔍' : verifyResult.ok ? '✅' : '🚨'}
              </span>
              <h3 style={{ margin: 0, fontSize: 16, color: verifyResult?.ok === false ? '#991b1b' : '#0f172a' }}>
                {verifyResult === null
                  ? 'Chain Status: Not Yet Verified in Current Session'
                  : verifyResult.ok
                  ? 'Cryptographic Chain Verified: PASS'
                  : 'Chain Tampering Detected: INTEGRITY COMPROMISED'}
              </h3>
            </div>
            <p style={{ margin: '0 0 8px 0', fontSize: 13, color: '#334155' }}>
              {verifyResult === null
                ? 'Click "Verify Log Chain" to inspect the SHA-256 chain links from genesis (0000...) to the current head.'
                : verifyResult.message}
            </p>
            {verifyResult && (
              <div style={{ fontSize: 12, fontFamily: 'monospace', color: '#475569', wordBreak: 'break-all' }}>
                <strong>Head Hash:</strong> {verifyResult.head || 'None'}
              </div>
            )}
          </div>

          {/* Tamper Switch Controls */}
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 8,
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                Demo Tampering Simulator
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {tamperSimulated
                  ? 'Row #3 corrupted (simulating manual DB alteration)'
                  : 'Chain pristine (all SHA-256 links intact)'}
              </div>
            </div>
            <button
              type="button"
              className={tamperSimulated ? 'secondary' : ''}
              onClick={handleToggleTamper}
              disabled={togglingTamper}
              style={{
                fontSize: 12,
                padding: '6px 10px',
                background: tamperSimulated ? '#fee2e2' : '#f1f5f9',
                color: tamperSimulated ? '#991b1b' : '#334155',
                borderColor: tamperSimulated ? '#fca5a5' : '#cbd5e1',
                border: '1px solid',
                cursor: 'pointer',
              }}
            >
              {togglingTamper
                ? 'Updating...'
                : tamperSimulated
                ? 'Restore Clean Log'
                : 'Corrupt Event #3'}
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="admin-grid-kpis" style={{ marginBottom: 20 }}>
        <div className="admin-kpi-card">
          <div className="admin-kpi-label">Total Events in Ledger</div>
          <div className="admin-kpi-value">{events.length}</div>
          <div className="admin-kpi-sub">Append-only records</div>
        </div>

        <div className="admin-kpi-card">
          <div className="admin-kpi-label">Ledger Integrity</div>
          <div
            className="admin-kpi-value"
            style={{
              color:
                verifyResult === null
                  ? '#64748b'
                  : verifyResult.ok
                  ? '#16a34a'
                  : '#dc2626',
            }}
          >
            {verifyResult === null ? 'Unverified' : verifyResult.ok ? 'Valid 100%' : 'Broken'}
          </div>
          <div className="admin-kpi-sub">
            {tamperSimulated ? '⚠️ Tamper simulation active' : 'SHA-256 backward chained'}
          </div>
        </div>

        <div className="admin-kpi-card">
          <div className="admin-kpi-label">Active Actors</div>
          <div className="admin-kpi-value">{distinctActors.length}</div>
          <div className="admin-kpi-sub">
            {distinctActors.slice(0, 3).join(', ') || 'None'}
          </div>
        </div>

        <div className="admin-kpi-card">
          <div className="admin-kpi-label">Latest Event</div>
          <div className="admin-kpi-value" style={{ fontSize: 18 }}>
            {events.length > 0 ? (events[events.length - 1].event_type || events[events.length - 1].type) : 'None'}
          </div>
          <div className="admin-kpi-sub">
            {events.length > 0 ? new Date(events[events.length - 1].ts || events[events.length - 1].created_at).toLocaleTimeString() : 'N/A'}
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div
        className="admin-card"
        style={{
          padding: 12,
          marginBottom: 16,
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 200 }}>
          <input
            type="search"
            placeholder="Search by actor, event type, hash, or details..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', margin: 0, padding: '7px 10px', fontSize: 13 }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', margin: 0 }}>
            Actor:
          </label>
          <select
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            style={{ margin: 0, padding: '6px 10px', fontSize: 13 }}
          >
            <option value="all">All Actors ({distinctActors.length})</option>
            {distinctActors.map((act) => (
              <option key={act} value={act}>
                {act}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', margin: 0 }}>
            Type:
          </label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{ margin: 0, padding: '6px 10px', fontSize: 13 }}
          >
            <option value="all">All Types ({distinctTypes.length})</option>
            {distinctTypes.map((typ) => (
              <option key={typ} value={typ}>
                {typ}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Events Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spinner />
          <p className="muted" style={{ marginTop: 12 }}>Loading audit events...</p>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="admin-card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📜</div>
          <h3>No matching audit events found</h3>
          <p className="muted">Try adjusting your search criteria or actor filter.</p>
        </div>
      ) : (
        <>
        <div className="admin-card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: 50, textAlign: 'center' }}>#</th>
                <th style={{ width: 140 }}>When</th>
                <th style={{ width: 100 }}>Who</th>
                <th style={{ width: 160 }}>What</th>
                <th>Details & Payload Summary</th>
                <th style={{ width: 140 }}>SHA-256 Hash</th>
                <th style={{ width: 80, textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((e) => {
                const eventType = e.event_type || e.type || 'EVENT'
                const whenDate = new Date(e.ts || e.created_at || Date.now())
                const hashShort = e.hash ? `${e.hash.slice(0, 8)}...${e.hash.slice(-4)}` : 'N/A'
                const isCorrupted = tamperSimulated && e.id === 3

                return (
                  <tr
                    key={e.id}
                    style={{
                      background: isCorrupted ? '#fef2f2' : undefined,
                    }}
                  >
                    <td style={{ textAlign: 'center', fontWeight: 700, color: '#64748b' }}>
                      {e.id}
                      {isCorrupted && <span title="Tampered Row" style={{ color: '#dc2626', marginLeft: 4 }}>⚠️</span>}
                    </td>
                    <td>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>
                        {whenDate.toLocaleDateString()}
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>
                        {whenDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </div>
                    </td>
                    <td>
                      <span
                        className="role-pill"
                        style={{
                          background:
                            e.actor === 'owner'
                              ? '#dbeafe'
                              : e.actor === 'manager'
                              ? '#e0e7ff'
                              : e.actor === 'driver'
                              ? '#fef3c7'
                              : e.actor === 'customer'
                              ? '#dcfce7'
                              : '#f1f5f9',
                          color:
                            e.actor === 'owner'
                              ? '#1e40af'
                              : e.actor === 'manager'
                              ? '#3730a3'
                              : e.actor === 'driver'
                              ? '#92400e'
                              : e.actor === 'customer'
                              ? '#166534'
                              : '#475569',
                          fontWeight: 700,
                          fontSize: 11,
                          padding: '3px 8px',
                          borderRadius: 9999,
                        }}
                      >
                        {e.actor}
                      </span>
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: 11,
                          fontFamily: 'monospace',
                          fontWeight: 700,
                          background: '#f1f5f9',
                          color: '#0f172a',
                          padding: '2px 6px',
                          borderRadius: 4,
                          display: 'inline-block',
                        }}
                      >
                        {eventType}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>
                        {e.description || (typeof e.payload === 'object' ? JSON.stringify(e.payload) : String(e.payload || ''))}
                      </div>
                      {e.payload && typeof e.payload === 'object' && Object.keys(e.payload).length > 0 && (
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, fontFamily: 'monospace' }}>
                          {Object.entries(e.payload)
                            .slice(0, 3)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(' • ')}
                        </div>
                      )}
                    </td>
                    <td>
                      <span
                        title={`Full Hash:\n${e.hash}\n\nPrevious Hash:\n${e.prev_hash}`}
                        style={{
                          fontFamily: 'monospace',
                          fontSize: 11,
                          color: '#475569',
                          background: '#f8fafc',
                          padding: '2px 6px',
                          borderRadius: 4,
                          border: '1px solid #e2e8f0',
                          cursor: 'help',
                          display: 'inline-block',
                        }}
                      >
                        {hashShort}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setSelectedEvent(e)}
                        style={{ padding: '4px 8px', fontSize: 11 }}
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={page}
          totalPages={Math.ceil(filteredEvents.length / PAGE_SIZE)}
          totalItems={filteredEvents.length}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
        </>
      )}

      {/* Event Details Modal */}
      {selectedEvent && (
        <Modal
          title={`Event #${selectedEvent.id}: ${selectedEvent.event_type || selectedEvent.type}`}
          onClose={() => setSelectedEvent(null)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Actor</label>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{selectedEvent.actor}</div>
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Timestamp (UTC)</label>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{selectedEvent.ts || selectedEvent.created_at}</div>
              </div>
            </div>

            <div>
              <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Description</label>
              <div style={{ fontSize: 13, color: '#1e293b' }}>
                {selectedEvent.description || 'No description provided'}
              </div>
            </div>

            <div>
              <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Payload (Data Attributes)</label>
              <pre
                style={{
                  background: '#0f172a',
                  color: '#e2e8f0',
                  padding: 10,
                  borderRadius: 6,
                  fontSize: 11,
                  fontFamily: 'monospace',
                  overflowX: 'auto',
                  margin: '4px 0 0 0',
                }}
              >
                {JSON.stringify(selectedEvent.payload || selectedEvent.details || {}, null, 2)}
              </pre>
            </div>

            <div>
              <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Previous Block Hash (prev_hash)</label>
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 11,
                  background: '#f1f5f9',
                  padding: '6px 8px',
                  borderRadius: 4,
                  wordBreak: 'break-all',
                }}
              >
                {selectedEvent.prev_hash || 'GENESIS (0000000000000000000000000000000000000000000000000000000000000000)'}
              </div>
            </div>

            <div>
              <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Block SHA-256 Digest (hash)</label>
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 11,
                  background: '#f1f5f9',
                  padding: '6px 8px',
                  borderRadius: 4,
                  wordBreak: 'break-all',
                  fontWeight: 700,
                  color: '#0f172a',
                }}
              >
                {selectedEvent.hash || 'None'}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button type="button" onClick={() => setSelectedEvent(null)}>
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
