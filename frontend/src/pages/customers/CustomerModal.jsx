import { useEffect, useState } from 'react'
import { CircleMarker, MapContainer, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { createCustomer, updateCustomer } from '../../api'
import FormField from '../../components/FormField'
import Modal from '../../components/Modal'
import { useToast } from '../../components/Toast'

const FAISALABAD_DEPOT = [31.4181, 73.0776]

const POPULAR_AREAS = [
  'D Ground',
  'Civil Lines',
  'Peoples Colony 1',
  'Peoples Colony 2',
  'Madina Town',
  'Samanabad',
  'Gulberg',
  'Canal Road',
  'Millat Town',
  'Sargodha Road',
  'Batala Colony',
  'Satiana Road',
  'Kohinoor City',
  'Officers Colony',
  'Clock Tower',
]

// Faisalabad bounds check
function isOutsideFaisalabad(lat, lon) {
  if (lat === null || lon === null || isNaN(lat) || isNaN(lon)) return false
  return lat < 31.25 || lat > 31.60 || lon < 72.90 || lon > 73.25
}

// Leaflet map controller for resizing and center updates
function MapController({ center }) {
  const map = useMap()
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize()
    }, 200)
    return () => clearTimeout(timer)
  }, [map])

  useEffect(() => {
    if (center && !isNaN(center[0]) && !isNaN(center[1])) {
      map.setView(center, map.getZoom(), { animate: true })
    }
  }, [center, map])

  return null
}

// Click listener to pick coordinates from Leaflet map
function MapClickHandler({ onSelect }) {
  useMapEvents({
    click(e) {
      onSelect(parseFloat(e.latlng.lat.toFixed(6)), parseFloat(e.latlng.lng.toFixed(6)))
    },
  })
  return null
}

