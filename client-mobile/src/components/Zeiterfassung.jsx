import { useEffect, useState } from 'react'

// Live-Timer (Start/Pause/Stopp) + Uebersicht "Heute". Manuelle Tageserfassung
// und die Fremderfassung-Ansicht fuer Backoffice/GF folgen separat (F40, Seite 47).
const pad = (n) => String(n).padStart(2, '0')

function formatDauer(sekunden) {
  const s = Math.max(0, Math.floor(sekunden))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${pad(h)}:${pad(m)}:${pad(sec)}`
}

// Gleitzeitkonto (#490): Minuten als +12:30 / −3:05
function formatMinuten(m) {
  const v = m > 0 ? '+' : m < 0 ? '−' : ''
  const a = Math.abs(Math.round(m))
  return `${v}${Math.floor(a / 60)}:${pad(a % 60)}`
}

export default function Zeiterfassung() {
  const [laufend, setLaufend] = useState(null)
  const [jetzt, setJetzt] = useState(Date.now())
  const [heute, setHeute] = useState([])
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState('')
  const [konto, setKonto] = useState(null)

  // Nur Kontostand, Verlauf gibt es am Desktop. Ohne aktives Konto keine Zeile.
  useEffect(() => {
    const d = new Date()
    fetch(`/api/zeit/gleitzeit?jahr=${d.getFullYear()}&monat=${d.getMonth() + 1}&gruppe=monat`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((k) => setKonto(k && k.aktiv ? k : null))
      .catch(() => setKonto(null))
  }, [])

  const ladeLaufend = () => {
    fetch('/api/zeit/laufend', { credentials: 'include' })
      .then((res) => res.json())
      .then(setLaufend)
      .catch(() => setLaufend(null))
  }

  const ladeHeute = () => {
    const heuteDatum = new Date()
    const heuteStr = heuteDatum.toISOString().slice(0, 10)
    fetch(`/api/zeit?jahr=${heuteDatum.getFullYear()}&monat=${heuteDatum.getMonth() + 1}`, { credentials: 'include' })
      .then((res) => res.json())
      .then((daten) => {
        setHeute((daten.eintraege || []).filter((e) => (e.start || '').startsWith(heuteStr)))
      })
      .catch(() => setHeute([]))
  }

  useEffect(() => { ladeLaufend(); ladeHeute() }, [])

  useEffect(() => {
    if (!laufend) return
    const id = setInterval(() => setJetzt(Date.now()), 1000)
    return () => clearInterval(id)
  }, [laufend])

  const aufruf = async (pfad) => {
    setBusy(true)
    setFehler('')
    try {
      const res = await fetch(pfad, { method: 'POST', credentials: 'include' })
      const daten = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(daten.error || 'Fehler bei der Zeiterfassung')
      ladeLaufend()
      ladeHeute()
    } catch (err) {
      setFehler(err.message)
    } finally {
      setBusy(false)
    }
  }

  const [manuellOffen, setManuellOffen] = useState(false)
  const [manuellForm, setManuellForm] = useState({ tag: '', start: '', ende: '', pauseMinuten: '' })
  // Profil: "Automatisch 30 Minuten Pause buchen" -> Pausenfeld vorbefüllt
  const [autoPause, setAutoPause] = useState(false)
  useEffect(() => {
    fetch('/api/profile', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((pf) => {
        if (!pf || !Number(pf.auto_pause_30)) return
        setAutoPause(true)
        setManuellForm((f) => (f.pauseMinuten === '' ? { ...f, pauseMinuten: '30' } : f))
      })
      .catch(() => {})
  }, [])
  const [manuellBusy, setManuellBusy] = useState(false)
  const [manuellFehler, setManuellFehler] = useState('')
  const [manuellErfolg, setManuellErfolg] = useState('')

  const manuellSenden = async (e) => {
    e.preventDefault()
    setManuellBusy(true)
    setManuellFehler('')
    setManuellErfolg('')
    try {
      const start = `${manuellForm.tag}T${manuellForm.start}:00`
      const ende = `${manuellForm.tag}T${manuellForm.ende}:00`
      const res = await fetch('/api/zeit/manuell', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tag: manuellForm.tag, start, ende,
          pauseMinuten: Number(manuellForm.pauseMinuten || 0),
        }),
      })
      const daten = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(daten.error || 'Fehler beim Speichern')
      setManuellErfolg('Eintrag gespeichert.')
      setManuellForm({ tag: '', start: '', ende: '', pauseMinuten: autoPause ? '30' : '' })
      ladeHeute()
      ladeLaufend()
    } catch (err) {
      setManuellFehler(err.message)
    } finally {
      setManuellBusy(false)
    }
  }

  const seitStartSek = laufend ? (jetzt - new Date(laufend.start).getTime()) / 1000 : 0
  const seitPauseSek = laufend?.pause_start ? (jetzt - new Date(laufend.pause_start).getTime()) / 1000 : 0

  return (
    <section>
      <h2>Zeiterfassung</h2>
      {fehler && <p className="error-text">{fehler}</p>}
      {konto && (
        <p className="card-sub" style={{ margin: '0 0 12px' }}>
          Gleitzeitkonto: <strong style={{ color: konto.minuten < 0 ? 'var(--red, #e05050)' : 'var(--green, #2ebd7a)' }}>{formatMinuten(konto.minuten)} h</strong>
          {konto.gebuchtBis && <> · Stand {new Date(konto.gebuchtBis + 'T00:00').toLocaleDateString('de-DE')}</>}
        </p>
      )}

      <div className="timer-card">
        {!laufend && (
          <>
            <p className="timer-display">00:00:00</p>
            <button type="button" className="btn-primary" disabled={busy} onClick={() => aufruf('/api/zeit/start')}>
              Start
            </button>
          </>
        )}
        {laufend?.status === 'laufend' && (
          <>
            <p className="timer-display">{formatDauer(seitStartSek)}</p>
            <div className="timer-buttons">
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => aufruf(`/api/zeit/${laufend.id}/pause`)}>
                Pause
              </button>
              <button type="button" className="btn-primary" disabled={busy} onClick={() => aufruf(`/api/zeit/${laufend.id}/stop`)}>
                Stopp
              </button>
            </div>
          </>
        )}
        {laufend?.status === 'pausiert' && (
          <>
            <p className="timer-display timer-paused">Pause seit {formatDauer(seitPauseSek)}</p>
            <div className="timer-buttons">
              <button type="button" className="btn-primary" disabled={busy} onClick={() => aufruf(`/api/zeit/${laufend.id}/fortsetzen`)}>
                Weiter
              </button>
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => aufruf(`/api/zeit/${laufend.id}/stop`)}>
                Stopp
              </button>
            </div>
          </>
        )}
      </div>

      <button type="button" className="link-btn" onClick={() => setManuellOffen((v) => !v)}>
        {manuellOffen ? 'Manuelle Erfassung schließen' : 'Zeit manuell nachtragen'}
      </button>

      {manuellOffen && (
        <form onSubmit={manuellSenden} className="vacation-form">
          {manuellFehler && <p className="error-text">{manuellFehler}</p>}
          {manuellErfolg && <p className="hint">{manuellErfolg}</p>}
          <label>
            Tag
            <input
              type="date"
              required
              max={new Date().toISOString().slice(0, 10)}
              value={manuellForm.tag}
              onChange={(e) => setManuellForm({ ...manuellForm, tag: e.target.value })}
            />
          </label>
          <label>
            Start
            <input
              type="time"
              required
              value={manuellForm.start}
              onChange={(e) => setManuellForm({ ...manuellForm, start: e.target.value })}
            />
          </label>
          <label>
            Ende
            <input
              type="time"
              required
              value={manuellForm.ende}
              onChange={(e) => setManuellForm({ ...manuellForm, ende: e.target.value })}
            />
          </label>
          <label>
            Pause (Minuten)
            <input
              type="number"
              min="0"
              step="5"
              value={manuellForm.pauseMinuten}
              onChange={(e) => setManuellForm({ ...manuellForm, pauseMinuten: e.target.value })}
            />
          </label>
          <button type="submit" disabled={manuellBusy}>Speichern</button>
        </form>
      )}

      <h3>Heute</h3>
      <ul className="card-list">
        {heute.map((e) => (
          <li key={e.id} className="card">
            <span>{(e.start || '').slice(11, 16)} – {e.end ? e.end.slice(11, 16) : 'läuft'}</span>
            {e.dauer != null && <span className="card-sub">{formatDauer(e.dauer)}</span>}
          </li>
        ))}
        {heute.length === 0 && <li className="card-empty">Noch keine Einträge heute.</li>}
      </ul>
    </section>
  )
}
