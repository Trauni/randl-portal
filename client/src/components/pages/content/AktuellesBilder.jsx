// Bilder für „Aktuelles“ (randl.group/news/img/) – Tab in der Bilderverwaltung und Bildauswahl im Beitrags-Editor.
// Hochladen → WebP 2048 px + Vorschau 640 px, ohne Metadaten (src/services/aktuelles.js).
import { useState, useEffect, useRef, useCallback } from 'react'

const API = '/api/content/aktuelles/bilder'
const input = { width: '100%', boxSizing: 'border-box', padding: '7px 9px', fontSize: 13, background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text1)' }
const btn = { padding: '6px 12px', fontSize: 12, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text2)', cursor: 'pointer' }

async function api(url, opts) {
  const r = await fetch(url, opts)
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'Aktion fehlgeschlagen')
  return d
}

// auswahl: null = reine Verwaltung; sonst { mehrfach, gewaehlt: [file], onWahl(files) } für die Bildauswahl im Editor
export default function AktuellesBilder({ auswahl = null }) {
  const [bilder, setBilder] = useState(null)
  const [limits, setLimits] = useState({ alt: 140, nachweis: 100 })
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [alt, setAlt] = useState('')
  const [nachweis, setNachweis] = useState('')
  const [edit, setEdit] = useState(null)          // { file, alt, nachweis }
  const [gewaehlt, setGewaehlt] = useState(auswahl?.gewaehlt || [])
  const fileRef = useRef(null)

  const load = useCallback(async () => {
    try { const d = await api(API); setBilder(d.bilder); setLimits(d.limits) }
    catch (e) { setMsg({ ok: false, text: e.message }) }
  }, [])
  useEffect(() => { load() }, [load])

  async function hochladen(files) {
    if (!files?.length) return
    setBusy(true); setMsg(null)
    try {
      const fd = new FormData()
      for (const f of files) fd.append('bilder', f)
      fd.append('alt', alt); fd.append('nachweis', nachweis)
      const d = await api(API, { method: 'POST', body: fd })
      setMsg({ ok: true, text: `${d.hinzugefuegt.length} Bild(er) hochgeladen${d.doppelt.length ? `, ${d.doppelt.length} war(en) schon vorhanden` : ''}.` })
      setAlt(''); setNachweis('')
      if (auswahl) {
        const neu = [...d.hinzugefuegt, ...d.doppelt]
        setGewaehlt(g => (auswahl.mehrfach ? [...new Set([...g, ...neu])] : neu.slice(0, 1)))
      }
      await load()
    } catch (e) { setMsg({ ok: false, text: e.message }) }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = '' }
  }

  async function speichern() {
    setBusy(true); setMsg(null)
    try {
      await api(`${API}/${edit.file}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ alt: edit.alt, nachweis: edit.nachweis }) })
      setEdit(null); await load()
    } catch (e) { setMsg({ ok: false, text: e.message }) }
    finally { setBusy(false) }
  }

  async function loeschen(b) {
    if (!window.confirm(`Bild „${b.alt || b.file}“ endgültig löschen?`)) return
    setBusy(true); setMsg(null)
    try { await api(`${API}/${b.file}`, { method: 'DELETE' }); await load() }
    catch (e) { setMsg({ ok: false, text: e.message }) }
    finally { setBusy(false) }
  }

  function waehle(file) {
    if (!auswahl) return
    setGewaehlt(g => (auswahl.mehrfach ? (g.includes(file) ? g.filter(f => f !== file) : [...g, file]) : [file]))
  }

  return (
    <div>
      {!auswahl && (
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text1)', margin: 0 }}>Aktuelles – Bilder</h2>
          <p style={{ fontSize: 12, color: 'var(--text3)', margin: '4px 0 0' }}>randl.group/news/img/ · WebP · max. 2048 px + Vorschau 640 px · ohne EXIF. Verwendung in Content → Aktuelles.</p>
        </div>
      )}

      <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 9, padding: 14, marginBottom: 16, display: 'grid', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 4 }} htmlFor="ab-alt">Bildbeschreibung (Alt-Text) für den Upload</label>
            <input id="ab-alt" style={input} maxLength={limits.alt} value={alt} onChange={e => setAlt(e.target.value)} placeholder="z. B. Galazelt mit gedeckter Tafel" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 4 }} htmlFor="ab-nw">Bildnachweis (optional)</label>
            <input id="ab-nw" style={input} maxLength={limits.nachweis} value={nachweis} onChange={e => setNachweis(e.target.value)} placeholder="z. B. Foto: Max Muster" />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" multiple style={{ display: 'none' }} onChange={e => hochladen([...e.target.files])} />
          <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}
            style={{ ...btn, background: 'var(--r)', border: 'none', color: '#fff', fontWeight: 600, opacity: busy ? .6 : 1 }}>{busy ? 'Lädt hoch…' : 'Bilder hochladen'}</button>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>JPG, PNG, WebP oder HEIC, bis 30 MB, max. 20 auf einmal. Nur eigene Bilder oder Bilder mit Freigabe.</span>
        </div>
      </div>

      {msg && <div role="status" style={{ marginBottom: 12, fontSize: 13, color: msg.ok ? 'var(--green, var(--text1))' : 'var(--r2, var(--r))' }}>{msg.text}</div>}

      {!bilder ? <div style={{ color: 'var(--text3)', padding: 20 }}>Lädt…</div>
        : !bilder.length ? <div style={{ color: 'var(--text3)', padding: 20 }}>Noch keine Bilder hochgeladen.</div>
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
            {bilder.map(b => {
              const an = gewaehlt.includes(b.file)
              return (
                <div key={b.file} style={{ background: 'var(--bg1)', border: an ? '2px solid var(--r)' : '1px solid var(--border)', borderRadius: 9, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <button type="button" onClick={() => (auswahl ? waehle(b.file) : window.open(b.url, '_blank', 'noopener'))} aria-pressed={auswahl ? an : undefined}
                    title={auswahl ? (an ? 'Auswahl aufheben' : 'Auswählen') : 'Großes Bild öffnen'}
                    style={{ border: 'none', padding: 0, background: 'var(--bg3)', cursor: 'pointer', aspectRatio: '4 / 3', display: 'block' }}>
                    <img src={b.thumb} alt={b.alt} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </button>
                  <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text2)', display: 'grid', gap: 6, flex: 1 }}>
                    {edit?.file === b.file ? (
                      <>
                        <input style={input} maxLength={limits.alt} value={edit.alt} aria-label="Alt-Text" onChange={e => setEdit({ ...edit, alt: e.target.value })} />
                        <input style={input} maxLength={limits.nachweis} value={edit.nachweis} aria-label="Bildnachweis" placeholder="Bildnachweis" onChange={e => setEdit({ ...edit, nachweis: e.target.value })} />
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button type="button" style={btn} disabled={busy} onClick={speichern}>Speichern</button>
                          <button type="button" style={btn} onClick={() => setEdit(null)}>Abbrechen</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <span style={{ color: b.alt ? 'var(--text1)' : 'var(--r2, var(--r))' }}>{b.alt || 'Alt-Text fehlt'}</span>
                        {b.nachweis && <span style={{ color: 'var(--text3)' }}>{b.nachweis}</span>}
                        <span style={{ color: 'var(--text3)' }}>{b.w} × {b.h}{b.verwendet.length ? ` · in: ${b.verwendet.join(', ')}` : ' · unbenutzt'}</span>
                        <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
                          <button type="button" style={btn} onClick={() => setEdit({ file: b.file, alt: b.alt || '', nachweis: b.nachweis || '' })}>Text ändern</button>
                          {!auswahl && <button type="button" style={btn} disabled={busy || b.verwendet.length > 0} title={b.verwendet.length ? 'Wird noch in einem Beitrag verwendet' : undefined} onClick={() => loeschen(b)}>Löschen</button>}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

      {auswahl && (
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16, position: 'sticky', bottom: 0, background: 'var(--bg2, var(--bg1))', padding: '10px 0' }}>
          <button type="button" style={btn} onClick={() => auswahl.onWahl(null)}>Abbrechen</button>
          <button type="button" disabled={!auswahl.mehrfach && !gewaehlt.length}
            style={{ ...btn, background: 'var(--r)', border: 'none', color: '#fff', fontWeight: 600 }}
            onClick={() => auswahl.onWahl(gewaehlt.map(f => bilder.find(b => b.file === f)).filter(Boolean))}>
            {auswahl.mehrfach ? `${gewaehlt.length} Bild(er) übernehmen` : 'Bild übernehmen'}
          </button>
        </div>
      )}
    </div>
  )
}
