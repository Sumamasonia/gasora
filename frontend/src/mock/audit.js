// Hash-chained audit event log verification and mock endpoints
// Matches backend/eventlog.py SHA-256 hash chaining algorithm

export const GENESIS_HASH = '0'.repeat(64)

// Pure JavaScript SHA-256 implementation
export function sha256(ascii) {
  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount))
  }

  const mathPow = Math.pow
  const maxWord = mathPow(2, 32)
  const lengthProperty = 'length'
  let i, j
  let result = ''

  // UTF-8 encode if necessary
  let utf8 = ''
  for (let n = 0; n < ascii.length; n++) {
    const charcode = ascii.charCodeAt(n)
    if (charcode < 128) {
      utf8 += String.fromCharCode(charcode)
    } else if (charcode < 2048) {
      utf8 += String.fromCharCode((charcode >> 6) | 192)
      utf8 += String.fromCharCode((charcode & 63) | 128)
    } else {
      utf8 += String.fromCharCode((charcode >> 12) | 224)
      utf8 += String.fromCharCode(((charcode >> 6) & 63) | 128)
      utf8 += String.fromCharCode((charcode & 63) | 128)
    }
  }

  const words = []
  const asciiBitLength = utf8[lengthProperty] * 8

  let hash = []
  const k = []
  let primeCounter = 0

  const isComposite = {}
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = candidate
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0
    }
  }

  hash = hash.slice(0, 8)
  utf8 += '\x80'
  while ((utf8[lengthProperty] % 64) - 56) utf8 += '\x00'
  for (i = 0; i < utf8[lengthProperty]; i++) {
    j = utf8.charCodeAt(i)
    words[i >> 2] |= j << (((3 - i) % 4) * 8)
  }
  words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0
  words[words[lengthProperty]] = asciiBitLength | 0

  for (j = 0; j < words[lengthProperty]; ) {
    const w = words.slice(j, (j += 16))
    const oldHash = hash
    hash = hash.slice(0, 8)

    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15]
      const w2 = w[i - 2]

      const a = hash[0]
      const e = hash[4]
      const temp1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                w[i - 7] +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0)
      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]))

      hash = [(temp1 + temp2) | 0].concat(hash)
      hash[4] = (hash[4] + temp1) | 0
    }

    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0
    }
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255
      result += (b < 16 ? '0' : '') + b.toString(16)
    }
  }
  return result
}

// Canonical JSON matching Python json.dumps(payload, sort_keys=True, separators=(",", ":"))
export function canonicalJson(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj)
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJson).join(',') + ']'
  }
  const keys = Object.keys(obj).sort()
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}'
}

// Compute SHA-256 hash for event record
export function computeEventHash(prevHash, ts, actor, eventType, payload) {
  const payloadText = typeof payload === 'string' ? payload : canonicalJson(payload || {})
  const text = [prevHash, ts, actor, eventType, payloadText].join('\n')
  return sha256(text)
}

