import { useEffect, useState } from 'react'
import { ClipboardList, Save } from 'lucide-react'

// F52 (09.09.2026): woechentliche (mittwochs) manuelle Bestandszaehlung fuer
// den Kunden Widmann. Bewusst fest zugeschnitten, kein generisches Feature
// (Nutzer-Entscheidung 09.09.2026). Liste + Mindestbestand wird am PC
// gepflegt (Finance -> Widmann-Bestand), hier wird nur gezaehlt.
// #603 (19.11.2026): hebt die Entscheidung "kein Mengenvorschlag" auf. Je Gas
// "reserviert" erfassen; nachliefern = max(0, Mindestbestand - (gezaehlt - reserviert)),
// gleiche Rechnung wie src/utils/widmannNachliefern.js.

const zahl = (v) => Math.max(0, parseInt(v, 10) || 0)
const nachliefern = (min, gezaehlt, reserviert) => Math.max(0, zahl(min) - (zahl(gezaehlt) - zahl(reserviert)))

function Ergebnis({ zeilen }) {
  const offen = zeilen.filter((z) => z.nachliefern > 0)
  const summe = offen.reduce((s, z) => s + z.nachliefern, 0)
  return (
    <div className="card">
      <strong>Nachliefern: {summe} {summe === 1 ? 'Flasche' : 'Flaschen'}</strong>
      {offen.length === 0
        ? <span className="card-sub">Nichts nachzuliefern.</span>
        : <ul>{offen.map((z) => <li key={z.name}>{z.name}: {z.nachliefern}</li>)}</ul>}
    </div>
  )
}

export default function WidmannBestand() {
  const [items, setItems] = useState([])
  const [counts, setCounts] = useState({})
  const [reserved, setReserved] = useState({})
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(null)

  useEffect(() => {
    fetch('/api/finance/widmann-bestand/items', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setItems(d.items || []))
      .catch(() => setError('Artikelliste konnte nicht geladen werden.'))
      .finally(() => setLoading(false))
  }, [])

  const submit = async () => {
    const entries = items.map((it) => ({
      itemId: it.id,
      name: it.name,
      mindestbestand: it.mindestbestand,
      gezaehlt: zahl(counts[it.id]),
      reserviert: zahl(reserved[it.id]),
    }))
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/finance/widmann-bestand/checks', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries, note: note.trim() || null }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Speichern fehlgeschlagen.')
      } else {
        setSaved({ ...data, ergebnis_zeilen: entries.map((e) => ({ name: e.name, nachliefern: nachliefern(e.mindestbestand, e.gezaehlt, e.reserviert) })) })
      }
    } catch {
      setError('Server nicht erreichbar.')
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    setCounts({})
    setReserved({})
    setNote('')
    setSaved(null)
    setError(null)
  }

  if (loading) return <section><p className="hint">Lädt…</p></section>

  if (saved) {
    return (
      <section>
        <h2 className="section-title"><ClipboardList size={17} />Zählung gespeichert</h2>
        <Ergebnis zeilen={(saved.ergebnis_zeilen || [])} />
        <p className="hint">
          Die Liste steht jetzt am PC unter Finance → Widmann-Bestand bereit (als .md herunterladbar) zur Bestellung im Widmann-Portal.
        </p>
        <button type="button" className="link-btn" onClick={reset}>Neue Zählung erfassen</button>
      </section>
    )
  }

  return (
    <section>
      <h2 className="section-title"><ClipboardList size={17} />Widmann zählen</h2>
      {error && <p className="error">{error}</p>}
      {items.length > 0 && (
        <Ergebnis zeilen={items.map((it) => ({ name: it.name, nachliefern: nachliefern(it.mindestbestand, counts[it.id], reserved[it.id]) }))} />
      )}
      <ul className="card-list">
        {items.map((it) => (
          <li key={it.id} className="card">
            <span>{it.name}</span>
            <span className="card-sub">Mindestbestand: {it.mindestbestand}</span>
            <div className="qty-row">
              <label>Gezählt
                <input
                  type="number"
                  min="0"
                  className="qty-input"
                  value={counts[it.id] ?? 0}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setCounts((prev) => ({ ...prev, [it.id]: e.target.value }))}
                />
              </label>
              <label>Reserviert
                <input
                  type="number"
                  min="0"
                  className="qty-input"
                  value={reserved[it.id] ?? 0}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setReserved((prev) => ({ ...prev, [it.id]: e.target.value }))}
                />
              </label>
            </div>
            <span className="card-sub">Nachliefern: {nachliefern(it.mindestbestand, counts[it.id], reserved[it.id])}</span>
          </li>
        ))}
        {items.length === 0 && <li className="card"><span>Keine Artikel hinterlegt — bitte am PC anlegen (Finance → Widmann-Bestand).</span></li>}
      </ul>
      {items.length > 0 && (
        <>
          <label className="note-label">
            Hinweis (optional)
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Lieferengpass Propan" />
          </label>
          <button type="button" onClick={submit} disabled={saving} className="submit-order-btn">
            <Save size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            {saving ? 'Speichert…' : 'Speichern'}
          </button>
        </>
      )}
    </section>
  )
}