export default function CustomerModal({ isOpen, onClose, customer, token, onSuccess }) {
  const { showToast } = useToast()

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [area, setArea] = useState('')
  const [customerType, setCustomerType] = useState('domestic')
  const [cylinderType, setCylinderType] = useState('11.8 kg')
  const [deposit, setDeposit] = useState(6000)
  const [demand, setDemand] = useState(1)
  const [notes, setNotes] = useState('')
  const [lat, setLat] = useState(FAISALABAD_DEPOT[0])
  const [lon, setLon] = useState(FAISALABAD_DEPOT[1])

  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  // Populate form when editing or opening
  useEffect(() => {
    if (!isOpen) return
    if (customer) {
      setName(customer.name || '')
      setPhone(customer.phone || '')
      setAddress(customer.address || '')
      setArea(customer.area || '')
      setCustomerType(customer.customer_type || 'domestic')
      setCylinderType(customer.cylinder_type || '11.8 kg')
      setDeposit(customer.deposit !== undefined ? customer.deposit : 6000)
      setDemand(customer.demand !== undefined ? customer.demand : 1)
      setNotes(customer.notes || '')
      setLat(customer.lat !== undefined ? Number(customer.lat) : FAISALABAD_DEPOT[0])
      setLon(customer.lon !== undefined ? Number(customer.lon) : FAISALABAD_DEPOT[1])
    } else {
      // Defaults for new customer
      setName('')
      setPhone('')
      setAddress('')
      setArea('D Ground')
      setCustomerType('domestic')
      setCylinderType('11.8 kg')
      setDeposit(6000)
      setDemand(1)
      setNotes('')
      setLat(FAISALABAD_DEPOT[0])
      setLon(FAISALABAD_DEPOT[1])
    }
    setErrors({})
    setBusy(false)
  }, [isOpen, customer])

  // Auto-adjust default deposit when cylinder type changes (if deposit matches common defaults)
  const handleCylinderTypeChange = (newType) => {
    setCylinderType(newType)
    if (!customer) {
      if (newType === '45.4 kg') setDeposit(25000)
      else if (newType === '15 kg') setDeposit(12000)
      else setDeposit(6000)
    }
  }

  // Handle Map click selection
  const handleMapLocationSelect = (newLat, newLon) => {
    setLat(newLat)
    setLon(newLon)
    setErrors((prev) => ({ ...prev, lat: undefined, lon: undefined }))
  }

  // Validation function
  const validate = () => {
    const errs = {}

    // Name
    if (!name.trim()) {
      errs.name = 'Customer name is required'
    }

    // Phone (03xx check)
    if (!phone.trim()) {
      errs.phone = 'Phone number is required'
    } else {
      const cleanPhone = phone.trim().replace(/[\s-]/g, '')
      if (!cleanPhone.startsWith('03')) {
        errs.phone = 'Phone number must start with 03xx (e.g. 0300-1234567)'
      } else if (!/^\d{11}$/.test(cleanPhone)) {
        errs.phone = 'Phone number must have exactly 11 digits (e.g. 0300-1234567)'
      }
    }

    // Address
    if (!address.trim()) {
      errs.address = 'Street address is required'
    }

    // Area
    if (!area.trim()) {
      errs.area = 'Delivery area is required'
    }

    // Demand 1-10
    const demandNum = Number(demand)
    if (isNaN(demandNum) || demandNum < 1 || demandNum > 10) {
      errs.demand = 'Demand must be between 1 and 10 cylinders'
    }

    // Deposit
    const depositNum = Number(deposit)
    if (isNaN(depositNum) || depositNum < 0) {
      errs.deposit = 'Deposit must be a positive amount in PKR'
    }

    // Lat / Lon
    const latNum = parseFloat(lat)
    const lonNum = parseFloat(lon)
    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      errs.lat = 'Valid latitude between -90 and 90 is required'
    }
    if (isNaN(lonNum) || lonNum < -180 || lonNum > 180) {
      errs.lon = 'Valid longitude between -180 and 180 is required'
    }

    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return

    setBusy(true)
    const payload = {
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim(),
      area: area.trim(),
      customer_type: customerType,
      cylinder_type: cylinderType,
      deposit: Number(deposit),
      demand: Number(demand),
      notes: notes.trim(),
      lat: parseFloat(lat),
      lon: parseFloat(lon),
    }

    try {
      let saved
      if (customer) {
        saved = await updateCustomer(token, customer.id, payload)
        showToast(`Customer "${saved.name}" updated successfully`, 'success')
      } else {
        saved = await createCustomer(token, payload)
        showToast(`Customer "${saved.name}" registered successfully`, 'success')
      }
      onSuccess(saved)
      onClose()
    } catch (err) {
      showToast(err.message || 'Failed to save customer', 'danger')
      setErrors((prev) => ({ ...prev, form: err.message }))
    } finally {
      setBusy(false)
    }
  }

  const latNum = parseFloat(lat)
  const lonNum = parseFloat(lon)
  const outsideFsd = isOutsideFaisalabad(latNum, lonNum)
  const markerPos = !isNaN(latNum) && !isNaN(lonNum) ? [latNum, lonNum] : FAISALABAD_DEPOT

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={customer ? `Edit Customer (${customer.code || customer.name})` : 'Register New Customer'}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, width: '100%' }}>
          <button type="button" className="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={busy}>
            {busy ? 'Saving...' : customer ? 'Save Changes' : 'Register Customer'}
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {errors.form && <div className="error banner">{errors.form}</div>}

        <div className="form-grid-2">
          {/* Customer Name */}
          <FormField label="Customer Name" required error={errors.name} id="cust-name">
            <input
              id="cust-name"
              type="text"
              placeholder="e.g. Al-Madina Bakers or Mian Aslam"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }))
              }}
              autoFocus
            />
          </FormField>

          {/* Phone (03xx) */}
          <FormField
            label="Phone Number"
            required
            error={errors.phone}
            hint="Starts with 03xx (e.g. 0300-1234567)"
            id="cust-phone"
          >
            <input
              id="cust-phone"
              type="tel"
              placeholder="0300-1234567"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value)
                if (errors.phone) setErrors((prev) => ({ ...prev, phone: undefined }))
              }}
            />
          </FormField>
        </div>

        {/* Street Address */}
        <FormField label="Delivery Address" required error={errors.address} id="cust-address">
          <input
            id="cust-address"
            type="text"
            placeholder="Shop / House number, street, landmark"
            value={address}
            onChange={(e) => {
              setAddress(e.target.value)
              if (errors.address) setErrors((prev) => ({ ...prev, address: undefined }))
            }}
          />
        </FormField>

        <div className="form-grid-2">
          {/* Area */}
          <FormField label="Area / Neighborhood" required error={errors.area} id="cust-area">
            <input
              id="cust-area"
              type="text"
              list="popular-areas-list"
              placeholder="Select or type area"
              value={area}
              onChange={(e) => {
                setArea(e.target.value)
                if (errors.area) setErrors((prev) => ({ ...prev, area: undefined }))
              }}
            />
            <datalist id="popular-areas-list">
              {POPULAR_AREAS.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </FormField>

          {/* Customer Type */}
          <FormField label="Customer Type" id="cust-type">
            <select
              id="cust-type"
              value={customerType}
              onChange={(e) => {
                const val = e.target.value
                setCustomerType(val)
                if (val === 'commercial' && cylinderType === '11.8 kg') {
                  setCylinderType('45.4 kg')
                  if (!customer) setDeposit(25000)
                } else if (val === 'domestic' && cylinderType === '45.4 kg') {
                  setCylinderType('11.8 kg')
                  if (!customer) setDeposit(6000)
                }
              }}
            >
              <option value="domestic">Domestic (Household)</option>
              <option value="commercial">Commercial (Business/Hotel)</option>
            </select>
          </FormField>
        </div>

        <div className="form-grid-2">
          {/* Cylinder Type */}
          <FormField label="Cylinder Size" id="cust-cyl-type">
            <select
              id="cust-cyl-type"
              value={cylinderType}
              onChange={(e) => handleCylinderTypeChange(e.target.value)}
            >
              <option value="11.8 kg">11.8 kg (Domestic standard)</option>
              <option value="15 kg">15 kg (Commercial mini)</option>
              <option value="45.4 kg">45.4 kg (Commercial jumbo)</option>
            </select>
          </FormField>

          {/* Demand (1-10) */}
          <FormField
            label="Demand (Cylinders per delivery)"
            required
            error={errors.demand}
            hint="Quantity delivered on each refill (1-10)"
            id="cust-demand"
          >
            <input
              id="cust-demand"
              type="number"
              min="1"
              max="10"
              value={demand}
              onChange={(e) => {
                setDemand(e.target.value)
                if (errors.demand) setErrors((prev) => ({ ...prev, demand: undefined }))
              }}
            />
          </FormField>
        </div>

        {/* Security Deposit */}
        <FormField
          label="Security Deposit (PKR)"
          required
          error={errors.deposit}
          hint="Refundable security deposit held against cylinders"
          id="cust-deposit"
        >
          <input
            id="cust-deposit"
            type="number"
            min="0"
            step="500"
            value={deposit}
            onChange={(e) => {
              setDeposit(e.target.value)
              if (errors.deposit) setErrors((prev) => ({ ...prev, deposit: undefined }))
            }}
          />
        </FormField>

        {/* Map Picker Section */}
        <div className="map-picker-section">
          <label className="field-label">
            Location Map Picker <span className="field-required">*</span>
            <span className="muted" style={{ fontWeight: 400, marginLeft: 6 }}>
              (Click on the map to place the delivery pin)
            </span>
          </label>

          <div className="map-picker-container">
            <MapContainer center={markerPos} zoom={13} style={{ height: '100%', width: '100%' }}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapController center={markerPos} />
              <MapClickHandler onSelect={handleMapLocationSelect} />
              <CircleMarker
                center={markerPos}
                radius={8}
                pathOptions={{
                  color: '#0284c7',
                  fillColor: '#38bdf8',
                  fillOpacity: 0.9,
                  weight: 2,
                }}
              >
                <Popup>
                  <strong>{name || 'Selected Customer Location'}</strong>
                  <br />
                  Lat: {latNum.toFixed(5)}, Lon: {lonNum.toFixed(5)}
                </Popup>
              </CircleMarker>
            </MapContainer>
          </div>

          {/* Faisalabad Bounds Warning */}
          {outsideFsd && (
            <div className="map-picker-warning" role="alert">
              ⚠️ Warning: Location ({latNum.toFixed(4)}, {lonNum.toFixed(4)}) is outside the standard Faisalabad delivery zone (lat ~31.25–31.60, lon ~72.90–73.25).
            </div>
          )}

          {/* Manual Lat/Lon Inputs */}
          <div className="form-grid-2" style={{ marginTop: 4 }}>
            <FormField label="Latitude" required error={errors.lat} id="cust-lat">
              <input
                id="cust-lat"
                type="number"
                step="0.0001"
                value={lat}
                onChange={(e) => {
                  setLat(e.target.value)
                  if (errors.lat) setErrors((prev) => ({ ...prev, lat: undefined }))
                }}
              />
            </FormField>

            <FormField label="Longitude" required error={errors.lon} id="cust-lon">
              <input
                id="cust-lon"
                type="number"
                step="0.0001"
                value={lon}
                onChange={(e) => {
                  setLon(e.target.value)
                  if (errors.lon) setErrors((prev) => ({ ...prev, lon: undefined }))
                }}
              />
            </FormField>
          </div>
        </div>

        {/* Notes */}
        <FormField
          label="Delivery Notes & Instructions"
          hint="Gate codes, delivery time preference, contact person"
          id="cust-notes"
        >
          <textarea
            id="cust-notes"
            rows="2"
            placeholder="e.g. Ring side doorbell, preferred delivery before 11:00 AM..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </FormField>
      </form>
    </Modal>
  )
}