// Generate default initial seed events
export function generateSeedEvents() {
  const rawEvents = [
    {
      id: 1,
      ts: '2026-11-08T07:30:00.000Z',
      actor: 'system',
      event_type: 'SYSTEM_BOOT',
      payload: { system: 'Gasora ERP', version: '2.4.0', node: 'fsd-central-1' },
      description: 'System initialization and database integrity verification',
    },
    {
      id: 2,
      ts: '2026-11-08T07:45:00.000Z',
      actor: 'owner',
      event_type: 'AUTH_LOGIN',
      payload: { user: 'owner', method: 'password', ip: '192.168.1.100' },
      description: 'User owner authenticated from terminal console',
    },
    {
      id: 3,
      ts: '2026-11-08T08:00:00.000Z',
      actor: 'owner',
      event_type: 'PURCHASE_VERIFIED',
      payload: { purchase_id: 1, supplier: 'Pak Arab Gas Ltd', tons: 15.0, rate_per_ton: 195000 },
      description: 'Bulk LPG purchase verified: 15.0 MT @ 195,000 PKR/ton',
    },
    {
      id: 4,
      ts: '2026-11-08T08:15:00.000Z',
      actor: 'owner',
      event_type: 'PLAN_PUBLISHED',
      payload: { day: '2026-11-08', routes: 2, total_stops: 10, total_cylinders: 45 },
      description: 'Daily dispatch route published for 2 delivery vehicles',
    },
    {
      id: 5,
      ts: '2026-11-08T08:30:00.000Z',
      actor: 'driver',
      event_type: 'ROUTE_ASSIGNED',
      payload: { route_id: 'R-01', truck_no: 'FSD-7712', driver: 'driver', cylinders_loaded: 24 },
      description: 'Route R-01 assigned to driver Tariq (FSD-7712)',
    },
    {
      id: 6,
      ts: '2026-11-08T09:10:00.000Z',
      actor: 'driver',
      event_type: 'DELIVERY_COMPLETED',
      payload: { customer_id: 1, customer: 'Al-Madina Hotel', cylinders_delivered: 4, cylinders_empty: 4 },
      description: 'Delivered 4 cylinders to Al-Madina Hotel; collected 4 empties',
    },
    {
      id: 7,
      ts: '2026-11-08T09:45:00.000Z',
      actor: 'driver',
      event_type: 'DELIVERY_COMPLETED',
      payload: { customer_id: 2, customer: 'Kashmir Bakery', cylinders_delivered: 2, cylinders_empty: 2 },
      description: 'Delivered 2 cylinders to Kashmir Bakery; collected 2 empties',
    },
    {
      id: 8,
      ts: '2026-11-08T10:15:00.000Z',
      actor: 'customer',
      event_type: 'URGENT_REQUEST',
      payload: { customer_id: 3, name: 'Chenab Club Kitchen', quantity: 3, priority: 'urgent' },
      description: 'Urgent cylinder replacement requested by Chenab Club Kitchen',
    },
    {
      id: 9,
      ts: '2026-11-08T10:30:00.000Z',
      actor: 'manager',
      event_type: 'EXPENSE_RECORDED',
      payload: { expense_id: 1, category: 'Fuel', amount_pkr: 4500, vehicle: 'FSD-7712' },
      description: 'Fuel expense approved: 4,500 PKR for vehicle FSD-7712',
    },
    {
      id: 10,
      ts: '2026-11-08T11:00:00.000Z',
      actor: 'owner',
      event_type: 'USER_CREATED',
      payload: { username: 'manager2', role: 'manager', is_active: true },
      description: 'New staff account created: manager2 (role: manager)',
    },
  ]

  let prev = GENESIS_HASH
  return rawEvents.map((e) => {
    const prev_hash = prev
    const hash = computeEventHash(prev_hash, e.ts, e.actor, e.event_type, e.payload)
    prev = hash
    return {
      ...e,
      prev_hash,
      hash,
    }
  })
}

// Handler: GET /audit/events or GET /events
export function handleGetAuditEvents(token, db) {
  const user = db.users?.find((u) => u.token === token)
  if (!user || (user.role !== 'owner' && user.role !== 'ceo')) {
    return { status: 403, data: { detail: 'Only owner and CEO can view the activity audit log' } }
  }

  // Ensure events array exists and is initialized
  if (!db.events || db.events.length === 0) {
    db.events = generateSeedEvents()
  }

  return {
    status: 200,
    data: db.events,
  }
}

// Handler: GET /audit/verify
export function handleVerifyAudit(token, db) {
  const user = db.users?.find((u) => u.token === token)
  if (!user || (user.role !== 'owner' && user.role !== 'ceo')) {
    return { status: 403, data: { detail: 'Only owner can verify audit chain integrity' } }
  }

  const events = db.events || []
  if (events.length === 0) {
    return {
      status: 200,
      data: {
        ok: true,
        message: 'chain OK (0 events)',
        events: 0,
        head: GENESIS_HASH,
      },
    }
  }

  // Check demo tampering switch from Settings
  if (db.settings?.simulate_tampered_audit === true) {
    return {
      status: 200,
      data: {
        ok: false,
        message: 'event 3: content does not match its hash (tampering detected at sequence #3: payload modified)',
        events: events.length,
        head: 'CHAIN_INTEGRITY_COMPROMISED_AT_EVENT_3',
      },
    }
  }

  // Verify the entire chain step by step
  let prev = GENESIS_HASH
  let lastId = 0

  for (const e of events) {
    if (e.id !== lastId + 1) {
      return {
        status: 200,
        data: {
          ok: false,
          message: `event number ${lastId + 1} is missing (found ${e.id})`,
          events: events.length,
          head: prev,
        },
      }
    }

    if (e.prev_hash !== prev) {
      return {
        status: 200,
        data: {
          ok: false,
          message: `event ${e.id}: link to the previous event is broken`,
          events: events.length,
          head: prev,
        },
      }
    }

    const calculatedHash = computeEventHash(e.prev_hash, e.ts, e.actor, e.event_type || e.type, e.payload || e.details)
    if (calculatedHash !== e.hash) {
      return {
        status: 200,
        data: {
          ok: false,
          message: `event ${e.id}: content does not match its hash`,
          events: events.length,
          head: prev,
        },
      }
    }

    prev = e.hash
    lastId = e.id
  }

  return {
    status: 200,
    data: {
      ok: true,
      message: `chain OK (${lastId} events verified with SHA-256)`,
      events: events.length,
      head: prev,
    },
  }
}
