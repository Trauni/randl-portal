import { useEffect, useState } from 'react'

// Felder, die das Portal führt (#498): Rentman überschreibt sie nicht mehr.
// E-Mail geht beim Speichern auch nach Authentik (macht der Server).
const FELDER = [
  ['display_name', 'Anzeigename', 'text'],
  ['email', 'E-Mail', 'email'],
  ['phone', 'Telefon (Büro)', 'tel'],
  ['phone_mobile', 'Mobiltelefon', 'tel'],
  ['address_street', 'Straße & Hausnummer', 'text'],
  ['address_zip', 'PLZ', 'text'],
  ['address_city', 'Ort', 'text'],
  ['address_country', 'Land', 'text'],
]

export default function Profile() {
  const [profile, setProfile] = useState(null)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [meldung, setMeldung] = useState(null)

  useEffect(() => {
    fetch('/api/profile', { credentials: 'include' })
      .then((res) => res.json())
      .then((p) => { setProfile(p); setForm(Object.fromEntries(FELDER.map(([k]) => [k, p[k] || '']))) })
  }, [])

  if (!profile) return <p>Lädt…</p>

  const speichern = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMeldung(null)
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setMeldung({ fehler: d.error || 'Speichern fehlgeschlagen' }); return }
      setProfile(d)
      setMeldung({ ok: 'Gespeichert' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section>
      <h2>Profil</h2>
      <dl className="profile-list">
        <dt>Name</dt><dd>{profile.fullName || profile.full_name}</dd>
        <dt>Abteilung</dt><dd>{profile.department || '–'}</dd>
      </dl>
      <form className="vacation-form" onSubmit={speichern}>
        {FELDER.map(([key, label, typ]) => (
          <label key={key} className="note-label">
            {label}
            <input
              type={typ}
              value={form[key] ?? ''}
              onChange={(ev) => setForm({ ...form, [key]: ev.target.value })}
            />
          </label>
        ))}
        {meldung?.fehler && <p className="hint" style={{ color: 'var(--randl-red)' }}>{meldung.fehler}</p>}
        {meldung?.ok && <p className="hint">{meldung.ok}</p>}
        <button type="submit" disabled={saving}>{saving ? 'Speichere…' : 'Speichern'}</button>
      </form>
      <p className="hint">v{__APP_VERSION__} · {__APP_COMMIT__}</p>
    </section>
  )
}
