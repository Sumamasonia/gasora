import KpiTile from '../../components/KpiTile'

const LIFECYCLE_STEPS = [
  {
    key: 'Empty',
    stepNumber: '1',
    label: 'Empty Stock',
    icon: '⚪',
    desc: 'At depot awaiting plant refilling',
    cssClass: 'step-empty',
    nextArrow: 'Refill ➔',
  },
  {
    key: 'Filled',
    stepNumber: '2',
    label: 'Filled & Tested',
    icon: '🔵',
    desc: 'Refilled, sealed, ready for dispatch',
    cssClass: 'step-filled',
    nextArrow: 'Deliver ➔',
  },
  {
    key: 'Delivered',
    stepNumber: '3',
    label: 'Delivered to Customers',
    icon: '🚚',
    desc: 'Actively in customer possession',
    cssClass: 'step-delivered',
    nextArrow: 'Recover ➔',
  },
  {
    key: 'Recovered',
    stepNumber: '4',
    label: 'Recovered Empties',
    icon: '↩️',
    desc: 'Collected from customer back at depot',
    cssClass: 'step-recovered',
    nextArrow: 'Stock ➔',
  },
]

export default function CylinderSummaryStrip({ summary, selectedState, onSelectState }) {
  if (!summary) return null

  const byState = summary.by_state || { Empty: 0, Filled: 0, Delivered: 0, Recovered: 0 }
  const byOwner = summary.by_owner || { Company: 0, Customer: 0 }
  const totalFleet = (byState.Empty || 0) + (byState.Filled || 0) + (byState.Delivered || 0) + (byState.Recovered || 0)

  const companyPct = totalFleet > 0 ? Math.round(((byOwner.Company || 0) / totalFleet) * 100) : 0
  const customerPct = totalFleet > 0 ? Math.round(((byOwner.Customer || 0) / totalFleet) * 100) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 4-Step Lifecycle Strip Card */}
      <div className="lifecycle-strip-card">
        <div className="lifecycle-header">
          <div className="lifecycle-title">
            <span>🔄 Four-Step Closed-Loop Cylinder Lifecycle</span>
          </div>
          <span className="muted" style={{ fontSize: 13 }}>
            Click any lifecycle step below to filter the cylinder register
          </span>
        </div>

        <div className="lifecycle-steps-grid">
          {LIFECYCLE_STEPS.map((step) => {
            const count = byState[step.key] || 0
            const isSelected = selectedState === step.key
            return (
              <div
                key={step.key}
                className={`lifecycle-step-card ${step.cssClass} ${isSelected ? 'active-filter' : ''}`}
                onClick={() => onSelectState(isSelected ? null : step.key)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && onSelectState(isSelected ? null : step.key)}
              >
                <div className="step-card-header">
                  <span className="step-indicator">#{step.stepNumber}</span>
                  <span className="step-arrow-badge">{step.nextArrow}</span>
                </div>

                <div className="step-count">
                  {count} <span style={{ fontSize: 14, fontWeight: 500 }} className="muted">cyl</span>
                </div>

                <div className="step-label">
                  {step.icon} {step.label}
                </div>

                <div className="step-desc">{step.desc}</div>
              </div>
            )
          })}
        </div>

        <div className="lifecycle-footer-note">
          <span>
            Strict State Machine: <strong>Empty ➔ Filled ➔ Delivered ➔ Recovered ➔ Empty</strong>
          </span>
          {selectedState && (
            <button
              type="button"
              className="ghost"
              style={{ fontSize: 12, padding: '2px 8px', minHeight: 'auto' }}
              onClick={() => onSelectState(null)}
            >
              ✕ Clear Step Filter ({selectedState})
            </button>
          )}
        </div>
      </div>

      {/* Fleet Breakdown By Owner Cards */}
      <div className="owner-cards-grid">
        <KpiTile
          title="Company Owned"
          value={byOwner.Company || 0}
          subtitle={`${companyPct}% of total cylinder fleet`}
          icon="🏢"
          trend={{ positive: true, label: 'Gasora Asset' }}
        />
        <KpiTile
          title="Customer Owned"
          value={byOwner.Customer || 0}
          subtitle={`${customerPct}% customer-supplied cylinders`}
          icon="👤"
        />
        <KpiTile
          title="Empties Outstanding"
          value={byState.Delivered || 0}
          subtitle={`Held across ${(summary.held_by_customers || []).length} customer sites`}
          icon="⏳"
          trend={{ positive: false, label: 'Pending Swap' }}
        />
        <KpiTile
          title="Total Registered Fleet"
          value={totalFleet}
          subtitle="All cylinders across depot & field"
          icon="🛢️"
        />
      </div>
    </div>
  )
}
