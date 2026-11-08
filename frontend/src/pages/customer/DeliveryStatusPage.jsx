import { useCallback, useEffect, useState } from 'react'
import { ApiError, getMyDeliveryStatus } from '../../api'
import Spinner from '../../components/Spinner'

export default function DeliveryStatusPage({ auth, onExpired, onRequestRefill }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const fetchStatus = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true)
      else setLoading(true)
      setError('')
      const res = await getMyDeliveryStatus(auth.token)
      setData(res)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onExpired()
      } else {
        setError(err.message || 'Failed to fetch delivery status')
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [auth.token, onExpired])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  if (loading) {
    return (
      <div style={{ padding: '60px 0', textAlign: 'center' }}>
        <Spinner size="lg" message="Loading live delivery tracking..." />
      </div>
    )
  }

  if (error) {
    return (
      <div className="customer-card urgent-banner">
        <div className="urgent-banner-title">⚠️ Tracking Error</div>
        <div className="urgent-banner-text">{error}</div>
        <button
          type="button"
          className="customer-header-btn"
          style={{ marginTop: 10 }}
          onClick={() => fetchStatus(true)}
        >
          Try Again
        </button>
      </div>
    )
  }

  if (!data?.has_active_delivery) {
    return (
      <div className="routific-tracking-wrapper">
        <div className="customer-card" style={{ textAlign: 'center', padding: '36px 16px' }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🚚</div>
          <h2 style={{ fontSize: 18, margin: '0 0 8px 0', fontWeight: 800 }}>
            No Active Delivery Scheduled
          </h2>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 16 }}>
            You do not have any pending cylinder stops on today&apos;s active routes. If your gas is running low, place a normal or urgent refill request.
          </p>
          {onRequestRefill && (
            <button
              type="button"
              className="request-submit-btn normal"
              onClick={onRequestRefill}
            >
              ➕ Place Refill Request
            </button>
          )}
        </div>
      </div>
    )
  }

  const step = data.step || 1
  const isDelivered = step === 3
  const isOnTheWay = step === 2
  const isPlanned = step === 1

  return (
    <div className="routific-tracking-wrapper">
      {/* Top Header Row with Refresh */}
      <div className="card-title-row" style={{ marginBottom: 4 }}>
        <div>
          <span className="demo-badge" style={{ fontSize: 10 }}>ROUTIFIC TRACKING REFERENCE</span>
          <h2 style={{ fontSize: 20, margin: '2px 0 0 0', fontWeight: 800, letterSpacing: -0.02 }}>
            Delivery Status
          </h2>
        </div>
        <button
          type="button"
          className="customer-header-btn"
          onClick={() => fetchStatus(true)}
          disabled={refreshing}
          title="Refresh current route progress"
        >
          {refreshing ? 'Updating...' : '🔄 Refresh'}
        </button>
      </div>

      {/* Main Routific-inspired Status Banner */}
      <div className={`routific-status-banner ${data.status || 'planned'}`}>
        <div style={{ fontSize: 28, marginBottom: 4 }}>
          {isDelivered ? '✅' : isOnTheWay ? '🚚' : '📋'}
        </div>
        <div className="routific-status-title">
          {data.status_title || (isDelivered ? 'Delivered' : isOnTheWay ? 'On the way' : 'Delivery Planned')}
        </div>
        <div className="routific-status-desc">
          {data.status_description}
        </div>

        {/* Prominent Stop Position in Route Badge (e.g. "3 stops before you") */}
        {data.position_text && (
          <div
            className="routific-position-pill"
            style={{
              background: isDelivered ? '#16a34a' : isOnTheWay ? '#ea580c' : '#0284c7',
            }}
          >
            {isDelivered ? '✓ ' : '📍 '}
            {data.position_text}
          </div>
        )}
      </div>

      {/* 3-Step Milestone Stepper */}
      <div className="customer-card">
        <div className="card-title-row">
          <span className="card-title">
            <span>Milestone Progress</span>
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 6,
              background: isDelivered ? '#dcfce7' : isOnTheWay ? '#e0f2fe' : '#fef3c7',
              color: isDelivered ? '#15803d' : isOnTheWay ? '#0369a1' : '#b45309',
            }}
          >
            {isDelivered ? 'Completed' : `Step ${step} of 3`}
          </span>
        </div>

        <div className="routific-stepper">
          <div className="stepper-line">
            <div
              className="stepper-line-progress"
              style={{
                width: isDelivered ? '100%' : isOnTheWay ? '50%' : '0%',
              }}
            />
          </div>

          {/* STEP 1: Planned */}
          <div
            className={`routific-step-node ${
              step > 1 ? 'completed' : step === 1 ? 'active' : ''
            }`}
          >
            <div className="routific-step-circle">
              {step > 1 ? '✓' : '1'}
            </div>
            <div className="routific-step-label">Planned</div>
            <span className="muted" style={{ fontSize: 10, marginTop: 2 }}>
              Route built
            </span>
          </div>

          {/* STEP 2: On the way */}
          <div
            className={`routific-step-node ${
              step > 2 ? 'completed' : step === 2 ? 'active' : ''
            }`}
          >
            <div className="routific-step-circle">
              {step > 2 ? '✓' : '2'}
            </div>
            <div className="routific-step-label">On the way</div>
            <span className="muted" style={{ fontSize: 10, marginTop: 2 }}>
              Driver assigned
            </span>
          </div>

          {/* STEP 3: Delivered */}
          <div
            className={`routific-step-node ${
              step === 3 ? 'completed active' : ''
            }`}
          >
            <div className="routific-step-circle">
              {step === 3 ? '✓' : '3'}
            </div>
            <div className="routific-step-label">Delivered</div>
            <span className="muted" style={{ fontSize: 10, marginTop: 2 }}>
              Handover done
            </span>
          </div>
        </div>

        {/* Small honest note about live location */}
        <div className="routific-no-live-note">
          <span style={{ fontSize: 14 }}>ℹ️</span>
          <div>
            <strong>No live location:</strong>{' '}
            {data.live_location_note ||
              'Real-time driver location is not broadcast. Delivery order reflects the planned route sequence.'}
          </div>
        </div>
      </div>

      {/* Stop & Payload Details Card */}
      <div className="customer-card">
        <div className="card-title-row">
          <span className="card-title">
            📦 Delivery Order Details
          </span>
          {data.is_urgent && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                padding: '2px 6px',
                borderRadius: 4,
                background: '#dc2626',
                color: '#ffffff',
              }}
            >
              🚨 URGENT ORDER
            </span>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div style={{ background: 'var(--color-bg, #f8fafc)', padding: 10, borderRadius: 8 }}>
            <span className="balance-subitem-label">Cylinders Expected</span>
            <div style={{ fontSize: 15, fontWeight: 800 }}>
              {data.cylinders}x {data.cylinder_type}
            </div>
          </div>

          <div style={{ background: 'var(--color-bg, #f8fafc)', padding: 10, borderRadius: 8 }}>
            <span className="balance-subitem-label">Route Sequence</span>
            <div style={{ fontSize: 15, fontWeight: 800 }}>
              Stop #{data.stop_sequence} of {data.total_stops}
            </div>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--color-border, #e2e8f0)', paddingTop: 10 }}>
          <span className="balance-subitem-label">Delivery Destination</span>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text, #0f172a)' }}>
            {data.delivery_address}
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
            Area: {data.area} &bull; Faisalabad
          </div>
        </div>
      </div>

      {/* Driver & Van Information Card */}
      <div className="customer-card">
        <div className="card-title" style={{ marginBottom: 12 }}>
          🚚 Transport & Driver
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>
              {data.driver_name}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              Vehicle: Van #{data.vehicle_no || 1} (Faisalabad Route)
            </div>
          </div>

          {data.driver_phone && (
            <a
              href={`tel:${data.driver_phone}`}
              className="view-invoice-btn"
              style={{
                width: 'auto',
                margin: 0,
                padding: '8px 14px',
                background: '#0284c7',
                color: '#ffffff',
                borderColor: '#0284c7',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              📞 Call Driver
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
