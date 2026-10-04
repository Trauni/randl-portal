import { useEffect, useState } from 'react'
import {
  Gauge, Users, CalendarClock, PackageX, Package,
  Building2, ShoppingBag, Plane, AlertTriangle, UploadCloud, FileUp,
} from 'lucide-react'

// Verifiziert gegen echte Antworten (09.08.2026, Nutzer kparzinger):
// GET /api/dashboard                    -> { user, kacheln, meineAntraege }
// GET /api/dashboard/projekte/naechste  -> { projekte: [{ id, projektId, link, name,
//                                            nummer, ort, farbe, von, bis, statusId,
//                                            status, aktiv }] }
// GET /api/dashboard/bestellungen       -> { bestellungen: [{ id, kunde, kundennummer,
//                                            betrag, angelegt, serStatus, serFehler,
//                                            storniert }] }  -- 403 ohne Area "gashandel"

function formatDate(iso) {
  if (!iso) return '–'
  return new Date(iso).toLocaleDateString('de-DE')
}

const STATUS_LABEL = {
  pending: 'offen',
  approved: 'genehmigt',
  rejected: 'abgelehnt',
  cancelled: 'storniert',
}

export default function MiniDashboard({ hasArea }) {
  const [data, setData] = useState(null)
  const [projekte, setProjekte] = useState([])
  const [bestellungen, setBestellungen] = useState([])
  const [error, setError] = useState(null)

  const darfGashandel = typeof hasArea === 'function' && hasArea('gashandel')

  // Wichtige Notiz (11.08.2026): am Handy angelegte Kunden/Bestellungen loesen KEINEN
  // automatischen SER-/Lexware-Push aus -- das passiert bewusst separat am PC. Damit das
  // nicht vergessen wird, zeigt das Dashboard einen Hinweis + zwei Sammel-Buttons.
  //
  // Fuer die Bestellungen-Zahl wird bewusst NICHT neu gezaehlt, sondern dieselbe Zahl wie
  // die "Ohne SER-Übertragung"-Kachel verwendet (kacheln.bestellungenOhneSer aus
  // /api/dashboard). Die Kachel filtert laut F32-Doku (Seite 47) bereits cancelled,
  // ser_status='ok' und Kunden ohne in_ser_fvk raus -- ein eigener Zaehler ueber
  // GET /api/finance/orders?ser_filter=not_sent haette das NICHT getan (zeigte 24 statt 0,
  // weil stornierte/uralte Bestellungen mitgezaehlt wurden). Fuer den "SER übermitteln"-Knopf
  // wird deshalb beim Absenden clientseitig genau danach gefiltert (status != cancelled,
  // in_ser_fvk true), nicht einfach alles aus ser_filter=not_sent geschickt.
  const [pendingCustomers, setPendingCustomers] = useState(null)
  const [serBusy, setSerBusy] = useState(false)
  const [serMsg, setSerMsg] = useState(null)
  const [lexBusy, setLexBusy] = useState(false)
  const [lexMsg, setLexMsg] = useState(null)

  const loadPendingCustomers = () => {
    if (!darfGashandel) return
    fetch('/api/finance/customers?in_lexware=false&limit=1', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => d && setPendingCustomers(d.total ?? 0))
      .catch(() => {})
  }

  useEffect(() => { loadPendingCustomers() }, [darfGashandel])

  const submitSer = async () => {
    setSerBusy(true)
    setSerMsg(null)
    try {
      const listRes = await fetch('/api/finance/orders?ser_filter=not_sent&limit=500', { credentials: 'include' })
      const listData = await listRes.json()
      const eligible = (listData.orders || []).filter((o) => o.status !== 'cancelled' && o.in_ser_fvk)
      const ids = eligible.map((o) => o.id)
      if (ids.length === 0) { setSerMsg('Keine offenen Bestellungen.'); return }
      const res = await fetch('/api/finance/orders/mass-ser', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      const data = await res.json()
      if (!res.ok) { setSerMsg(data.error || 'Fehler beim Übermitteln.'); return }
      setSerMsg(`${ids.length} Bestellung(en) an SER übermittelt.`)
      loadDashboard()
    } catch {
      setSerMsg('Server nicht erreichbar.')
    } finally {
      setSerBusy(false)
    }
  }

  const pollLexwareJob = (jobId) => {
    fetch(`/api/finance/customers/bulk-push/${jobId}/status`, { credentials: 'include' })
      .then((res) => res.json())
      .then((d) => {
        if (d.status === 'running') {
          setLexMsg(`Läuft… ${d.processed ?? 0}/${d.total ?? '?'}`)
          setTimeout(() => pollLexwareJob(jobId), 1500)
        } else {
          setLexMsg(
            `Fertig: ${d.success ?? 0} übertragen, ${d.errors ?? 0} Fehler` +
            (d.skippedDuplicate ? `, ${d.skippedDuplicate} Duplikate übersprungen` : '') + '.'
          )
          setLexBusy(false)
          loadPendingCustomers()
        }
      })
      .catch(() => { setLexMsg('Status nicht abrufbar.'); setLexBusy(false) })
  }

  const submitLexware = async () => {
    setLexBusy(true)
    setLexMsg(null)
    try {
      const listRes = await fetch('/api/finance/customers?in_lexware=false&limit=200', { credentials: 'include' })
      const listData = await listRes.json()
      const ids = (listData.customers || []).map((c) => c.id)
      if (ids.length === 0) { setLexMsg('Keine offenen Kunden.'); setLexBusy(false); return }
      const res = await fetch('/api/finance/customers/bulk-push', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerIds: ids }),
      })
      const data = await res.json()
      if (!res.ok || !data.jobId) { setLexMsg(data.error || 'Fehler beim Start.'); setLexBusy(false); return }
      pollLexwareJob(data.jobId)
    } catch {
      setLexMsg('Server nicht erreichbar.')
      setLexBusy(false)
    }
  }

  const loadDashboard = () => {
    fetch('/api/dashboard', { credentials: 'include' })
      .then((res) => res.json())
      .then(setData)
      .catch(() => setError('Dashboard konnte nicht geladen werden.'))

    fetch('/api/dashboard/projekte/naechste?limit=5', { credentials: 'include' })
      .then((res) => res.json())
      .then((d) => setProjekte(d.projekte || []))
      .catch(() => {})

    if (darfGashandel) {
      fetch('/api/dashboard/bestellungen?limit=5', { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : { bestellungen: [] }))
        .then((d) => setBestellungen(d.bestellungen || []))
        .catch(() => {})
    }
  }

  useEffect(() => { loadDashboard() }, [darfGashandel])

  if (error) return <p className="error">{error}</p>
  if (!data) return <p>Lädt…</p>

  const k = data.kacheln || {}
  const antraege = data.meineAntraege || []

  return (
    <section>
      {darfGashandel && (
        <div className="sync-panel">
          {(k.bestellungenOhneSer > 0 || pendingCustomers > 0) && (
            <div className="notice-banner">
              <AlertTriangle size={16} />
              <span>
                Wichtige Notiz:
                {k.bestellungenOhneSer > 0 && <> {k.bestellungenOhneSer} Bestellung{k.bestellungenOhneSer === 1 ? '' : 'en'} ohne SER</>}
                {k.bestellungenOhneSer > 0 && pendingCustomers > 0 && ' ·'}
                {pendingCustomers > 0 && <> {pendingCustomers} Kunde{pendingCustomers === 1 ? '' : 'n'} nicht in Lexware</>}
                {' '}— bitte am PC nachziehen.
              </span>
            </div>
          )}
          <div className="sync-buttons">
            <button type="button" className="sync-btn" onClick={submitSer} disabled={serBusy}>
              <UploadCloud size={16} /> {serBusy ? 'Läuft…' : 'SER übermitteln'}
            </button>
            <button type="button" className="sync-btn" onClick={submitLexware} disabled={lexBusy}>
              <FileUp size={16} /> {lexBusy ? 'Läuft…' : 'Lexware übermitteln'}
            </button>
          </div>
          {serMsg && <p className="hint">{serMsg}</p>}
          {lexMsg && <p className="hint">{lexMsg}</p>}
        </div>
      )}

      <h2 className="section-title"><Gauge size={17} />Kennzahlen</h2>
      <div className="metric-grid">
        <div className="metric-card">
          <Users size={18} />
          <span className="metric-value">{k.mitarbeiter ?? '–'}</span>
          <span className="metric-label">Mitarbeiter (aktiv)</span>
        </div>
        <div className="metric-card">
          <CalendarClock size={18} />
          <span className="metric-value">{k.offeneAntraege ?? '–'}</span>
          <span className="metric-label">Offene Urlaubsanträge</span>
        </div>
        <div className="metric-card">
          <PackageX size={18} />
          <span className="metric-value">{k.bestellungenOhneSer ?? '–'}</span>
          <span className="metric-label">Ohne SER-Übertragung</span>
        </div>
        <div className="metric-card">
          <Package size={18} />
          <span className="metric-value">{k.bestellungenOffen ?? '–'}</span>
          <span className="metric-label">Offene Bestellungen</span>
        </div>
      </div>

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
        </>
      )}

      <h2 className="section-title"><Plane size={17} />Meine letzten Anträge</h2>
      <ul className="card-list">
        {antraege.slice(0, 5).map((a) => (
          <li key={a.id} className="card">
            <span>{formatDate(a.start_date)} – {formatDate(a.end_date)} ({a.days_count} Tage)</span>
            <span className="card-sub">{STATUS_LABEL[a.status] || a.status}</span>
          </li>
        ))}
        {antraege.length === 0 && <li className="card-empty">Keine Anträge.</li>}
      </ul>
    </section>
  )
}
