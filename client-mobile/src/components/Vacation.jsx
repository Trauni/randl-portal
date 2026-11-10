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
  const LEER = { art: 'urlaub', start_date: '', end_date: '', zeit_von: '', zeit_bis: '' }
  const [form, setForm] = useState(LEER)
  const [fehler, setFehler] = useState('')
  // Stundenweiser Gleitzeitabbau (#490): nur ein Tag, Bis = Von
  const stundenweise = form.art === 'gleitzeitabbau' && (form.zeit_von || form.zeit_bis)
  // Gleitzeitabbau (#490) nur anbieten, wenn ein Gleitzeitkonto aktiv ist
  const [konto, setKonto] = useState(null)
  useEffect(() => {
    fetch('/api/vacation/gleitzeit', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((k) => setKonto(k && k.aktiv ? k : null))
      .catch(() => {})
  }, [])
  const [submitting, setSubmitting] = useState(false)
  const [saldo, setSaldo] = useState(null)
  const ladeSaldo = () => {
    fetch('/api/vacation/saldo', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then(setSaldo)
      .catch(() => {})
  }
  useEffect(ladeSaldo, [])

  const load = () => {
    fetch('/api/vacation', { credentials: 'include' })
      .then((res) => res.json())
      .then(setRequests)
  }

  useEffect(load, [])

  const submit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setFehler('')
    const { zeit_von, zeit_bis, ...rest } = form
    const body = stundenweise ? { ...rest, end_date: rest.start_date, zeit_von, zeit_bis } : rest
    const res = await fetch('/api/vacation', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSubmitting(false)
    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      setFehler(e.error || 'Antrag fehlgeschlagen')
      return
    }
    setForm(LEER)
    load()
    ladeSaldo()
  }

  const cancel = async (id) => {
    await fetch(`/api/vacation/${id}/cancel`, { method: 'PATCH', credentials: 'include' })
    load()
    ladeSaldo()
  }

  return (
    <section>
      <h2>Mein Urlaub</h2>
      {saldo && (
        <div className="card" style={{ marginBottom: 12 }}>
          <strong style={{ fontSize: 22, color: saldo.rest < 0 ? 'var(--red, #e05050)' : undefined }}>{String(saldo.rest).replace('.', ',')}</strong>{' '}
          Resturlaubstage {saldo.jahr}
          <span className="card-sub" style={{ display: 'block' }}>
            Anspruch {String(saldo.anspruch).replace('.', ',')} · genehmigt {String(saldo.genehmigt).replace('.', ',')}
            {saldo.beantragt > 0 && <> · beantragt {String(saldo.beantragt).replace('.', ',')}</>}
          </span>
        </div>
      )}
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
        {!stundenweise && (
          <label>
            Bis
            <input
              type="date"
              required
              value={form.end_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
            />
          </label>
        )}
        {form.art === 'gleitzeitabbau' && (
          <>
            <label>
              Frei ab (optional, nur ein Tag)
              <input type="time" step="300" value={form.zeit_von}
                onChange={(e) => setForm({ ...form, zeit_von: e.target.value })} />
            </label>
            <label>
              Frei bis
              <input type="time" step="300" value={form.zeit_bis} required={Boolean(form.zeit_von)}
                onChange={(e) => setForm({ ...form, zeit_bis: e.target.value })} />
            </label>
          </>
        )}
        {fehler && <p className="card-sub" style={{ color: 'var(--red, #e05050)' }}>{fehler}</p>}
        <button type="submit" disabled={submitting}>Antrag stellen</button>
      </form>

      <ul className="card-list">
        {requests.map((r) => (
          <li key={r.id} className="card">
            <span>
              {r.art === 'gleitzeitabbau' ? 'Gleitzeitabbau: ' : ''}
              {r.abbau_von ? `${r.start_date} ${String(r.abbau_von).slice(0, 5)}–${String(r.abbau_bis).slice(0, 5)} Uhr` : `${r.start_date} – ${r.end_date}`}
            </span>
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
