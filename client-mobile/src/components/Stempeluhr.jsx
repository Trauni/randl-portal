import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'

// Stoppuhr für das Mini-Dashboard (ganz oben): Start / Pause / Weiter / Stopp.
// Gleiche API wie die Zeiterfassung-Seite (/api/zeit/*).
const pad = (n) => String(n).padStart(2, '0')
const formatDauer = (sekunden) => {
  const s = Math.max(0, Math.floor(sekunden))
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}

export default function Stempeluhr() {
  const [laufend, setLaufend] = useState(undefined)
  const [jetzt, setJetzt] = useState(Date.now())
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState('')

  const lade = () => {
    fetch('/api/zeit/laufend', { credentials: 'include' })
      .then((res) => res.json())
      .then(setLaufend)
      .catch(() => setLaufend(null))
  }
  useEffect(lade, [])

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
      lade()
    } catch (err) {
      setFehler(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (laufend === undefined) return null

  const seitStart = laufend ? (jetzt - new Date(laufend.start).getTime()) / 1000 : 0
  const seitPause = laufend?.pause_start ? (jetzt - new Date(laufend.pause_start).getTime()) / 1000 : 0

  return (
    <div className="timer-card" style={{ marginBottom: 16 }}>
      {fehler && <p className="error-text" style={{ margin: 0 }}>{fehler}</p>}
      {!laufend && (
        <>
          <p className="timer-display" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Clock size={22} />00:00:00</p>
          <button type="button" className="btn-primary" disabled={busy} onClick={() => aufruf('/api/zeit/start')}>Start</button>
        </>
      )}
      {laufend?.status === 'laufend' && (
        <>
          <p className="timer-display">{formatDauer(seitStart)}</p>
          <div className="timer-buttons">
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => aufruf(`/api/zeit/${laufend.id}/pause`)}>Pause</button>
            <button type="button" className="btn-primary" disabled={busy} onClick={() => aufruf(`/api/zeit/${laufend.id}/stop`)}>Stopp</button>
          </div>
        </>
      )}
      {laufend?.status === 'pausiert' && (
        <>
          <p className="timer-display timer-paused">Pause seit {formatDauer(seitPause)}</p>
          <div className="timer-buttons">
            <button type="button" className="btn-primary" disabled={busy} onClick={() => aufruf(`/api/zeit/${laufend.id}/fortsetzen`)}>Weiter</button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => aufruf(`/api/zeit/${laufend.id}/stop`)}>Stopp</button>
          </div>
        </>
      )}
    </div>
  )
}
