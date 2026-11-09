import { useCallback, useEffect, useMemo, useState } from 'react'
import { getNotes, saveNote } from '../../api'
import Spinner from '../../components/Spinner'
import './admin.css'

export default function UtilitiesPage({ auth, onNavigate }) {
  const [activeTab, setActiveTab] = useState('notes') // 'notes' | 'calculator' | 'cylinder-cost'

  // =====================
  // 1. DAILY NOTES STATE
  // =====================
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], [])
  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [noteContent, setNoteContent] = useState('')
  const [noteAuthor, setNoteAuthor] = useState('')
  const [noteUpdatedAt, setNoteUpdatedAt] = useState(null)
  const [allNotes, setAllNotes] = useState([])
  const [loadingNotes, setLoadingNotes] = useState(true)
  const [savingNote, setSavingNote] = useState(false)
  const [toastMessage, setToastMessage] = useState('')

  const fetchNotes = useCallback(async () => {
    try {
      setLoadingNotes(true)
      const list = await getNotes(auth.token)
      setAllNotes(list || [])

      const matching = (list || []).find((n) => n.date === selectedDate)
      if (matching) {
        setNoteContent(matching.content || '')
        setNoteAuthor(matching.author || '')
        setNoteUpdatedAt(matching.updated_at || null)
      } else {
        setNoteContent('')
        setNoteAuthor('')
        setNoteUpdatedAt(null)
      }
    } catch (err) {
      console.error('Failed to load notes:', err)
    } finally {
      setLoadingNotes(false)
    }
  }, [auth.token, selectedDate])

  useEffect(() => {
    fetchNotes()
  }, [fetchNotes])

  const handleDateChange = (newDate) => {
    setSelectedDate(newDate)
    const matching = allNotes.find((n) => n.date === newDate)
    if (matching) {
      setNoteContent(matching.content || '')
      setNoteAuthor(matching.author || '')
      setNoteUpdatedAt(matching.updated_at || null)
    } else {
      setNoteContent('')
      setNoteAuthor('')
      setNoteUpdatedAt(null)
    }
  }

  const handleSaveNote = async () => {
    setSavingNote(true)
    try {
      const res = await saveNote(auth.token, {
        date: selectedDate,
        content: noteContent,
      })
      setNoteAuthor(auth.username)
      setNoteUpdatedAt(new Date().toISOString())
      setToastMessage(`✓ Note saved successfully for ${selectedDate}.`)
      setTimeout(() => setToastMessage(''), 4000)

      // Refresh list
      const updatedList = await getNotes(auth.token)
      setAllNotes(updatedList || [])
    } catch (err) {
      setToastMessage(`⚠️ Failed to save note: ${err.message}`)
      setTimeout(() => setToastMessage(''), 5000)
    } finally {
      setSavingNote(false)
    }
  }

  const handleInsertSnippet = (snippet) => {
    setNoteContent((prev) => (prev ? `${prev}\n\n${snippet}` : snippet))
  }

  // =====================
  // 2. GENERAL CALCULATOR
  // =====================
  const [calcDisplay, setCalcDisplay] = useState('0')
  const [calcFormula, setCalcFormula] = useState('')
  const [calcHistory, setCalcHistory] = useState([])
  const [isNewNumber, setIsNewNumber] = useState(true)

  const handleCalcDigit = (digit) => {
    if (isNewNumber) {
      setCalcDisplay(digit === '.' ? '0.' : digit)
      setIsNewNumber(false)
    } else {
      if (digit === '.' && calcDisplay.includes('.')) return
      setCalcDisplay((prev) => prev + digit)
    }
  }

  const handleCalcOperator = (op) => {
    setCalcFormula(`${calcDisplay} ${op} `)
    setIsNewNumber(true)
  }

  const handleCalcEquals = () => {
    if (!calcFormula) return
    try {
      const sanitized = `${calcFormula}${calcDisplay}`.replace(/×/g, '*').replace(/÷/g, '/')
      // Safe arithmetic evaluation
      const result = Function(`'use strict'; return (${sanitized})`)()
      const rounded = Math.round(result * 10000) / 10000
      const expr = `${calcFormula}${calcDisplay} = ${rounded}`
      setCalcHistory((prev) => [expr, ...prev.slice(0, 4)])
      setCalcDisplay(String(rounded))
      setCalcFormula('')
      setIsNewNumber(true)
    } catch {
      setCalcDisplay('Error')
      setCalcFormula('')
      setIsNewNumber(true)
    }
  }

  const handleCalcClear = () => {
    setCalcDisplay('0')
    setCalcFormula('')
    setIsNewNumber(true)
  }

  const handleCalcBackspace = () => {
    if (isNewNumber || calcDisplay.length <= 1) {
      setCalcDisplay('0')
      setIsNewNumber(true)
    } else {
      setCalcDisplay((prev) => prev.slice(0, -1))
    }
  }

  const handleCalcPercent = () => {
    const num = parseFloat(calcDisplay)
    if (!isNaN(num)) {
      setCalcDisplay(String(num / 100))
    }
  }

  // ==============================
  // 3. CYLINDER COST CALCULATOR
  // ==============================
  const [bulkRateTon, setBulkRateTon] = useState(195000) // PKR per MT
  const [decantingFeeKg, setDecantingFeeKg] = useState(12) // PKR per kg
  const [transportPerCyl, setTransportPerCyl] = useState(150) // PKR per cylinder
  const [truckloadCylinders, setTruckloadCylinders] = useState(250)

  // Target retail prices
  const [price11, setPrice11] = useState(3100)
  const [price15, setPrice15] = useState(3950)
  const [price45, setPrice45] = useState(11800)

  // Cost metrics
  const bulkCostPerKg = useMemo(() => bulkRateTon / 1000, [bulkRateTon])
  const gasAndDecantingCostPerKg = useMemo(
    () => bulkCostPerKg + decantingFeeKg,
    [bulkCostPerKg, decantingFeeKg]
  )

  const cylinderEconomics = useMemo(() => {
    const calcRow = (label, weight, retailPrice) => {
      const gasCost = weight * bulkCostPerKg
      const decantingCost = weight * decantingFeeKg
      const totalCost = gasCost + decantingCost + transportPerCyl
      const marginPkr = retailPrice - totalCost
      const marginPct = retailPrice > 0 ? (marginPkr / retailPrice) * 100 : 0
      const costPerKgAllIn = totalCost / weight

      return {
        label,
        weight,
        gasCost,
        decantingCost,
        transportCost: transportPerCyl,
        totalCost,
        retailPrice,
        marginPkr,
        marginPct,
        costPerKgAllIn,
      }
    }

    return [
      calcRow('Domestic (11.8 kg)', 11.8, price11),
      calcRow('Commercial (15.0 kg)', 15.0, price15),
      calcRow('Industrial (45.4 kg)', 45.4, price45),
    ]
  }, [bulkCostPerKg, decantingFeeKg, transportPerCyl, price11, price15, price45])

  // Truckload profit projection (mix of 70% 11.8kg, 20% 15kg, 10% 45.4kg)
  const truckloadProfit = useMemo(() => {
    const count11 = Math.round(truckloadCylinders * 0.7)
    const count15 = Math.round(truckloadCylinders * 0.2)
    const count45 = truckloadCylinders - count11 - count15

    const eco11 = cylinderEconomics[0]
    const eco15 = cylinderEconomics[1]
    const eco45 = cylinderEconomics[2]

    const totalRevenue =
      count11 * eco11.retailPrice + count15 * eco15.retailPrice + count45 * eco45.retailPrice
    const totalCost =
      count11 * eco11.totalCost + count15 * eco15.totalCost + count45 * eco45.totalCost
    const netProfit = totalRevenue - totalCost
    const netMarginPct = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0

    return { totalRevenue, totalCost, netProfit, netMarginPct, count11, count15, count45 }
  }, [truckloadCylinders, cylinderEconomics])

  return (
    <div className="admin-page-container">
      {/* Top Header */}
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">
            <span>📝</span>
            <span>Operations Notes & Calculators</span>
          </h1>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Daily log notes, arithmetic tool, and specialized LPG bulk decanting cost & margin calculator.
          </p>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: 6, background: '#f1f5f9', padding: 4, borderRadius: 8 }}>
          <button
            type="button"
            className={activeTab === 'notes' ? '' : 'secondary'}
            onClick={() => setActiveTab('notes')}
            style={{ fontSize: 12, padding: '6px 12px' }}
          >
            📋 Daily Notes
          </button>
          <button
            type="button"
            className={activeTab === 'calculator' ? '' : 'secondary'}
            onClick={() => setActiveTab('calculator')}
            style={{ fontSize: 12, padding: '6px 12px' }}
          >
            🧮 Calculator
          </button>
          <button
            type="button"
            className={activeTab === 'cylinder-cost' ? '' : 'secondary'}
            onClick={() => setActiveTab('cylinder-cost')}
            style={{ fontSize: 12, padding: '6px 12px' }}
          >
            🛢️ Cylinder Cost & Margins
          </button>
        </div>
      </div>

      {toastMessage && (
        <div
          style={{
            background: toastMessage.includes('⚠️') ? '#fee2e2' : '#dcfce7',
            borderColor: toastMessage.includes('⚠️') ? '#fca5a5' : '#86efac',
            color: toastMessage.includes('⚠️') ? '#b91c1c' : '#15803d',
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

      {/* ===================== TAB 1: DAILY NOTES ===================== */}
      {activeTab === 'notes' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 320px) 1fr', gap: 20 }}>
          {/* Notes Sidebar: History & Quick Dates */}
          <div className="admin-card" style={{ padding: 16 }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 15 }}>📅 Daily Log Dates</h3>

            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              <button
                type="button"
                className="secondary"
                onClick={() => handleDateChange(todayStr)}
                style={{ fontSize: 12, flex: 1, padding: '6px 8px' }}
              >
                Today
              </button>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => handleDateChange(e.target.value)}
                style={{ fontSize: 12, padding: '4px 8px', margin: 0 }}
              />
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8 }}>
              Saved Daily Entries ({allNotes.length}):
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
              {allNotes.length === 0 ? (
                <p className="muted" style={{ fontSize: 12 }}>No daily notes saved yet.</p>
              ) : (
                allNotes.map((n) => (
                  <div
                    key={n.id || n.date}
                    onClick={() => handleDateChange(n.date)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 6,
                      background: selectedDate === n.date ? '#eff6ff' : '#f8fafc',
                      border: `1px solid ${selectedDate === n.date ? '#bfdbfe' : '#e2e8f0'}`,
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: 12, color: selectedDate === n.date ? '#1e40af' : '#0f172a' }}>
                        {n.date}
                      </strong>
                      <span style={{ fontSize: 10, color: '#64748b' }}>by {n.author || 'staff'}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {n.content || 'Empty note'}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Quick Templates */}
            <div style={{ marginTop: 20, borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8 }}>
                Quick Log Templates:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => handleInsertSnippet("Morning Bowser: Received ___ MT LPG from ___. Pressure: ___ bar. Tank level: ___%.")}
                  style={{ fontSize: 11, textAlign: 'left', padding: '6px 8px' }}
                >
                  + Bowser Delivery Checklist
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => handleInsertSnippet("Shift Handover: Driver ___ returned with ___ empty cylinders. Cash collected: ₨ ___.")}
                  style={{ fontSize: 11, textAlign: 'left', padding: '6px 8px' }}
                >
                  + Driver Shift Debrief
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => handleInsertSnippet("Depot Safety Check: Leak detection spray applied on ___ manifolds. Fire extinguishers inspected.")}
                  style={{ fontSize: 11, textAlign: 'left', padding: '6px 8px' }}
                >
                  + Depot Safety & Maintenance
                </button>
              </div>
            </div>
          </div>

          {/* Main Note Editor */}
          <div className="admin-card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16 }}>
                  📝 Daily Operations Log: {selectedDate}
                </h3>
                <span className="muted" style={{ fontSize: 12 }}>
                  {noteUpdatedAt
                    ? `Last updated: ${new Date(noteUpdatedAt).toLocaleTimeString()} by ${noteAuthor || 'staff'}`
                    : 'New daily entry'}
                </span>
              </div>

              <button
                type="button"
                onClick={handleSaveNote}
                disabled={savingNote}
                style={{ fontWeight: 700, fontSize: 13 }}
              >
                {savingNote ? 'Saving...' : '💾 Save Note'}
              </button>
            </div>

            <textarea
              rows={16}
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="Record daily shift handover, refinery deliveries, driver debriefs, depot maintenance, or customer follow-up notes..."
              style={{
                width: '100%',
                padding: 14,
                fontSize: 13,
                lineHeight: 1.6,
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
              }}
            />
          </div>
        </div>
      )}

      {/* ===================== TAB 2: GENERAL CALCULATOR ===================== */}
      {activeTab === 'calculator' && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div className="admin-card" style={{ width: 360, padding: 20 }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 16, textAlign: 'center' }}>
              🧮 Operations Calculator
            </h3>

            {/* Display Screen */}
            <div
              style={{
                background: '#0f172a',
                color: '#ffffff',
                borderRadius: 8,
                padding: '14px 16px',
                textAlign: 'right',
                marginBottom: 16,
              }}
            >
              <div style={{ fontSize: 12, color: '#94a3b8', minHeight: 16, fontFamily: 'monospace' }}>
                {calcFormula || ' '}
              </div>
              <div style={{ fontSize: 32, fontWeight: 700, fontFamily: 'monospace', overflowX: 'auto' }}>
                {calcDisplay}
              </div>
            </div>

            {/* Keypad Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              <button type="button" className="secondary" onClick={handleCalcClear} style={{ fontWeight: 700, color: '#dc2626' }}>
                C
              </button>
              <button type="button" className="secondary" onClick={handleCalcBackspace} style={{ fontWeight: 700 }}>
                ⌫
              </button>
              <button type="button" className="secondary" onClick={handleCalcPercent} style={{ fontWeight: 700 }}>
                %
              </button>
              <button type="button" onClick={() => handleCalcOperator('÷')} style={{ fontWeight: 700, background: '#2563eb', color: '#fff' }}>
                ÷
              </button>

              <button type="button" className="secondary" onClick={() => handleCalcDigit('7')}>7</button>
              <button type="button" className="secondary" onClick={() => handleCalcDigit('8')}>8</button>
              <button type="button" className="secondary" onClick={() => handleCalcDigit('9')}>9</button>
              <button type="button" onClick={() => handleCalcOperator('×')} style={{ fontWeight: 700, background: '#2563eb', color: '#fff' }}>
                ×
              </button>

              <button type="button" className="secondary" onClick={() => handleCalcDigit('4')}>4</button>
              <button type="button" className="secondary" onClick={() => handleCalcDigit('5')}>5</button>
              <button type="button" className="secondary" onClick={() => handleCalcDigit('6')}>6</button>
              <button type="button" onClick={() => handleCalcOperator('-')} style={{ fontWeight: 700, background: '#2563eb', color: '#fff' }}>
                -
              </button>

              <button type="button" className="secondary" onClick={() => handleCalcDigit('1')}>1</button>
              <button type="button" className="secondary" onClick={() => handleCalcDigit('2')}>2</button>
              <button type="button" className="secondary" onClick={() => handleCalcDigit('3')}>3</button>
              <button type="button" onClick={() => handleCalcOperator('+')} style={{ fontWeight: 700, background: '#2563eb', color: '#fff' }}>
                +
              </button>

              <button
                type="button"
                className="secondary"
                onClick={() => {
                  const num = parseFloat(calcDisplay)
                  if (!isNaN(num)) setCalcDisplay(String(-num))
                }}
              >
                ±
              </button>
              <button type="button" className="secondary" onClick={() => handleCalcDigit('0')}>0</button>
              <button type="button" className="secondary" onClick={() => handleCalcDigit('.')}>.</button>
              <button type="button" onClick={handleCalcEquals} style={{ fontWeight: 700, background: '#16a34a', color: '#fff' }}>
                =
              </button>
            </div>

            {/* Recent History */}
            {calcHistory.length > 0 && (
              <div style={{ marginTop: 16, borderTop: '1px solid #e2e8f0', paddingTop: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>Recent Calculations:</div>
                {calcHistory.map((h, i) => (
                  <div key={i} style={{ fontSize: 11, fontFamily: 'monospace', color: '#475569', textAlign: 'right' }}>
                    {h}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================== TAB 3: CYLINDER COST & MARGIN CALCULATOR ===================== */}
      {activeTab === 'cylinder-cost' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20 }}>
          {/* Inputs Card */}
          <div className="admin-card" style={{ padding: 20 }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 16, borderBottom: '1px solid #e2e8f0', paddingBottom: 8 }}>
              🛢️ Bulk LPG Cost & Decanting Parameters
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>
                  Bulk LPG Purchase Rate (PKR / Metric Ton)
                </label>
                <input
                  type="number"
                  min="50000"
                  step="1000"
                  value={bulkRateTon}
                  onChange={(e) => setBulkRateTon(parseFloat(e.target.value) || 0)}
                  style={{ width: '100%' }}
                />
                <span className="muted" style={{ fontSize: 11 }}>
                  = <strong>₨ {bulkCostPerKg.toFixed(2)}</strong> per kg raw gas
                </span>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>
                  Decanting / Plant Overhead (PKR / kg)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={decantingFeeKg}
                  onChange={(e) => setDecantingFeeKg(parseFloat(e.target.value) || 0)}
                  style={{ width: '100%' }}
                />
                <span className="muted" style={{ fontSize: 11 }}>
                  Filling fee, plant electricity, maintenance
                </span>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>
                  Transport & Handling (PKR / Cylinder)
                </label>
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={transportPerCyl}
                  onChange={(e) => setTransportPerCyl(parseFloat(e.target.value) || 0)}
                  style={{ width: '100%' }}
                />
                <span className="muted" style={{ fontSize: 11 }}>
                  Truck fuel, driver per-diem, loading
                </span>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>
                  Total Gas + Decanting Cost / kg
                </label>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#1e40af', padding: '6px 0' }}>
                  ₨ {gasAndDecantingCostPerKg.toFixed(2)} / kg
                </div>
                <span className="muted" style={{ fontSize: 11 }}>
                  Direct production base before transport
                </span>
              </div>
            </div>

            <h4 style={{ margin: '20px 0 10px 0', fontSize: 14 }}>
              Target Retail Selling Prices (PKR / Cylinder):
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>
                  11.8 kg (Domestic) Selling Price
                </label>
                <input
                  type="number"
                  value={price11}
                  onChange={(e) => setPrice11(parseFloat(e.target.value) || 0)}
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>
                  15.0 kg (Commercial) Selling Price
                </label>
                <input
                  type="number"
                  value={price15}
                  onChange={(e) => setPrice15(parseFloat(e.target.value) || 0)}
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>
                  45.4 kg (Industrial) Selling Price
                </label>
                <input
                  type="number"
                  value={price45}
                  onChange={(e) => setPrice45(parseFloat(e.target.value) || 0)}
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          </div>

          {/* Unit Cost & Margins Table */}
          <div className="admin-card" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Cylinder Size</th>
                  <th style={{ textAlign: 'right' }}>Gas Weight</th>
                  <th style={{ textAlign: 'right' }}>Gas Cost</th>
                  <th style={{ textAlign: 'right' }}>Decanting Cost</th>
                  <th style={{ textAlign: 'right' }}>Transport</th>
                  <th style={{ textAlign: 'right' }}>Total Unit Cost</th>
                  <th style={{ textAlign: 'right' }}>Retail Price</th>
                  <th style={{ textAlign: 'right' }}>Unit Margin (PKR)</th>
                  <th style={{ textAlign: 'right' }}>Margin %</th>
                </tr>
              </thead>
              <tbody>
                {cylinderEconomics.map((row) => (
                  <tr key={row.label}>
                    <td style={{ fontWeight: 700, color: '#0f172a' }}>{row.label}</td>
                    <td style={{ textAlign: 'right' }}>{row.weight} kg</td>
                    <td style={{ textAlign: 'right' }}>₨ {Math.round(row.gasCost).toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>₨ {Math.round(row.decantingCost).toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>₨ {Math.round(row.transportCost).toLocaleString()}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#b91c1c' }}>
                      ₨ {Math.round(row.totalCost).toLocaleString()}
                      <div style={{ fontSize: 10, color: '#64748b' }}>
                        (₨ {row.costPerKgAllIn.toFixed(1)}/kg)
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#1e40af' }}>
                      ₨ {Math.round(row.retailPrice).toLocaleString()}
                    </td>
                    <td
                      style={{
                        textAlign: 'right',
                        fontWeight: 700,
                        color: row.marginPkr >= 0 ? '#15803d' : '#b91c1c',
                      }}
                    >
                      ₨ {Math.round(row.marginPkr).toLocaleString()}
                    </td>
                    <td
                      style={{
                        textAlign: 'right',
                        fontWeight: 700,
                        color: row.marginPct >= 10 ? '#15803d' : row.marginPct >= 0 ? '#b45309' : '#b91c1c',
                      }}
                    >
                      {row.marginPct.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Truckload Batch Profit Projection */}
          <div className="admin-card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>
                🚛 Truckload Batch Profit Simulator
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Cylinders on Truck:</label>
                <input
                  type="number"
                  min="50"
                  max="1000"
                  step="10"
                  value={truckloadCylinders}
                  onChange={(e) => setTruckloadCylinders(parseInt(e.target.value, 10) || 250)}
                  style={{ width: 90, margin: 0, padding: '4px 8px' }}
                />
              </div>
            </div>

            <p className="muted" style={{ fontSize: 12, margin: '0 0 16px 0' }}>
              Simulates a typical mixed distribution load ({truckloadProfit.count11}x 11.8kg, {truckloadProfit.count15}x 15kg, {truckloadProfit.count45}x 45.4kg):
            </p>

            <div className="admin-grid-kpis">
              <div className="admin-kpi-card">
                <div className="admin-kpi-label">Estimated Gross Revenue</div>
                <div className="admin-kpi-value" style={{ color: '#1e40af' }}>
                  ₨ {Math.round(truckloadProfit.totalRevenue).toLocaleString()}
                </div>
                <div className="admin-kpi-sub">Total sales value</div>
              </div>

              <div className="admin-kpi-card">
                <div className="admin-kpi-label">Total Delivered Cost</div>
                <div className="admin-kpi-value" style={{ color: '#64748b' }}>
                  ₨ {Math.round(truckloadProfit.totalCost).toLocaleString()}
                </div>
                <div className="admin-kpi-sub">Gas + plant + transport</div>
              </div>

              <div className="admin-kpi-card">
                <div className="admin-kpi-label">Net Batch Profit</div>
                <div
                  className="admin-kpi-value"
                  style={{ color: truckloadProfit.netProfit >= 0 ? '#15803d' : '#b91c1c' }}
                >
                  ₨ {Math.round(truckloadProfit.netProfit).toLocaleString()}
                </div>
                <div className="admin-kpi-sub">{truckloadProfit.netMarginPct.toFixed(1)}% net margin</div>
              </div>

              <div className="admin-kpi-card">
                <div className="admin-kpi-label">Average Profit / Cylinder</div>
                <div className="admin-kpi-value" style={{ color: '#15803d' }}>
                  ₨ {truckloadCylinders ? Math.round(truckloadProfit.netProfit / truckloadCylinders).toLocaleString() : 0}
                </div>
                <div className="admin-kpi-sub">Per unit blended margin</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
