import { useEffect, useState } from 'react'
import Stempeluhr from './Stempeluhr.jsx'
import DashboardHinweise from './DashboardHinweise.jsx'
import Schnellaktionen from './Schnellaktionen.jsx'
import Abwesend from './Abwesend.jsx'
import SerLexwarePanel from './SerLexwarePanel.jsx'
import { Gauge, Users, CalendarClock, PackageX, Package, Building2, ShoppingBag, Plane } from 'lucide-react'

// Verifiziert gegen echte Antworten (09.08.2026, Nutzer kparzinger):
// GET /api/dashboard                    -> { user, kacheln, meineAntraege, persoenlich }
// GET /api/dashboard/projekte/naechste  -> { projekte: [{ id, link, name, von, bis, status }] }
// GET /api/dashboard/bestellungen       -> { bestellungen: [{ id, kunde, angelegt, serStatus, storniert }] }  -- 403 ohne "gashandel"
//
// Aufbau von oben nach unten: Stoppuhr, Aufmerksamkeit (ungelesen, offene Freigaben),
// Schnellaktionen, Abwesenheiten, Gashandel, Zelte, eigene Anträge, Kennzahlen (eingeklappt).

const formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString('de-DE') : '–')

const STATUS_LABEL = { pending: 'offen', approved: 'genehmigt', rejected: 'abgelehnt', cancelled: 'storniert' }

export default function MiniDashboard({ hasArea, onNavigate, ungelesen = 0 }) {
  const [data, setData] = useState(null)
  const [projekte, setProjekte] = useState([])
  const [bestellungen, setBestellungen] = useState([])
  const [error, setError] = useState(null)

  const darfGashandel = typeof hasArea === 'function' && hasArea('gashandel')
  // Zeltprojekte nur mit eigenem Bereich (wie die Seite Zeltprojekte am PC)
  const darfZelte = typeof hasArea === 'function' && hasArea('zeltverleih.projekte')

  const loadDashboard = () => {
    fetch('/api/dashboard', { credentials: 'include' })
      .then((res) => res.json())
      .then(setData)
      .catch(() => setError('Dashboard konnte nicht geladen werden.'))
    if (darfZelte) {
      fetch('/api/dashboard/projekte/naechste?limit=5', { credentials: 'include' })
        .then((res) => res.json()).then((d) => setProjekte(d.projekte || [])).catch(() => {})
    }
    if (darfGashandel) {
      fetch('/api/dashboard/bestellungen?limit=5', { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : { bestellungen: [] }))
        .then((d) => setBestellungen(d.bestellungen || [])).catch(() => {})
    }
  }
  useEffect(loadDashboard, [darfGashandel, darfZelte])

  if (error) return <p className="error">{error}</p>
  if (!data) return <p>Lädt…</p>

  const k = data.kacheln || {}
  const antraege = data.meineAntraege || []
  // Kennzahlen nur, wenn der Server sie für diese Person liefert (Bereich vorhanden)
  const kennzahlen = [
    [k.mitarbeiter, Users, 'Mitarbeiter (aktiv)'],
    [k.offeneAntraege, CalendarClock, 'Offene Urlaubsanträge'],
    [k.bestellungenOhneSer, PackageX, 'Ohne SER-Übertragung'],
    [k.bestellungenOffen, Package, 'Offene Bestellungen'],
  ].filter(([wert]) => wert !== undefined)

  return (
    <section>
      {data.persoenlich?.zeitQuelle === 'portal' && <Stempeluhr />}

      <DashboardHinweise hasArea={hasArea} ungelesen={ungelesen} onNavigate={onNavigate} />
      <Schnellaktionen hasArea={hasArea} onNavigate={onNavigate} />
      <Abwesend />

      {darfGashandel && (
        <>
          <h2 className="section-title"><ShoppingBag size={17} />Letzte Bestellungen</h2>
          <ul className="card-list">
            {bestellungen.slice(0, 5).map((o) => (
              <li key={o.id} className="card">
                <span>{o.kunde}{o.storniert ? ' (storniert)' : ''}</span>
                <span className="card-sub">{formatDate(o.angelegt)} · SER: {o.serStatus || 'offen'}</span>
              </li>
            ))}
            {bestellungen.length === 0 && <li className="card-empty">Keine aktuellen Bestellungen.</li>}
          </ul>
          <SerLexwarePanel ohneSer={k.bestellungenOhneSer} onSerFertig={loadDashboard} />
        </>
      )}

      {darfZelte && (
        <>
          <h2 className="section-title"><Building2 size={17} />Nächste Projekte</h2>
          <ul className="card-list">
            {projekte.slice(0, 5).map((p) => (
              <li key={p.id} className="card">
                <a href={p.link} target="_blank" rel="noreferrer">{p.name}</a>
                <span className="card-sub">{formatDate(p.von)} – {formatDate(p.bis)} · {p.status}</span>
              </li>
            ))}
            {projekte.length === 0 && <li className="card-empty">Keine anstehenden Projekte.</li>}
          </ul>
        </>
      )}

      <h2 className="section-title"><Plane size={17} />Meine letzten Anträge</h2>
      <ul className="card-list">
        {antraege.slice(0, 3).map((a) => (
          <li key={a.id} className="card">
            <span>{formatDate(a.start_date)} – {formatDate(a.end_date)} ({a.days_count} Tage)</span>
            <span className="card-sub">{STATUS_LABEL[a.status] || a.status}</span>
          </li>
        ))}
        {antraege.length === 0 && <li className="card-empty">Keine Anträge.</li>}
      </ul>

      {kennzahlen.length > 0 && (
        <details className="dash-details">
          <summary><Gauge size={16} /> Kennzahlen</summary>
          <div className="metric-grid">
            {kennzahlen.map(([wert, Icon, label]) => (
              <div key={label} className="metric-card">
                <Icon size={18} />
                <span className="metric-value">{wert ?? '–'}</span>
                <span className="metric-label">{label}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  )
}
