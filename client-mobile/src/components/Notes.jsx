import { useEffect, useState } from 'react'
import { NotebookPen, Trash2, Check, Undo2 } from 'lucide-react'

// Notizen direkt im Portal gespeichert (kein Nextcloud) -- Entscheidung 11.08.2026.
// Backend: src/routes/api/notes.js, Tabelle employee_notes, Area "notizen"
// (ergaenzt in src/utils/permissions.js fuer mitarbeiter/freelancer).
//
// GET    /api/notes       -> [{ id, employee_id, text, done, created_at, updated_at }]
//                             offene zuerst, dann neueste zuerst
// POST   /api/notes       -> Body { text } -> 201 neue Notiz
// PATCH  /api/notes/:id   -> Body { done? , text? } -> aktualisierte Notiz
// DELETE /api/notes/:id   -> { success: true }

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function Notes() {
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const load = () => {
    fetch('/api/notes', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setNotes(Array.isArray(data) ? data : []))
      .catch(() => setError('Notizen konnten nicht geladen werden.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const submit = async (e) => {
    e.preventDefault()
    if (!text.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Notiz konnte nicht angelegt werden.')
      } else {
        setText('')
        load()
      }
    } catch {
      setError('Server nicht erreichbar.')
    } finally {
      setSubmitting(false)
    }
  }

  const toggleDone = async (note) => {
    setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, done: note.done ? 0 : 1 } : n)))
    await fetch(`/api/notes/${note.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: !note.done }),
    }).catch(() => {})
    load()
  }

  const remove = async (id) => {
    setNotes((prev) => prev.filter((n) => n.id !== id))
    await fetch(`/api/notes/${id}`, { method: 'DELETE', credentials: 'include' }).catch(() => {})
    load()
  }

  const open = notes.filter((n) => !n.done)
  const done = notes.filter((n) => n.done)

  return (
    <section>
      <h2 className="section-title"><NotebookPen size={17} />Notizen</h2>

      <form onSubmit={submit} className="vacation-form">
        <label>
          Neue Notiz
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="z. B. Kunde X ruft wegen Nachbestellung an"
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={submitting || !text.trim()}>
          {submitting ? 'Wird gespeichert…' : 'Notiz speichern'}
        </button>
      </form>

      {loading && <p className="hint">Lädt…</p>}

      {!loading && (
        <>
          <ul className="card-list">
            {open.map((n) => (
              <li key={n.id} className="card">
                <span>{n.text}</span>
                <div className="qty-row">
                  <span className="card-sub">{formatDate(n.created_at)}</span>
                  <button type="button" className="add-btn" onClick={() => toggleDone(n)}>
                    <Check size={16} /> Erledigt
                  </button>
                  <button type="button" className="remove-btn" onClick={() => remove(n.id)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </li>
            ))}
            {open.length === 0 && <li className="card-empty">Keine offenen Notizen.</li>}
          </ul>

          {done.length > 0 && (
            <>
              <h2 className="section-title">Erledigt</h2>
              <ul className="card-list">
                {done.map((n) => (
                  <li key={n.id} className="card">
                    <span className="note-done-text">{n.text}</span>
                    <div className="qty-row">
                      <span className="card-sub">{formatDate(n.updated_at || n.created_at)}</span>
                      <button type="button" className="add-btn" onClick={() => toggleDone(n)}>
                        <Undo2 size={16} /> Zurück
                      </button>
                      <button type="button" className="remove-btn" onClick={() => remove(n.id)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  )
}
