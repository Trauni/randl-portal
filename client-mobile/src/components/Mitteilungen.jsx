import { useCallback, useEffect, useState } from 'react'
import { BellRing, BellOff } from 'lucide-react'
import { aktuelleAnmeldung, pushEinschalten, pushAusschalten, pushUnterstuetzt } from '../utils/push.js'

const zeit = (iso) => {
  const d = new Date(iso)
  const heute = new Date().toDateString() === d.toDateString()
  return heute
    ? d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

const ZIEL = { urlaub_antrag: 'freigaben', urlaub_entscheidung: 'urlaub' }

function Einstellungen() {
  const [daten, setDaten] = useState(null)
  const [geraet, setGeraet] = useState(false)
  const [fehler, setFehler] = useState('')

  const lade = useCallback(() => {
    fetch('/api/mitteilungen/einstellungen', { credentials: 'include' }).then((r) => r.json()).then(setDaten).catch(() => setFehler('Einstellungen nicht ladbar'))
    aktuelleAnmeldung().then((s) => setGeraet(!!s)).catch(() => {})
  }, [])
  useEffect(lade, [lade])

  const setze = async (art, feld, wert) => {
    setDaten((d) => ({ ...d, arten: d.arten.map((a) => (a.art === art ? { ...a, [feld]: wert } : a)) }))
    await fetch(`/api/mitteilungen/einstellungen/${art}`, {
      method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [feld]: wert }),
    }).catch(() => setFehler('Speichern fehlgeschlagen'))
  }

  const [testMsg, setTestMsg] = useState('')
  const testen = async () => {
    setTestMsg('')
    const r = await fetch('/api/mitteilungen/push/test', { method: 'POST', credentials: 'include' })
    const d = await r.json().catch(() => ({}))
    setTestMsg(!r.ok ? (d.error || 'Fehlgeschlagen') : d.gesendet ? `Gesendet an ${d.gesendet} Gerät(e)` : 'Kein Gerät angemeldet')
  }

  const umschalten = async () => {
    setFehler('')
    try { if (geraet) await pushAusschalten(); else await pushEinschalten(); setGeraet(!geraet) } catch (e) { setFehler(e.message) }
  }

  if (!daten) return <p className="hint">Lädt…</p>
  return (
    <>
      <div className="card">
        <div className="section-title">Dieses Gerät</div>
        {!pushUnterstuetzt() && <p className="hint">Push geht hier nicht. Auf dem iPhone die Seite zuerst zum Home-Bildschirm hinzufügen.</p>}
        {pushUnterstuetzt() && !daten.pushVerfuegbar && <p className="hint">Push ist auf dem Server noch nicht eingerichtet. Mitteilungen erscheinen trotzdem hier.</p>}
        {pushUnterstuetzt() && daten.pushVerfuegbar && (
          <button type="button" className={geraet ? 'btn-secondary' : 'btn-primary'} onClick={umschalten}>
            {geraet ? <><BellOff size={16} /> Push auf diesem Gerät ausschalten</> : <><BellRing size={16} /> Push auf diesem Gerät einschalten</>}
          </button>
        )}
        {geraet && <button type="button" className="link-btn" onClick={testen}>Testnachricht senden</button>}
        {testMsg && <p className="hint">{testMsg}</p>}
        {fehler && <p className="error-text">{fehler}</p>}
      </div>
      <div className="card">
        <div className="section-title">Welche Mitteilungen</div>
        {daten.arten.map((a) => (
          <div key={a.art} className="mit-zeile">
            <div className="mit-zeile-titel">{a.label}</div>
            <label className="schalter"><span>Im Portal</span><input type="checkbox" role="switch" checked={a.inbox} onChange={(e) => setze(a.art, 'inbox', e.target.checked)} /></label>
            <label className="schalter"><span>Push</span><input type="checkbox" role="switch" checked={a.push} onChange={(e) => setze(a.art, 'push', e.target.checked)} /></label>
          </div>
        ))}
      </div>
    </>
  )
}

export default function Mitteilungen({ onNavigate, onGelesen }) {
  const [tab, setTab] = useState('inbox')
  const [liste, setListe] = useState(null)

  const lade = useCallback(() => {
    fetch('/api/mitteilungen?limit=100', { credentials: 'include' }).then((r) => r.json()).then((d) => setListe(d.mitteilungen)).catch(() => setListe([]))
  }, [])
  useEffect(lade, [lade])
  // Liste aktuell halten: alle 30 s und sobald die App wieder in den Vordergrund kommt
  useEffect(() => {
    const t = setInterval(() => { lade(); onGelesen?.() }, 30000)
    const sicht = () => { if (document.visibilityState === 'visible') { lade(); onGelesen?.() } }
    document.addEventListener('visibilitychange', sicht)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', sicht) }
  }, [lade, onGelesen])

  const alleGelesen = async () => {
    await fetch('/api/mitteilungen/gelesen', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    lade(); onGelesen?.()
  }
  const oeffne = async (m) => {
    if (!m.gelesen_am) {
      await fetch('/api/mitteilungen/gelesen', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [m.id] }) })
      onGelesen?.()
    }
    const ziel = ZIEL[m.art]
    if (ziel) onNavigate?.(ziel); else lade()
  }

  return (
    <>
      <div className="mit-tabs">
        <button type="button" className={tab === 'inbox' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('inbox')}>Mitteilungen</button>
        <button type="button" className={tab === 'einst' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('einst')}>Einstellungen</button>
      </div>
      {tab === 'einst' ? <Einstellungen /> : (
        <>
          {liste === null && <p className="hint">Lädt…</p>}
          {liste && liste.length === 0 && <div className="card card-empty">Keine Mitteilungen</div>}
          {liste && liste.some((m) => !m.gelesen_am) && <button type="button" className="link-btn" onClick={alleGelesen}>Alle als gelesen markieren</button>}
          <div className="card-list">
            {(liste || []).map((m) => (
              <button type="button" key={m.id} className={`card card-clickable mit-eintrag${m.gelesen_am ? '' : ' mit-neu'}`} onClick={() => oeffne(m)}>
                <div className="mit-kopf"><strong>{m.titel}</strong><span className="card-sub">{zeit(m.erstellt_am)}</span></div>
                {m.text && <div className="card-sub">{m.text}</div>}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  )
}
