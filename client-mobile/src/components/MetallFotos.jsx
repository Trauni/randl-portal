import { useEffect, useRef, useState } from 'react'
import { Camera, Search, ChevronLeft, ImagePlus } from 'lucide-react'

// #372 (17.10.2026): Werkstattfotos vom Handy direkt zum Vorgang. Vorgang suchen (laufende),
// Foto aufnehmen oder aus der Galerie wählen, Freigabe für den Kunden umschalten.
// Gleiche Routen wie das Vorgangsdetail am PC (/api/metallarbeiten/dateien). Standard: nur intern.

const MAX_MB = 25

function hochladen(url, files, onProgress) {
  return new Promise((resolve, reject) => {
    const fd = new FormData()
    files.forEach((f) => fd.append('dateien', f, f.name))
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.withCredentials = true
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100))
    xhr.onload = () => {
      let data = {}
      try { data = JSON.parse(xhr.responseText) } catch { /* leer */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data)
      else reject(new Error(data.error || `Hochladen fehlgeschlagen (${xhr.status})`))
    }
    xhr.onerror = () => reject(new Error('Keine Verbindung – bitte erneut versuchen.'))
    xhr.send(fd)
  })
}

export default function MetallFotos() {
  const [q, setQ] = useState('')
  const [treffer, setTreffer] = useState([])
  const [vorgang, setVorgang] = useState(null)
  const [dateien, setDateien] = useState([])
  const [loading, setLoading] = useState(false)
  const [fortschritt, setFortschritt] = useState(null)
  const [error, setError] = useState(null)
  const [hinweis, setHinweis] = useState(null)
  const kamera = useRef(null)
  const galerie = useRef(null)

  // Laufende Vorgänge, Suche nach Nummer, Kunde, Bezeichnung (leicht verzögert)
  useEffect(() => {
    if (vorgang) return undefined
    const t = setTimeout(() => {
      setLoading(true)
      fetch(`/api/metallarbeiten/vorgaenge?status=laufend&q=${encodeURIComponent(q.trim())}`, { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
        .then((d) => { setTreffer(d.treffer || []); setError(null) })
        .catch(() => setError('Vorgänge konnten nicht geladen werden.'))
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(t)
  }, [q, vorgang])

  const ladeDateien = (v) =>
    fetch(`/api/metallarbeiten/dateien/vorgang/${v.id}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then(setDateien)
      .catch(() => setError('Dateien konnten nicht geladen werden.'))

  const waehle = (v) => { setVorgang(v); setDateien([]); setError(null); setHinweis(null); ladeDateien(v) }

  const lade = async (fileList) => {
    const files = Array.from(fileList || [])
    if (!files.length) return
    setError(null); setHinweis(null)
    const ok = files.filter((f) => f.size <= MAX_MB * 1024 * 1024)
    if (ok.length < files.length) setError(`Größer als ${MAX_MB} MB, nicht hochgeladen: ${files.filter((f) => !ok.includes(f)).map((f) => f.name).join(', ')}`)
    if (!ok.length) return
    setFortschritt(0)
    try {
      const r = await hochladen(`/api/metallarbeiten/dateien/vorgang/${vorgang.id}`, ok, setFortschritt)
      setHinweis(`${r.gespeichert?.length || 0} gespeichert – nur intern, bis du freigibst.`)
      if (r.abgelehnt?.length) setError(`Nicht gespeichert: ${r.abgelehnt.map((a) => `${a.dateiname} (${a.grund})`).join(', ')}`)
      await ladeDateien(vorgang)
    } catch (e) {
      setError(e.message)
    } finally {
      setFortschritt(null)
      if (kamera.current) kamera.current.value = ''
      if (galerie.current) galerie.current.value = ''
    }
  }

  const umschalten = async (d) => {
    setError(null)
    try {
      const r = await fetch(`/api/metallarbeiten/dateien/${d.id}/sichtbar`, {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sichtbar: !d.fuer_kunde_sichtbar }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Freigabe fehlgeschlagen')
      setDateien((alt) => alt.map((x) => (x.id === d.id ? { ...x, fuer_kunde_sichtbar: !d.fuer_kunde_sichtbar } : x)))
    } catch (e) { setError(e.message) }
  }

  if (!vorgang) {
    return (
      <section>
        <h2 className="section-title"><Camera size={17} />Maschinenbau: Fotos</h2>
        <div className="search-box">
          <Search size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Vorgang, Kunde, Bezeichnung …" inputMode="search" />
        </div>
        {error && <p className="error">{error}</p>}
        <ul className="card-list">
          {treffer.map((v) => (
            <li key={v.id} className="card card-clickable" onClick={() => waehle(v)}>
              <span><b>{v.vorgangsnummer}</b> · {v.bezeichnung}</span>
              <span className="card-sub">{v.kunde_name}{v.status?.text ? ` · ${v.status.text}` : ''}</span>
            </li>
          ))}
          {!loading && treffer.length === 0 && <li className="card card-empty">Keine laufenden Vorgänge gefunden.</li>}
        </ul>
      </section>
    )
  }

  const laeuft = fortschritt !== null
  return (
    <section>
      <button type="button" className="link-btn" onClick={() => setVorgang(null)}><ChevronLeft size={15} style={{ verticalAlign: 'middle' }} />Anderer Vorgang</button>
      <h2 className="section-title"><Camera size={17} />{vorgang.vorgangsnummer}</h2>
      <p className="hint">{vorgang.bezeichnung} · {vorgang.kunde_name}</p>

      <input ref={kamera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => lade(e.target.files)} />
      <input ref={galerie} type="file" accept="image/*,.pdf" multiple hidden onChange={(e) => lade(e.target.files)} />
      <div className="mf-actions">
        <button type="button" className="mf-btn btn-primary" disabled={laeuft} onClick={() => kamera.current?.click()}>
          <Camera size={18} />Foto aufnehmen
        </button>
        <button type="button" className="mf-btn btn-secondary" disabled={laeuft} onClick={() => galerie.current?.click()}>
          <ImagePlus size={18} />Aus Galerie
        </button>
      </div>
      {laeuft && <div className="mf-progress"><div style={{ width: `${fortschritt}%` }} /><span>Lade hoch … {fortschritt} %</span></div>}
      {error && <p className="error">{error}</p>}
      {hinweis && !error && <p className="hint">{hinweis}</p>}

      <ul className="mf-grid">
        {dateien.map((d) => (
          <li key={d.id} className={`mf-item${d.fuer_kunde_sichtbar ? ' mf-item--frei' : ''}`}>
            <a href={`/api/metallarbeiten/dateien/${d.id}`} target="_blank" rel="noreferrer" className="mf-thumb">
              {d.vorschau ? <img src={`/api/metallarbeiten/dateien/${d.id}/vorschau`} alt={d.dateiname} loading="lazy" /> : <span>{d.art === 'pdf' ? 'PDF' : 'Datei'}</span>}
            </a>
            <label className="mf-switch">
              <input type="checkbox" checked={d.fuer_kunde_sichtbar} onChange={() => umschalten(d)} />
              Kunde sieht es
            </label>
          </li>
        ))}
        {dateien.length === 0 && <li className="card card-empty">Noch keine Fotos zu diesem Vorgang.</li>}
      </ul>
    </section>
  )
}
