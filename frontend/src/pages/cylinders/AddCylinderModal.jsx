import { useState } from 'react'
import { createCylinder } from '../../api.js'
import FormField from '../../components/FormField.jsx'
import Modal from '../../components/Modal.jsx'
import { useToast } from '../../components/Toast.jsx'

export default function AddCylinderModal({ isOpen, onClose, token, onSuccess }) {
  const { showToast } = useToast()

  const [serialNo, setSerialNo] = useState('')
  const [cylinderType, setCylinderType] = useState('11.8 kg')
  const [owner, setOwner] = useState('Company')
  const [note, setNote] = useState('')

  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const handleClose = () => {
    setSerialNo('')
    setCylinderType('11.8 kg')
    setOwner('Company')
    setNote('')
    setError(null)
    onClose()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const cleanSerial = serialNo.trim().toUpperCase()
    if (!cleanSerial) {
      setError('Serial number is required')
      return
    }

    setBusy(true)
    setError(null)
    try {
      const created = await createCylinder(token, {
        serial_no: cleanSerial,
        cylinder_type: cylinderType,
        owner,
        note: note.trim() || undefined,
      })
      showToast(`Cylinder "${created.serial_no}" registered in state Empty`, 'success')
      onSuccess(created)
      handleClose()
    } catch (err) {
      // 409 duplicate serial or validation error
      setError(err.message || 'Failed to register cylinder')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Register New Cylinder"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, width: '100%' }}>
          <button type="button" className="secondary" onClick={handleClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={busy}>
            {busy ? 'Registering...' : 'Register Cylinder'}
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          New cylinders are initialized in state <strong>Empty</strong> at the depot.
        </p>

        {error && (
          <div className="error banner" role="alert">
            {error}
          </div>
        )}

        {/* Serial Number */}
        <FormField
          label="Cylinder Serial Number"
          required
          error={error?.toLowerCase().includes('serial') ? error : undefined}
          hint="Unique identifier embossed on cylinder collar (e.g. CYL-11-125)"
          id="cyl-serial"
        >
          <input
            id="cyl-serial"
            type="text"
            placeholder="e.g. CYL-11-125"
            value={serialNo}
            onChange={(e) => {
              setSerialNo(e.target.value.toUpperCase())
              if (error) setError(null)
            }}
            autoFocus
            required
          />
        </FormField>

        {/* Cylinder Type */}
        <FormField label="Cylinder Capacity / Type" id="cyl-type">
          <select
            id="cyl-type"
            value={cylinderType}
            onChange={(e) => setCylinderType(e.target.value)}
          >
            <option value="11.8 kg">11.8 kg (Domestic Standard)</option>
            <option value="15 kg">15 kg (Commercial Small)</option>
            <option value="45.4 kg">45.4 kg (Commercial Jumbo)</option>
          </select>
        </FormField>

        {/* Asset Owner */}
        <FormField
          label="Asset Ownership"
          hint="Company cylinders require a refundable security deposit from customers"
          id="cyl-owner"
        >
          <select
            id="cyl-owner"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
          >
            <option value="Company">Company (Gasora Asset)</option>
            <option value="Customer">Customer Owned (Refill Only)</option>
          </select>
        </FormField>

        {/* Registration Note */}
        <FormField label="Registration Note" id="cyl-note">
          <input
            id="cyl-note"
            type="text"
            placeholder="e.g. New batch from manufacturer, inspected"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </FormField>
      </form>
    </Modal>
  )
}
