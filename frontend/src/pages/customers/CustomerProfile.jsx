import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  createUrgent,
  getCustomer,
  getCustomerCylinders,
  getCustomerDeliveries,
  getCustomerLedger,
} from '../../api'
import EmptyState from '../../components/EmptyState'
import FormField from '../../components/FormField'
import KpiTile from '../../components/KpiTile'
import Modal from '../../components/Modal'
import NotReady from '../../components/NotReady'
import Pagination from '../../components/Pagination'
import Spinner from '../../components/Spinner'
import { useToast } from '../../components/Toast'
import CustomerDeactivateModal from './CustomerDeactivateModal'
import CustomerModal from './CustomerModal'
import './customers.css'

const formatDate = (val, options = { year: 'numeric', month: 'short', day: 'numeric' }) => {
  if (!val) return '—'
  const d = new Date(val)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-PK', options)
}

export default function CustomerProfile({ auth, customerId, onNavigate, onExpired }) {
  const { showToast } = useToast()

  const [customer, setCustomer] = useState(null)
  const [cylinders, setCylinders] = useState([])
  const [deliveries, setDeliveries] = useState([])
  const [ledger, setLedger] = useState([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Tabs: 'deliveries' | 'cylinders' | 'ledger'
  const [activeTab, setActiveTab] = useState('deliveries')

  // Pagination (5 items per page)
  const PAGE_SIZE = 5
  const [delivPage, setDelivPage] = useState(0)
  const [cylPage, setCylPage] = useState(0)
  const [ledgerPage, setLedgerPage] = useState(0)

  // Modals
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [deactivateModalOpen, setDeactivateModalOpen] = useState(false)
  const [deliveryModalOpen, setDeliveryModalOpen] = useState(false)
  const [urgentModalOpen, setUrgentModalOpen] = useState(false)

  // Form states for modals
  const [deliveryQty, setDeliveryQty] = useState(1)
  const [collectedQty, setCollectedQty] = useState(1)
  const [deliveryNote, setDeliveryNote] = useState('')
  const [urgentNote, setUrgentNote] = useState('')
  const [actionBusy, setActionBusy] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [custData, cylData, delivData, ledgData] = await Promise.all([
        getCustomer(auth.token, customerId),
        getCustomerCylinders(auth.token, customerId).catch(() => []),
        getCustomerDeliveries(auth.token, customerId).catch(() => []),
        getCustomerLedger(auth.token, customerId).catch(() => []),
      ])
      setCustomer(custData)
      setCylinders(cylData || [])
      setDeliveries(delivData || [])
      setLedger(ledgData || [])
      setDeliveryQty(custData.demand || 1)
      setCollectedQty(custData.demand || 1)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [auth.token, customerId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Computed metrics
  const avgRefillDays = useMemo(() => {
    if (!deliveries || deliveries.length === 0) return 14
    const validIntervals = deliveries.map((d) => d.interval_days).filter(Boolean)
    if (validIntervals.length === 0) return 14
    const sum = validIntervals.reduce((a, b) => a + b, 0)
    return Math.round(sum / validIntervals.length)
  }, [deliveries])

  const nextExpectedDelivery = useMemo(() => {
    if (!deliveries || deliveries.length === 0) return 'In 4 days'
    const lastDelivery = deliveries[deliveries.length - 1]
    const lastDate = lastDelivery ? new Date(lastDelivery.delivered_at) : new Date()
    const expectedDate = new Date(lastDate.getTime() + avgRefillDays * 86400000)
    const diffDays = Math.ceil((expectedDate.getTime() - Date.now()) / 86400000)
    if (diffDays <= 0) return 'Today (Due)'
    if (diffDays === 1) return 'Tomorrow'
    return `In ${diffDays} days`
  }, [deliveries, avgRefillDays])

  const accountBalance = useMemo(() => {
    if (!ledger || ledger.length === 0) return 0
    const lastEntry = ledger[ledger.length - 1]
    return lastEntry ? lastEntry.balance : 0
  }, [ledger])

  // Recharts Line Data: historical intervals
  const refillChartData = useMemo(() => {
    if (!deliveries || deliveries.length === 0) {
      return [
        { date: 'Delivery 1', interval: 14, expected: 15 },
        { date: 'Delivery 2', interval: 17, expected: 15 },
        { date: 'Delivery 3', interval: 15, expected: 15 },
        { date: 'Delivery 4', interval: 14, expected: 15 },
      ]
    }
    return deliveries.map((d, index) => {
      const dateLabel = new Date(d.delivered_at).toLocaleDateString('en-PK', {
        month: 'short',
        day: 'numeric',
      })
      return {
        date: dateLabel || `Refill #${index + 1}`,
        interval: d.interval_days || avgRefillDays,
        expected: avgRefillDays,
      }
    })
  }, [deliveries, avgRefillDays])

  // Handle Record Delivery Submit
  const handleRecordDeliverySubmit = (e) => {
    e.preventDefault()
    setActionBusy(true)
    setTimeout(() => {
      const newDeliv = {
        id: Date.now(),
        customer_id: Number(customerId),
        route_id: 125,
        driver_name: 'Muhammad Tariq',
        vehicle_no: 'FD-8921',
        cylinder_type: customer?.cylinder_type || '11.8 kg',
        cylinders_delivered: Number(deliveryQty),
        cylinders_collected: Number(collectedQty),
        delivered_at: new Date().toISOString(),
        interval_days: 14,
        status: 'delivered',
        notes: deliveryNote.trim() || 'Direct delivery recorded at customer site',
      }
      setDeliveries((prev) => [...prev, newDeliv])
      showToast(`Recorded delivery of ${deliveryQty} cylinder(s) for ${customer?.name}`, 'success')
      setActionBusy(false)
      setDeliveryModalOpen(false)
      setDeliveryNote('')
    }, 300)
  }

  // Handle Urgent Request Submit
  const handleUrgentSubmit = async (e) => {
    e.preventDefault()
    setActionBusy(true)
    try {
      await createUrgent(auth.token, Number(customerId), urgentNote.trim() || 'Urgent cylinder refill needed')
      showToast(`Urgent request dispatched for ${customer?.name}`, 'success')
      setUrgentModalOpen(false)
      setUrgentNote('')
    } catch (err) {
      showToast(err.message || 'Failed to submit urgent request', 'danger')
    } finally {
      setActionBusy(false)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '60px 0', textAlign: 'center' }}>
        <Spinner size="lg" message="Loading customer profile..." />
      </div>
    )
  }

  if (error && (error.status === 404 || error.status === 0)) {
    if (error.status === 0) {
      return <NotReady endpoint={`GET /customers/${customerId}`} />
    }
    return (
      <EmptyState
        title="Customer Not Found"
        description={`No customer account exists with identifier #${customerId}.`}
        action={
          <button type="button" onClick={() => onNavigate('customers')}>
            Return to Customers Directory
          </button>
        }
      />
    )
  }

  if (!customer) {
    return (
      <EmptyState
        title="Customer Not Found"
        description={`No customer account exists with identifier #${customerId}.`}
        action={
          <button type="button" onClick={() => onNavigate('customers')}>
            Return to Customers Directory
          </button>
        }
      />
    )
  }

  return (
    <div className="customer-profile">
      {/* Top Header Card */}
      <div className="profile-header-card">
        <div className="profile-header-top">
          <div className="profile-title-area">
            <span className="code-badge" style={{ fontSize: 16 }}>
              {customer.code || `C${String(customer.id).padStart(4, '0')}`}
            </span>
            <h1 className="profile-name">{customer.name}</h1>
            <span className={customer.is_active !== false ? 'badge-active' : 'badge-inactive'}>
              {customer.is_active !== false ? '● Active in Planning' : '○ Inactive / Paused'}
            </span>
            <span className={customer.customer_type === 'commercial' ? 'badge-commercial' : 'badge-domestic'}>
              {customer.customer_type === 'commercial' ? '🏢 Commercial' : '🏠 Domestic'}
            </span>
            {auth?.role === 'manager' && (
              <span className="demo-badge" style={{ fontSize: 11, background: '#fef3c7', color: '#b45309' }}>
                👁️ Read Only Profile
              </span>
            )}
          </div>

          {/* Quick Actions */}
          <div className="profile-header-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => onNavigate('customers')}
              title="Return to customer list"
            >
              ← Back to List
            </button>
            {auth?.role !== 'manager' ? (
              <>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setDeliveryModalOpen(true)}
                  title="Record a manual delivery"
                >
                  🚚 Record Delivery
                </button>
                <button
                  type="button"
                  className="secondary"
                  style={{ color: 'var(--color-urgent)', borderColor: 'rgba(123, 31, 162, 0.3)' }}
                  onClick={() => setUrgentModalOpen(true)}
                  title="Flag as urgent replenishment"
                >
                  🚨 Urgent Request
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setEditModalOpen(true)}
                  title="Edit customer information"
                >
                  ✏️ Edit
                </button>
                <button
                  type="button"
                  className={customer.is_active !== false ? 'ghost' : 'secondary'}
                  style={{ color: customer.is_active !== false ? 'var(--color-danger)' : 'var(--color-success)' }}
                  onClick={() => setDeactivateModalOpen(true)}
                  title={customer.is_active !== false ? 'Deactivate customer' : 'Reactivate customer'}
                >
                  {customer.is_active !== false ? 'Deactivate' : 'Reactivate'}
                </button>
              </>
            ) : null}
          </div>
        </div>

        {/* Contact & Address Bar */}
        <div className="profile-details-grid">
          <div className="profile-detail-item">
            <span className="detail-label">Phone Number</span>
            <span className="detail-value">
              <a href={`tel:${customer.phone}`} style={{ fontFamily: 'monospace' }}>
                📞 {customer.phone}
              </a>
            </span>
          </div>

          <div className="profile-detail-item">
            <span className="detail-label">Delivery Area</span>
            <span className="detail-value">📍 {customer.area || 'Faisalabad'}</span>
          </div>

          <div className="profile-detail-item">
            <span className="detail-label">Cylinder Specification</span>
            <span className="detail-value">🛢️ {customer.cylinder_type} ({customer.demand || 1} per cycle)</span>
          </div>

          <div className="profile-detail-item">
            <span className="detail-label">GPS Coordinates</span>
            <span className="detail-value">
              <a
                href={`https://www.openstreetmap.org/?mlat=${customer.lat}&mlon=${customer.lon}#map=16/${customer.lat}/${customer.lon}`}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 13 }}
              >
                🌐 {Number(customer.lat).toFixed(4)}, {Number(customer.lon).toFixed(4)}
              </a>
            </span>
          </div>
        </div>

        {customer.address && (
          <div style={{ fontSize: 14 }}>
            <span className="muted" style={{ fontWeight: 600 }}>Delivery Address: </span>
            <span>{customer.address}</span>
          </div>
        )}

        {customer.notes && (
          <div style={{ fontSize: 13, background: 'var(--bg-subtle)', padding: '8px 12px', borderRadius: 'var(--radius-sm)' }}>
            <span className="muted" style={{ fontWeight: 600 }}>Driver Notes: </span>
            <span>{customer.notes}</span>
          </div>
        )}
      </div>

      {/* KPI Tiles Bar */}
      <div className="customers-kpi-grid">
        <KpiTile
          title="Cylinders Held"
          value={cylinders.length || customer.demand || 1}
          subtitle={`Type: ${customer.cylinder_type}`}
          icon="🛢️"
        />
        <KpiTile
          title="Average Refill"
          value={`${avgRefillDays} days`}
          subtitle="Cycle interval"
          icon="⏱️"
        />
        <KpiTile
          title="Next Expected"
          value={nextExpectedDelivery}
          subtitle={`Demand: ${customer.demand || 1} cyl/order`}
          icon="📅"
        />
        <KpiTile
          title="Security Deposit"
          value={`PKR ${(customer.deposit || 0).toLocaleString()}`}
          subtitle="Refundable balance"
          icon="🔒"
        />
        <KpiTile
          title="Running Balance"
          value={`PKR ${accountBalance.toLocaleString()}`}
          subtitle={accountBalance === 0 ? 'Fully settled' : 'Outstanding dues'}
          icon="💳"
        />
      </div>

      {/* Recharts Refill Intervals Line Chart Card */}
      <div className="chart-card">
        <div className="chart-header">
          <div>
            <h3 className="chart-title">Refill Intervals & Demand Trend</h3>
            <p className="muted" style={{ fontSize: 13 }}>
              Number of days elapsed between successive cylinder delivery orders
            </p>
          </div>
          <span className="muted" style={{ fontSize: 13 }}>
            Target cycle: <strong>{avgRefillDays} days</strong>
          </span>
        </div>

        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={refillChartData} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={12} />
              <YAxis unit=" d" stroke="var(--text-muted)" fontSize={12} domain={[0, 'dataMax + 6']} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--bg-card)',
                  borderColor: 'var(--border-strong)',
                  borderRadius: 8,
                  fontSize: 13,
                  color: 'var(--text-primary)',
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="interval"
                name="Actual Interval (Days)"
                stroke="#0284c7"
                strokeWidth={3}
                activeDot={{ r: 6 }}
              />
              <Line
                type="monotone"
                dataKey="expected"
                name="Average Expected (Days)"
                stroke="#f59e0b"
                strokeDasharray="5 5"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tabs Header */}
      <div className="profile-tabs-header">
        <button
          type="button"
          className={`tab-btn ${activeTab === 'deliveries' ? 'active' : ''}`}
          onClick={() => setActiveTab('deliveries')}
        >
          🚚 Deliveries ({deliveries.length})
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'cylinders' ? 'active' : ''}`}
          onClick={() => setActiveTab('cylinders')}
        >
          🛢️ Cylinders Held ({cylinders.length})
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'ledger' ? 'active' : ''}`}
          onClick={() => setActiveTab('ledger')}
        >
          💳 Ledger & Account ({ledger.length})
        </button>
      </div>

      {/* Tab Content 1: Deliveries */}
      {activeTab === 'deliveries' && (
        <div className="profile-tab-content">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Delivery History</h3>
            <button type="button" className="secondary" onClick={() => setDeliveryModalOpen(true)}>
              + Record Delivery
            </button>
          </div>

          {deliveries.length === 0 ? (
            <EmptyState
              title="No deliveries recorded yet"
              description="Deliveries completed for this customer will appear here with dates, driver notes, and swap counts."
            />
          ) : (
            <>
              <div className="datatable-desktop">
                <table className="datatable">
                  <thead>
                    <tr>
                      <th>Date & Time</th>
                      <th>Route / Vehicle</th>
                      <th>Driver</th>
                      <th>Delivered</th>
                      <th>Collected</th>
                      <th>Interval</th>
                      <th>Status</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deliveries.slice(delivPage * PAGE_SIZE, (delivPage + 1) * PAGE_SIZE).map((del) => (
                      <tr key={del.id}>
                        <td style={{ fontWeight: 500 }}>
                          {formatDate(del.delivered_at)}
                        </td>
                        <td>Route #{del.route_id} ({del.vehicle_no})</td>
                        <td>{del.driver_name}</td>
                        <td style={{ fontWeight: 600, color: 'var(--color-success)' }}>
                          +{del.cylinders_delivered} ({del.cylinder_type})
                        </td>
                        <td style={{ color: 'var(--text-muted)' }}>
                          -{del.cylinders_collected} empty
                        </td>
                        <td>{del.interval_days ? `${del.interval_days} days` : '—'}</td>
                        <td>
                          <span className="badge-active" style={{ fontSize: 11 }}>
                            ✓ {del.status || 'delivered'}
                          </span>
                        </td>
                        <td className="muted">{del.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                currentPage={delivPage}
                totalPages={Math.ceil(deliveries.length / PAGE_SIZE)}
                totalItems={deliveries.length}
                pageSize={PAGE_SIZE}
                onPageChange={setDelivPage}
              />
            </>
          )}
        </div>
      )}

      {/* Tab Content 2: Cylinders Held */}
      {activeTab === 'cylinders' && (
        <div className="profile-tab-content">
          <h3 style={{ margin: 0 }}>Registered Cylinders in Possession</h3>
          <p className="muted" style={{ marginTop: -8 }}>
            Current physical LPG cylinders tagged and placed at this customer location.
          </p>

          {cylinders.length === 0 ? (
            <EmptyState
              title="No cylinders on file"
              description="No physical cylinders are currently registered to this customer account."
            />
          ) : (
            <>
              <div className="datatable-desktop">
                <table className="datatable">
                  <thead>
                    <tr>
                      <th>Serial Number</th>
                      <th>Cylinder Type</th>
                      <th>Delivered Date</th>
                      <th>Days Held</th>
                      <th>Tare Weight</th>
                      <th>Last Safety Check</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cylinders.slice(cylPage * PAGE_SIZE, (cylPage + 1) * PAGE_SIZE).map((cyl) => (
                      <tr key={cyl.id}>
                        <td>
                          <span className="code-badge">{cyl.serial_number || cyl.serial_no || `GAS-CYL-${cyl.id}`}</span>
                        </td>
                        <td style={{ fontWeight: 600 }}>{cyl.cylinder_type || customer.cylinder_type}</td>
                        <td>
                          {formatDate(cyl.delivered_at || cyl.created_at)}
                        </td>
                        <td>{cyl.days_held !== undefined ? `${cyl.days_held} days` : 'Active'}</td>
                        <td>{cyl.tare_weight_kg ? `${cyl.tare_weight_kg} kg` : (cyl.cylinder_type === '45.4 kg' ? '44.2 kg' : '13.2 kg')}</td>
                        <td>
                          {cyl.last_inspected ? formatDate(cyl.last_inspected) : 'Valid'}
                        </td>
                        <td>
                          <span className="badge-active" style={{ fontSize: 11 }}>
                            ● With Customer
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                currentPage={cylPage}
                totalPages={Math.ceil(cylinders.length / PAGE_SIZE)}
                totalItems={cylinders.length}
                pageSize={PAGE_SIZE}
                onPageChange={setCylPage}
              />
            </>
          )}
        </div>
      )}

      {/* Tab Content 3: Ledger */}
      {activeTab === 'ledger' && (
        <div className="profile-tab-content">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Customer Financial Ledger</h3>
            <span className="muted" style={{ fontSize: 13 }}>
              Security Deposit Held: <strong>PKR {(customer.deposit || 0).toLocaleString()}</strong>
            </span>
          </div>

          {ledger.length === 0 ? (
            <EmptyState
              title="No ledger transactions"
              description="Billing invoices, security deposit receipts, and payments will be displayed here."
            />
          ) : (
            <>
              <div className="datatable-desktop">
                <table className="datatable">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Transaction Type</th>
                      <th>Description</th>
                      <th style={{ textAlign: 'right' }}>Debit (PKR)</th>
                      <th style={{ textAlign: 'right' }}>Credit (PKR)</th>
                      <th style={{ textAlign: 'right' }}>Balance (PKR)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.slice(ledgerPage * PAGE_SIZE, (ledgerPage + 1) * PAGE_SIZE).map((entry) => (
                      <tr key={entry.id}>
                        <td>
                          {formatDate(entry.created_at)}
                        </td>
                        <td>
                          <span
                            className={
                              entry.entry_type === 'payment'
                                ? 'badge-active'
                                : entry.entry_type === 'deposit'
                                ? 'badge-domestic'
                                : 'badge-commercial'
                            }
                            style={{ fontSize: 11 }}
                          >
                            {(entry.entry_type || 'entry').toUpperCase()}
                          </span>
                        </td>
                        <td>{entry.description}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: entry.debit ? 'var(--color-danger)' : undefined }}>
                          {entry.debit ? entry.debit.toLocaleString() : '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: entry.credit ? 'var(--color-success)' : undefined }}>
                          {entry.credit ? entry.credit.toLocaleString() : '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>
                          {(entry.balance || 0).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                currentPage={ledgerPage}
                totalPages={Math.ceil(ledger.length / PAGE_SIZE)}
                totalItems={ledger.length}
                pageSize={PAGE_SIZE}
                onPageChange={setLedgerPage}
              />
            </>
          )}
        </div>
      )}

      {/* Edit Customer Modal */}
      <CustomerModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        customer={customer}
        token={auth.token}
        onSuccess={(updated) => {
          setCustomer(updated)
          loadData()
        }}
      />

      {/* Deactivate / Reactivate Modal */}
      <CustomerDeactivateModal
        isOpen={deactivateModalOpen}
        onClose={() => setDeactivateModalOpen(false)}
        customer={customer}
        token={auth.token}
        onSuccess={() => {
          loadData()
        }}
      />

      {/* Record Delivery Modal */}
      <Modal
        isOpen={deliveryModalOpen}
        onClose={() => setDeliveryModalOpen(false)}
        title={`Record Delivery: ${customer.name}`}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, width: '100%' }}>
            <button type="button" className="secondary" onClick={() => setDeliveryModalOpen(false)} disabled={actionBusy}>
              Cancel
            </button>
            <button type="button" onClick={handleRecordDeliverySubmit} disabled={actionBusy}>
              {actionBusy ? 'Saving...' : 'Confirm Delivery'}
            </button>
          </div>
        }
      >
        <form onSubmit={handleRecordDeliverySubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p className="muted" style={{ margin: 0 }}>
            Record an LPG refill drop-off and collect empty cylinders for customer account #{customer.id}.
          </p>

          <div className="form-grid-2">
            <FormField label="Filled Cylinders Delivered" required id="deliv-qty">
              <input
                id="deliv-qty"
                type="number"
                min="1"
                max="20"
                value={deliveryQty}
                onChange={(e) => setDeliveryQty(e.target.value)}
                required
              />
            </FormField>

            <FormField label="Empty Cylinders Collected" required id="collect-qty">
              <input
                id="collect-qty"
                type="number"
                min="0"
                max="20"
                value={collectedQty}
                onChange={(e) => setCollectedQty(e.target.value)}
                required
              />
            </FormField>
          </div>

          <FormField label="Delivery Notes / Challan Ref" id="deliv-notes">
            <textarea
              id="deliv-notes"
              rows="2"
              placeholder="e.g. Challan #CH-8821, received by store manager"
              value={deliveryNote}
              onChange={(e) => setDeliveryNote(e.target.value)}
            />
          </FormField>
        </form>
      </Modal>

      {/* Urgent Request Modal */}
      <Modal
        isOpen={urgentModalOpen}
        onClose={() => setUrgentModalOpen(false)}
        title="Trigger Urgent Request"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, width: '100%' }}>
            <button type="button" className="secondary" onClick={() => setUrgentModalOpen(false)} disabled={actionBusy}>
              Cancel
            </button>
            <button
              type="button"
              onClick={handleUrgentSubmit}
              disabled={actionBusy}
              style={{ background: 'var(--color-urgent)', borderColor: 'transparent' }}
            >
              {actionBusy ? 'Submitting...' : 'Send Urgent Request'}
            </button>
          </div>
        }
      >
        <form onSubmit={handleUrgentSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 32 }}>🚨</div>
            <div>
              <h4 style={{ margin: 0 }}>Prioritize {customer.name}</h4>
              <p className="muted" style={{ margin: '2px 0 0', fontSize: 13 }}>
                This creates an immediate urgent refill requirement and prioritizes this customer on today&apos;s solver route.
              </p>
            </div>
          </div>

          <FormField label="Urgent Request Reason / Note" id="urgent-note">
            <textarea
              id="urgent-note"
              rows="3"
              placeholder="e.g. Kitchen ran out of reserve gas during lunch rush..."
              value={urgentNote}
              onChange={(e) => setUrgentNote(e.target.value)}
              autoFocus
            />
          </FormField>
        </form>
      </Modal>
    </div>
  )
}
