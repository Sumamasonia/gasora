import { useState } from 'react'
import DataTable from '../components/DataTable'
import EmptyState from '../components/EmptyState'
import FormField from '../components/FormField'
import KpiTile from '../components/KpiTile'
import Modal from '../components/Modal'
import NotReady from '../components/NotReady'
import Skeleton from '../components/Skeleton'
import Spinner from '../components/Spinner'
import { useToast } from '../components/Toast'
import { Badge, UrgentTag } from '../ui'

export default function UiKit() {
  const { showToast } = useToast()
  const [modalOpen, setModalOpen] = useState(false)
  const [sampleInput, setSampleInput] = useState('')
  const [showError, setShowError] = useState(true)

  const sampleColumns = [
    { key: 'id', label: 'ID', sortable: true },
    { key: 'name', label: 'Customer Name', sortable: true },
    { key: 'area', label: 'Area', sortable: true },
    {
      key: 'band',
      label: 'Risk Level',
      render: (val) => <Badge band={val} />,
      sortable: true,
    },
    {
      key: 'urgent',
      label: 'Urgent',
      render: (val) => (val ? <UrgentTag /> : <span className="muted">No</span>),
    },
    { key: 'demand', label: 'Cylinders', sortable: true },
  ]

  const sampleData = [
    { id: 1, name: 'Al-Madina Bakers', area: 'D Ground', band: 'Normal', urgent: false, demand: 3 },
    { id: 2, name: 'Chenab Club Kitchen', area: 'Civil Lines', band: 'High', urgent: false, demand: 3 },
    { id: 3, name: 'Mian Aslam', area: 'Peoples Colony', band: 'Critical', urgent: false, demand: 1 },
    { id: 4, name: 'Bundu Khan Restaurant', area: 'Madina Town', band: 'Urgent', urgent: true, demand: 2 },
  ]

  return (
    <div style={{ maxWidth: 960, margin: '24px auto', padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div>
        <h1>Gasora UI Component Kit</h1>
        <p className="muted">Showcase of shared design components and design tokens.</p>
      </div>

      {/* KPI Tiles */}
      <section>
        <h2>KPI Tiles</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginTop: 12 }}>
          <KpiTile title="Pending Deliveries" value="48" icon="🚚" trend={{ label: '+12% today', positive: true }} />
          <KpiTile title="Filled Cylinders" value="126" icon="🛢️" subtitle="In central stock" />
          <KpiTile title="Empty Cylinders" value="34" icon="⚠️" trend={{ label: '-5% buffer', positive: false }} />
          <KpiTile title="Revenue (PKR)" value="Rs. 182,500" icon="💰" subtitle="This month" />
        </div>
      </section>

      {/* Badges & Tags */}
      <section>
        <h2>Risk Bands & Tags</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
          <Badge band="Normal" />
          <Badge band="High" />
          <Badge band="Critical" />
          <Badge band="Urgent" />
          <UrgentTag />
        </div>
      </section>

      {/* Form Fields */}
      <section>
        <h2>Form Controls & Validation</h2>
        <div className="card" style={{ maxWidth: 440, marginTop: 12 }}>
          <FormField label="Customer Name" required id="name-input">
            <input
              id="name-input"
              value={sampleInput}
              onChange={(e) => setSampleInput(e.target.value)}
              placeholder="e.g. Al-Madina Bakers"
            />
          </FormField>
          <FormField
            label="Phone Number"
            required
            id="phone-input"
            error={showError ? 'Phone format must be 03xx-xxxxxxx' : null}
            hint="Enter a valid Pakistan mobile number"
          >
            <input id="phone-input" defaultValue="0300" />
          </FormField>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={() => setShowError(!showError)}>
              Toggle Error
            </button>
            <button type="button" className="secondary">Secondary Button</button>
            <button type="button" className="danger">Delete</button>
          </div>
        </div>
      </section>

      {/* Interactive Modal & Toasts */}
      <section>
        <h2>Modals & Toasts</h2>
        <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setModalOpen(true)}>Open Modal</button>
          <button type="button" className="secondary" onClick={() => showToast('Operation completed successfully!', 'success')}>
            Show Success Toast
          </button>
          <button type="button" className="secondary" onClick={() => showToast('Something went wrong. Please retry.', 'error')}>
            Show Error Toast
          </button>
          <button type="button" className="secondary" onClick={() => showToast('New delivery route generated.', 'info')}>
            Show Info Toast
          </button>
        </div>
      </section>

      {/* DataTable */}
      <section>
        <h2>Data Table (Sortable, Searchable, Responsive)</h2>
        <div style={{ marginTop: 12 }}>
          <DataTable
            columns={sampleColumns}
            data={sampleData}
            searchPlaceholder="Search customers, area, risk..."
          />
        </div>
      </section>

      {/* Loading States */}
      <section>
        <h2>Spinners & Skeletons</h2>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center', marginTop: 12 }}>
          <Spinner size={28} label="Loading customers" />
          <div style={{ flex: 1, maxWidth: 360 }}>
            <Skeleton variant="text" count={3} />
          </div>
        </div>
      </section>

      {/* Empty State */}
      <section>
        <h2>Empty State</h2>
        <EmptyState
          icon="📍"
          title="No deliveries scheduled for today"
          description="Click the button below to generate optimized dispatch routes from today's customer demand."
          action={<button type="button">Generate Dispatch Plan</button>}
        />
      </section>

      {/* Not Ready Component */}
      <section>
        <h2>NotReady Mock Warning</h2>
        <NotReady endpoint="GET /billing/invoices" />
      </section>

      {/* Modal Dialog */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Sample Modal Dialog"
        footer={
          <>
            <button type="button" className="secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="button" onClick={() => { setModalOpen(false); showToast('Changes saved!', 'success') }}>Save Changes</button>
          </>
        }
      >
        <p>This is a reusable, accessible modal dialog with keyboard escape navigation and click-outside dismissal.</p>
      </Modal>
    </div>
  )
}
