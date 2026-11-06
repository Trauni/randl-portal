import { useEffect, useState } from 'react'

// 1:1-Wiederverwendung von /api/vacation (Seite 31/188). Genehmigung bleibt
// laut Konzept vorerst Desktop/Geschaeftsfuehrung vorbehalten -- hier nur
// Antrag stellen, eigene Liste sehen, stornieren.
const fmtMin = (m) => {
  const v = m > 0 ? '+' : m < 0 ? '−' : ''
  const a = Math.abs(Math.round(m))
  return `${v}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`
}

export default function Vacation() {
  const [requests, setRequests] = useState([])
  const [form, setForm] = useState({ art: 'urlaub', start_date: '', end_date: '' })
  // Gleitzeitabbau (#490) nur anbieten, wenn ein Gleitzeitkonto aktiv ist
  const [konto, setKonto] = useState(null)
  useEffect(() => {
    fetch('/api/vacation/gleitzeit', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((k) => setKonto(k && k.aktiv ? k : null))
      .catch(() => {})
  }, [])
  const [submitting, setSubmitting] = useState(false)

  const load = () => {
    fetch('/api/vacation', { credentials: 'include' })
      .then((res) => res.json())
      .then(setRequests)
  }

  useEffect(load, [])

  const submit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    await fetch('/api/vacation', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSubmitting(false)
    setForm({ art: 'urlaub', start_date: '', end_date: '' })
    load()
  }

  const cancel = async (id) => {
    await fetch(`/api/vacation/${id}/cancel`, { method: 'PATCH', credentials: 'include' })
    load()
  }

  return (
    <section>
      <h2>Mein Urlaub</h2>
      <form onSubmit={submit} className="vacation-form">
        {konto && (
          <label>
            Art
            <select value={form.art} onChange={(e) => setForm({ ...form, art: e.target.value })}>
              <option value="urlaub">Urlaub</option>
              <option value="gleitzeitabbau">Gleitzeitabbau (Konto {fmtMin(konto.minuten)} h)</option>
            </select>
          </label>
        )}
        <label>
          Von
          <input
            type="date"
            required
            value={form.start_date}
            onChange={(e) => setForm({ ...form, start_date: e.target.value })}
          />
        </label>
        <label>
          Bis
          <input
            type="date"
            required
            value={form.end_date}
            onChange={(e) => setForm({ ...form, end_date: e.target.value })}
          />
        </label>
        <button type="submit" disabled={submitting}>Antrag stellen</button>
      </form>

      <ul className="card-list">
        {requests.map((r) => (
          <li key={r.id} className="card">
            <span>{r.art === 'gleitzeitabbau' ? 'Gleitzeitabbau: ' : ''}{r.start_date} – {r.end_date}</span>
            <span className="card-sub">{r.status}</span>
            {r.status === 'pending' && (
              <button type="button" className="link-btn" onClick={() => cancel(r.id)}>Stornieren</button>
            )}
          </li>
        ))}
        {requests.length === 0 && <li className="card-empty">Keine Anträge.</li>}
      </ul>
    </section>
  )
}
