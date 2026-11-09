// Mock handler for Daily Notes & Utilities
import { requireAuth } from './auth.js'
import { getDb, recordEvent, saveDb } from './db.js'

export const SEED_NOTES = [
  {
    id: 1,
    date: new Date().toISOString().split('T')[0],
    content: "Morning shift: Received 18 MT bowser from Pak Arab Gas at 7:30 AM. Pressure checked at 7.2 bar.\nDriver Tariq taking Route R-01 for Nishatabad and Millat Road.\nUrgent delivery requested by Chenab Club Kitchen (4x 45.4kg) before 1:00 PM.",
    author: 'owner',
    updated_at: new Date().toISOString(),
  },
  {
    id: 2,
    date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
    content: "Yesterday's log: Replaced 2 faulty valves on commercial 15kg cylinders. Sent to testing bench.\nCollected 18 empty cylinders from Al-Madina Hotel.",
    author: 'manager',
    updated_at: new Date(Date.now() - 86400000).toISOString(),
  },
]

export function handleGetNotes(token, dateQuery) {
  requireAuth(token, ['owner', 'manager', 'ceo', 'driver'])
  const db = getDb()
  if (!db.notes) {
    db.notes = [...SEED_NOTES]
    saveDb()
  }

  if (dateQuery) {
    const note = db.notes.find((n) => n.date === dateQuery)
    return {
      status: 200,
      data: note || { date: dateQuery, content: '', author: '', updated_at: null },
    }
  }

  return {
    status: 200,
    data: db.notes,
  }
}

export function handleSaveNote(token, body) {
  const user = requireAuth(token, ['owner', 'manager'])
  const db = getDb()
  if (!db.notes) db.notes = [...SEED_NOTES]

  const noteDate = body?.date || new Date().toISOString().split('T')[0]
  const content = body?.content || ''

  let note = db.notes.find((n) => n.date === noteDate)
  if (note) {
    note.content = content
    note.author = user.username
    note.updated_at = new Date().toISOString()
  } else {
    note = {
      id: db.notes.length > 0 ? Math.max(...db.notes.map((n) => n.id || 0)) + 1 : 1,
      date: noteDate,
      content,
      author: user.username,
      updated_at: new Date().toISOString(),
    }
    db.notes.push(note)
  }

  saveDb()

  recordEvent({
    type: 'NOTE_SAVED',
    actor: user.username,
    description: `Daily operations note saved for ${noteDate}`,
    details: { date: noteDate, length: content.length },
  })

  return {
    status: 200,
    data: {
      status: 'saved',
      note,
    },
  }
}

export function handleDeleteNote(token, noteId) {
  const user = requireAuth(token, ['owner'])
  const db = getDb()
  if (!db.notes) return { status: 200, data: { ok: true } }

  db.notes = db.notes.filter((n) => n.id !== noteId)
  saveDb()

  return {
    status: 200,
    data: { ok: true },
  }
}
