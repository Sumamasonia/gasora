import { useCallback, useEffect, useState } from 'react'
import { getCylinders, getCylinderSummary } from '../../api.js'
import NotReady from '../../components/NotReady.jsx'
import Spinner from '../../components/Spinner.jsx'
import CylinderSummaryStrip from './CylinderSummaryStrip.jsx'
import './cylinders.css'

export default function CylinderRegister({ auth, onNavigate }) {
  const [summary, setSummary] = useState(null)
  const [cylinders, setCylinders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Filter state
  const [selectedState, setSelectedState] = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [sumData, cylsData] = await Promise.all([
        getCylinderSummary(auth.token),
        getCylinders(auth.token),
      ])
      setSummary(sumData)
      setCylinders(cylsData || [])
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [auth.token])

  useEffect(() => {
    loadData()
  }, [loadData])

  if (error && (error.status === 404 || error.status === 0)) {
    return <NotReady endpoint="GET /cylinders/summary" />
  }

  return (
    <div className="cylinders-page">
      {/* Page Header */}
      <div className="cylinders-header">
        <div className="cylinders-title-wrap">
          <h1>Cylinder Register & Lifecycle</h1>
          <p className="muted">
            Track four-step LPG cylinder transitions, asset ownership, and field holdings
          </p>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <Spinner size="lg" message="Loading cylinder inventory & lifecycle summary..." />
        </div>
      ) : (
        <>
          {/* Summary Cards & 4-Step Lifecycle Strip */}
          <CylinderSummaryStrip
            summary={summary}
            selectedState={selectedState}
            onSelectState={setSelectedState}
          />
        </>
      )}
    </div>
  )
}
