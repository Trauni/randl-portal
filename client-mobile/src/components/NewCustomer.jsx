import { useState } from 'react'

const EMPTY = {
  company_name: '', first_name: '', last_name: '',
  billing_street: '', billing_zip: '', billing_city: '', billing_country: 'DE',
  phone: '', email: '', invoice_email: '',
}

// Verifiziert gegen den echten Handler (09.08.2026):
// POST /api/finance/customers/create  (Kommentar im Code: "F11: Neuer Kunde anlegen,
// direkt in gas-db"). Pflicht: (company_name) ODER (first_name + last_name), dazu
// billing_street/zip/city. Antwort 201: { success, id, name, customer_number }.
// Kein automatischer SER-Push -- bewusst getrennter Endpoint /:id/push-ser, bleibt
// vorerst eine Desktop-Aktion (Finance -> Kunden), analog zu Bestellungen.
export default function NewCustomer() {
  const [form, setForm] = useState(EMPTY)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/finance/customers/create', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Anlegen fehlgeschlagen.')
      } else {
        setResult(data)
      }
    } catch {
      setError('Server nicht erreichbar.')
    } finally {
      setSubmitting(false)
    }
  }

  if (result) {
    return (
      <section>
        <h2 className="section-title">Kunde angelegt</h2>
        <ul className="card-list">
          <li className="card">
            <span>{result.name}</span>
            <span className="card-sub">Kundennummer {result.customer_number}</span>
          </li>
        </ul>
        <p className="hint">
          Noch nicht an SER/Lexware übertragen — das bleibt vorerst eine Desktop-Aktion
          (Finance → Kunden).
        </p>
        <button
          type="button"
          className="link-btn"
          onClick={() => { setResult(null); setForm(EMPTY) }}
        >
          Weiteren Kunden anlegen
        </button>
      </section>
    )
  }

  return (
    <section>
      <h2 className="section-title">Neue Kunden anlegen</h2>
      <form onSubmit={submit} className="vacation-form">
        <label>
          Firma
          <input value={form.company_name} onChange={set('company_name')} placeholder="z. B. Muster GmbH" />
        </label>
        <p className="hint">— oder, falls keine Firma —</p>
        <label>
          Vorname
          <input value={form.first_name} onChange={set('first_name')} />
        </label>
        <label>
          Nachname
          <input value={form.last_name} onChange={set('last_name')} />
        </label>
        <label>
          Straße *
          <input required value={form.billing_street} onChange={set('billing_street')} />
        </label>
        <label>
          PLZ *
          <input required value={form.billing_zip} onChange={set('billing_zip')} />
        </label>
        <label>
          Ort *
          <input required value={form.billing_city} onChange={set('billing_city')} />
        </label>
        <label>
          Telefon
          <input type="tel" value={form.phone} onChange={set('phone')} />
        </label>
        <label>
          E-Mail
          <input type="email" value={form.email} onChange={set('email')} />
        </label>
        <label>
          E-Mail für Rechnungen (optional)
          <input type="email" value={form.invoice_email} onChange={set('invoice_email')} placeholder="rechnung@firma.de" />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Wird angelegt…' : 'Kunde anlegen'}
        </button>
      </form>
    </section>
  )
}
