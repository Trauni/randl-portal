import { useCallback, useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'

const tag = (iso) => { const [, m, t] = String(iso).slice(0, 10).split('-'); return `${t}.${m}.` }
const zeitraum = (r) => (r.start_date === r.end_date ? tag(r.start_date) : `${tag(r.start_date)} – ${tag(r.end_date)}`)

export default function Freigaben({ onGelesen }) {
  const [liste, setListe] = useState(null)
  const [busy, setBusy] = useState(null)
  const [fehler, setFehler] = useState('')
  const [ablehnen, setAblehnen] = useState(null)
  const [grund, setGrund] = useState('')

  const lade = useCallback(() => {
    fetch('/api/vacation/offen', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status === 403 ? 'Kein Zugriff' : 'Nicht ladbar'))))
      .then(setListe).catch((e) => { setFehler(e.message); setListe([]) })
  }, [])
  useEffect(lade, [lade])

  const entscheide = async (r, was) => {
    setBusy(r.id); setFehler('')
    try {
      const res = await fetch(`/api/vacation/${r.id}/${was}`, {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(was === 'reject' ? { note: grund || null } : {}),
      })
      if (!res.ok) throw new Error('Aktion fehlgeschlagen')
      setAblehnen(null); setGrund(''); lade(); onGelesen?.()
    } catch (e) { setFehler(e.message) } finally { setBusy(null) }
  }

  if (liste === null) return <p className="hint">Lädt…</p>
  return (
    <>
      <div className="section-title">Offene Anträge ({liste.length})</div>
      {fehler && <p className="error-text">{fehler}</p>}
      {liste.length === 0 && !fehler && <div className="card card-empty">Nichts offen</div>}
      <div className="card-list">
        {liste.map((r) => (
          <div key={r.id} className="card">
            <div className="mit-kopf"><strong>{r.emp_name}</strong><span className="card-sub">{r.art === 'urlaub' ? 'Urlaub' : 'Gleitzeitabbau'}</span></div>
            <div>{zeitraum(r)} · {r.days_count} {r.days_count === 1 ? 'Tag' : 'Tage'}{r.abbau_von ? ` (${r.abbau_von.slice(0, 5)}–${r.abbau_bis.slice(0, 5)})` : ''}</div>
            {r.art === 'urlaub' && <div className="card-sub">Resturlaub {r.rest} von {r.anspruch} Tagen{r.rest - r.days_count < 0 ? ' · reicht nicht' : ''}</div>}
            {r.reason && <div className="card-sub">„{r.reason}“</div>}
            {r.ueberschneidungen.length > 0 && (
              <div className="notice-banner">Gleichzeitig weg: {r.ueberschneidungen.map((u) => `${u.name} (${zeitraum(u)}${u.status === 'pending' ? ', offen' : ''})`).join(', ')}</div>
            )}
            {ablehnen === r.id ? (
              <div className="mf-actions">
                <input className="search-box" placeholder="Grund (optional)" value={grund} onChange={(e) => setGrund(e.target.value)} />
                <button type="button" className="btn-secondary" disabled={busy === r.id} onClick={() => entscheide(r, 'reject')}>Ablehnen bestätigen</button>
                <button type="button" className="link-btn" onClick={() => setAblehnen(null)}>Abbrechen</button>
              </div>
            ) : (
              <div className="mf-actions">
                <button type="button" className="btn-primary" disabled={busy === r.id} onClick={() => entscheide(r, 'approve')}><Check size={16} /> Genehmigen</button>
                <button type="button" className="btn-secondary" disabled={busy === r.id} onClick={() => { setAblehnen(r.id); setGrund('') }}><X size={16} /> Ablehnen</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  )
}
