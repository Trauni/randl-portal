import { useEffect, useState } from 'react'
import { CalendarDays } from 'lucide-react'

const RHYTHMUS_LABELS = { woechentlich: 'Wöchentlich', woche_1: '1. Woche (gerade KW)', woche_2: '2. Woche (ungerade KW)', alle_3: 'Alle 3 Wochen', alle_4: 'Alle 4 Wochen' }
const RHYTHMUS_KEYS = ['woechentlich', 'woche_1', 'woche_2', 'alle_3', 'alle_4']

// F50 (09.09.2026): reine Lese-Ansicht der Desktop-Lieferrhythmus-Planung
// (F49, Seite 47). Kein neues Backend -- nutzt denselben Endpoint wie
// Desktop (GET /api/finance/delivery-rhythm), keine Schreibaktionen. Die
// drei Rubriken werden hier -- anders als am Desktop mit 3 Spalten --
// untereinander gestapelt (Mobile-Layout). Bewusst keine Preise (gleiche
// Konvention wie beim Rest der Mobile-App).

function customerLabel(e) {
  return e.company_name || e.name || 'Unbenannt'
}

export default function DeliveryRhythm() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/finance/delivery-rhythm', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error)
        setEntries(d.entries || [])
      })
      .catch(() => setError('Lieferrhythmus konnte nicht geladen werden.'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <section><p className="hint">Lädt…</p></section>

  return (
    <section>
      <h2 className="section-title"><CalendarDays size={17} />Lieferrhythmus</h2>
      {error && <p className="error">{error}</p>}
      {RHYTHMUS_KEYS.map((key) => {
        const group = entries.filter((e) => e.rhythmus === key)
        return (
          <div key={key}>
            <h3 style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--text2, #666)', margin: '1rem 0 .4rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>
              {RHYTHMUS_LABELS[key]} ({group.length})
            </h3>
            <ul className="card-list">
              {group.map((e) => {
                const items = Array.isArray(e.items) ? e.items : (typeof e.items === 'string' ? JSON.parse(e.items || '[]') : [])
                const isAussetzend = e.aussetzen_von && e.aussetzen_bis
                return (
                  <li key={e.customer_id} className="card">
                    <span>{customerLabel(e)}</span>
                    <span className="card-sub">{e.customer_number} · {e.billing_zip} {e.billing_city}</span>
                    {isAussetzend && (
                      <span className="card-sub" style={{ color: '#E8A020' }}>
                        ⏸ Aussetzend: {e.aussetzen_von?.slice(0, 10)} – {e.aussetzen_bis?.slice(0, 10)}{e.notiz ? ` · ${e.notiz}` : ''}
                      </span>
                    )}
                    {items.length > 0 && (
                      <span className="card-sub">
                        {items.map((i) => `${i.quantity}× ${i.productName}`).join(', ')}
                      </span>
                    )}
                  </li>
                )
              })}
              {group.length === 0 && <li className="card"><span>Keine Kunden.</span></li>}
            </ul>
          </div>
        )
      })}
    </section>
  )
}
