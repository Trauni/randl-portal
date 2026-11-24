// Content → Aktuelles: Beiträge für randl.group/news/ (#74). Speichern erzeugt die Seiten sofort (src/services/aktuelles.js).
import { useState, useEffect, useRef, useCallback } from 'react'
import AktuellesBilder from './AktuellesBilder'

const API = '/api/content/aktuelles'
const SITE = 'https://randl.group'
const STATUS = { entwurf: 'Entwurf', veroeffentlicht: 'Veröffentlicht' }
// Im Portal heißen die Sparten kurz (Zelt/Gas), auf der Website wie in der Navigation.
const SPARTE_KURZ = { zelt: 'Zelt', maschinenbau: 'Maschinenbau', gas: 'Gas', allgemein: 'Allgemein' }

const label = { display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 4 }
const input = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', fontSize: 13, background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text1)' }
const btn = { padding: '6px 12px', fontSize: 12, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text2)', cursor: 'pointer' }
const primary = { ...btn, padding: '8px 18px', fontSize: 13, fontWeight: 600, background: 'var(--r)', border: 'none', color: '#fff' }
const box = { background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 9, padding: 16, display: 'grid', gap: 14 }
const counter = (n, max) => <span style={{ float: 'right', color: n > max ? 'var(--r)' : 'var(--text3)' }}>{n}/{max}</span>

// Muss zu slugify() in src/services/aktuelles.js passen
function slugify(s) {
  return String(s).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[^\x00-\x7f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}
const heute = () => { const d = new Date(); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` }
const datumDe = d => (d ? d.split('-').reverse().join('.') : '')
const leer = () => ({ titel: '', slug: '', datum: heute(), sparte: 'zelt', teaser: '', text: '', titelbild: null, galerie: [], status: 'entwurf', veranstaltung: null })
const LEERE_VERANSTALTUNG = { start: '', ende: '', zeiten: '', ort: '', strasse: '', plz: '', stadt: '', url: '' }

async function api(url, opts) {
  const r = await fetch(url, opts)
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error(d.error || 'Aktion fehlgeschlagen'), { errors: d.errors })
  return d
}
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

// Vorschau in neuem Tab: Formular-POST, damit die Antwort ihre eigene CSP mitbringen kann (lädt Schriften von randl.group)
function vorschau(beitrag, id) {
  const f = document.createElement('form')
  f.method = 'POST'; f.action = `${API}/vorschau`; f.target = '_blank'
  const i = document.createElement('input')
  i.type = 'hidden'; i.name = 'json'; i.value = JSON.stringify({ beitrag, id: id || null })
  f.appendChild(i); document.body.appendChild(f); f.submit(); f.remove()
}

function Dialog({ titel, onClose, children }) {
  useEffect(() => {
    const k = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div role="dialog" aria-modal="true" aria-label={titel} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '4vh 16px', overflowY: 'auto' }}>
      <div style={{ background: 'var(--bg2, var(--bg1))', border: '1px solid var(--border)', borderRadius: 10, padding: 18, width: 'min(980px, 100%)' }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text1)', margin: '0 0 14px' }}>{titel}</h2>
        {children}
      </div>
    </div>
  )
}

// ── Editor ───────────────────────────────────────────────────────────
function Editor({ id, limits, sparten, onFertig }) {
  const [b, setB] = useState(null)
  const [gespeichert, setGespeichert] = useState(null)   // Stand auf dem Server (für „ungespeichert“-Warnung)
  const [slugFrei, setSlugFrei] = useState(!id)           // Slug folgt dem Titel, bis er von Hand geändert wird
  const [bilder, setBilder] = useState({})                // file → Eintrag (für Vorschaubilder)
  const [wahl, setWahl] = useState(null)                  // 'titelbild' | 'galerie' | 'text'
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const textRef = useRef(null)

  const ladeBilder = useCallback(async () => {
    try { const d = await api(`${API}/bilder`); setBilder(Object.fromEntries(d.bilder.map(x => [x.file, x]))) } catch { /* Auswahl zeigt den Fehler */ }
  }, [])
  useEffect(() => {
    ladeBilder()
    if (!id) { const n = leer(); setB(n); setGespeichert(JSON.stringify(n)); return }
    api(`${API}/${id}`).then(d => {
      const n = { ...leer(), ...d, galerie: d.galerie || [], veranstaltung: d.veranstaltung || null }
      setB(n); setGespeichert(JSON.stringify(n))
    }).catch(e => setMsg({ ok: false, text: e.message }))
  }, [id, ladeBilder])

  const dirty = b && JSON.stringify(b) !== gespeichert
  useEffect(() => {
    if (!dirty) return undefined
    const w = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', w)
    return () => window.removeEventListener('beforeunload', w)
  }, [dirty])

  const set = (k, v) => setB(x => ({ ...x, [k]: v }))
  const setV = (k, v) => setB(x => ({ ...x, veranstaltung: { ...x.veranstaltung, [k]: v } }))
  const felder = x => ({ titel: x.titel, slug: x.slug, datum: x.datum, sparte: x.sparte, teaser: x.teaser, text: x.text,
    titelbild: x.titelbild, galerie: x.galerie, status: x.status, veranstaltung: x.veranstaltung })

  function titelGeaendert(v) {
    setB(x => ({ ...x, titel: v, slug: slugFrei ? slugify(v).slice(0, limits.slug) : x.slug }))
  }

  // Toolbar: Markdown um die Auswahl setzen bzw. am Zeilenanfang einfügen
  function einfuegen(vor, nach = '', platzhalter = '') {
    const ta = textRef.current
    if (!ta) return
    const { selectionStart: a, selectionEnd: e, value } = ta
    const mitte = value.slice(a, e) || platzhalter
    const neu = value.slice(0, a) + vor + mitte + nach + value.slice(e)
    set('text', neu)
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(a + vor.length, a + vor.length + mitte.length) })
  }
  function zeile(praefix) {
    const ta = textRef.current
    if (!ta) return
    const { selectionStart: a, value } = ta
    const start = value.lastIndexOf('\n', a - 1) + 1
    set('text', value.slice(0, start) + praefix + value.slice(start))
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(a + praefix.length, a + praefix.length) })
  }
  function link() {
    const url = window.prompt('Link-Ziel (/pfad oder https://…)', 'https://')
    if (url) einfuegen('[', `](${url.trim()})`, 'Link-Text')
  }

  function bildGewaehlt(liste) {
    const art = wahl
    setWahl(null); ladeBilder()
    if (!liste) return
    if (art === 'titelbild') set('titelbild', liste[0]?.file || null)
    else if (art === 'galerie') set('galerie', liste.map(x => x.file))
    else if (art === 'text' && liste[0]) einfuegen(`\n\n![${liste[0].alt || ''}](/news/img/full/${liste[0].file})\n\n`)
  }

  async function speichern(status) {
    setSaving(true); setMsg(null)
    try {
      const body = felder({ ...b, status: status || b.status })
      const d = b.id ? await api(`${API}/${b.id}`, json('PUT', body)) : await api(API, json('POST', body))
      const n = { ...leer(), ...d.beitrag, galerie: d.beitrag.galerie || [] }
      setB(n); setGespeichert(JSON.stringify(n)); setSlugFrei(false)
      const warn = d.build?.warnungen?.length ? ` Hinweis: ${d.build.warnungen.join('; ')}` : ''
      setMsg({ ok: !warn, text: (n.status === 'veroeffentlicht'
        ? `Gespeichert und veröffentlicht: ${n.url}`
        : 'Als Entwurf gespeichert. Der Beitrag ist öffentlich nicht sichtbar.') + warn })
    } catch (e) {
      setMsg({ ok: false, text: e.errors?.length ? e.errors.join(' · ') : e.message })
    } finally { setSaving(false) }
  }

  function zurueck() {
    if (dirty && !window.confirm('Es gibt ungespeicherte Änderungen. Trotzdem verlassen?')) return
    onFertig()
  }

  if (!b) return <div style={{ color: 'var(--text3)', padding: 32 }}>{msg ? msg.text : 'Lädt…'}</div>
  const v = b.veranstaltung
  const tb = b.titelbild && bilder[b.titelbild]
  const live = b.id && JSON.parse(gespeichert).status === 'veroeffentlicht'

  return (
    <div style={{ maxWidth: 860, paddingBottom: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <button type="button" style={btn} onClick={zurueck}>← Zur Liste</button>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text1)', margin: 0 }}>{b.id ? 'Beitrag bearbeiten' : 'Neuer Beitrag'}</h1>
        <span style={{ fontSize: 12, color: 'var(--text3)' }}>{live ? 'Veröffentlicht' : 'Entwurf'}{dirty ? ' · ungespeicherte Änderungen' : ''}</span>
      </div>

      <div style={box}>
        <div>
          <label style={label} htmlFor="ak-titel">Titel{counter(b.titel.length, limits.titel)}</label>
          <input id="ak-titel" style={input} value={b.titel} onChange={e => titelGeaendert(e.target.value)} />
        </div>
        <div>
          <label style={label} htmlFor="ak-slug">Adresse (Slug): {SITE}/news/<strong>{b.slug || '…'}</strong>/</label>
          <input id="ak-slug" style={input} value={b.slug}
            onChange={e => { setSlugFrei(false); set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-{2,}/g, '-')) }}
            onBlur={() => { if (!b.slug) { setSlugFrei(true); set('slug', slugify(b.titel).slice(0, limits.slug)) } else set('slug', b.slug.replace(/^-+|-+$/g, '')) }} />
          {live && <span style={{ fontSize: 11, color: 'var(--text3)' }}>Der Beitrag ist schon öffentlich. Eine neue Adresse macht alte Links ungültig.</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
          <div>
            <label style={label} htmlFor="ak-datum">Datum</label>
            <input id="ak-datum" type="date" style={input} value={b.datum} onChange={e => set('datum', e.target.value)} />
          </div>
          <div>
            <label style={label} htmlFor="ak-sparte">Sparte</label>
            <select id="ak-sparte" style={input} value={b.sparte} onChange={e => set('sparte', e.target.value)}>
              {sparten.map(s => <option key={s.id} value={s.id}>{SPARTE_KURZ[s.id] || s.titel}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label style={label} htmlFor="ak-teaser">Teaser (steht in der Übersicht und wird die Beschreibung für Google){counter(b.teaser.length, limits.teaser)}</label>
          <textarea id="ak-teaser" rows={2} style={{ ...input, resize: 'vertical' }} value={b.teaser} onChange={e => set('teaser', e.target.value)} />
        </div>
      </div>

      <div style={{ ...box, marginTop: 14 }}>
        <div>
          <span style={label}>Titelbild</span>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {tb && <img src={tb.thumb} alt={tb.alt} style={{ width: 150, height: 100, objectFit: 'cover', borderRadius: 7, border: '1px solid var(--border)' }} />}
            <button type="button" style={btn} onClick={() => setWahl('titelbild')}>{b.titelbild ? 'Anderes Bild wählen' : 'Bild wählen'}</button>
            {b.titelbild && <button type="button" style={btn} onClick={() => set('titelbild', null)}>Entfernen</button>}
            {tb && !tb.alt && <span style={{ fontSize: 12, color: 'var(--r2, var(--r))' }}>Alt-Text fehlt (in der Bildauswahl „Text ändern“)</span>}
          </div>
        </div>
        <div>
          <label style={label} htmlFor="ak-text">Text{counter(b.text.length, limits.text)}</label>
          <div role="toolbar" aria-label="Formatierung" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
            <button type="button" style={btn} onClick={() => zeile('## ')}>Überschrift</button>
            <button type="button" style={btn} onClick={() => zeile('### ')}>Zwischenüberschrift</button>
            <button type="button" style={{ ...btn, fontWeight: 700 }} onClick={() => einfuegen('**', '**', 'fett')}>Fett</button>
            <button type="button" style={btn} onClick={() => zeile('- ')}>Liste</button>
            <button type="button" style={btn} onClick={link}>Link</button>
            <button type="button" style={btn} onClick={() => setWahl('text')}>Bild</button>
          </div>
          <textarea id="ak-text" ref={textRef} rows={18} style={{ ...input, resize: 'vertical', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', lineHeight: 1.5 }}
            value={b.text} onChange={e => set('text', e.target.value)} />
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>Absätze durch eine Leerzeile trennen. ## Überschrift · **fett** · - Listenpunkt · [Text](Link). HTML wird nicht übernommen.</span>
        </div>
        <div>
          <span style={label}>Bildergalerie (optional, {b.galerie.length} Bild{b.galerie.length === 1 ? '' : 'er'})</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {b.galerie.map(f => bilder[f] && (
              <span key={f} style={{ position: 'relative' }}>
                <img src={bilder[f].thumb} alt={bilder[f].alt} style={{ width: 84, height: 64, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)', display: 'block' }} />
                <button type="button" aria-label={`${bilder[f].alt || 'Bild'} aus der Galerie nehmen`} onClick={() => set('galerie', b.galerie.filter(x => x !== f))}
                  style={{ position: 'absolute', top: 2, right: 2, width: 20, height: 20, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.7)', color: '#fff', cursor: 'pointer', fontSize: 12, lineHeight: '20px', padding: 0 }}>×</button>
              </span>
            ))}
            <button type="button" style={btn} onClick={() => setWahl('galerie')}>{b.galerie.length ? 'Auswahl ändern' : 'Bilder wählen'}</button>
          </div>
        </div>
      </div>

      <div style={{ ...box, marginTop: 14 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text1)', cursor: 'pointer' }}>
          <input type="checkbox" checked={!!v} onChange={e => set('veranstaltung', e.target.checked ? { ...LEERE_VERANSTALTUNG } : null)} />
          Der Beitrag kündigt eine Veranstaltung an (Messe, Tag der offenen Tür …)
        </label>
        {v && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
              <div><label style={label} htmlFor="ak-vs">Start</label><input id="ak-vs" type="datetime-local" style={input} value={v.start || ''} onChange={e => setV('start', e.target.value)} /></div>
              <div><label style={label} htmlFor="ak-ve">Ende</label><input id="ak-ve" type="datetime-local" style={input} value={v.ende || ''} onChange={e => setV('ende', e.target.value)} /></div>
              <div><label style={label} htmlFor="ak-vz">Öffnungszeiten als Text (optional)</label><input id="ak-vz" style={input} value={v.zeiten || ''} placeholder="z. B. Täglich 10–17 Uhr" onChange={e => setV('zeiten', e.target.value)} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
              <div><label style={label} htmlFor="ak-vo">Ort (Name)</label><input id="ak-vo" style={input} value={v.ort || ''} placeholder="z. B. KU'KO Rosenheim" onChange={e => setV('ort', e.target.value)} /></div>
              <div><label style={label} htmlFor="ak-vstr">Straße und Hausnummer</label><input id="ak-vstr" style={input} value={v.strasse || ''} onChange={e => setV('strasse', e.target.value)} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 8 }}>
                <div><label style={label} htmlFor="ak-vp">PLZ</label><input id="ak-vp" style={input} value={v.plz || ''} onChange={e => setV('plz', e.target.value)} /></div>
                <div><label style={label} htmlFor="ak-vst">Stadt</label><input id="ak-vst" style={input} value={v.stadt || ''} onChange={e => setV('stadt', e.target.value)} /></div>
              </div>
            </div>
            <div><label style={label} htmlFor="ak-vu">Link zur Veranstaltung (optional, https://…)</label><input id="ak-vu" style={input} value={v.url || ''} onChange={e => setV('url', e.target.value)} /></div>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>Google kann die Veranstaltung damit mit Datum und Ort in der Suche zeigen. Nach dem Termin bleibt der Beitrag als Rückblick stehen.</span>
          </>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
        <button type="button" style={{ ...primary, opacity: saving ? .6 : 1 }} disabled={saving} onClick={() => speichern('veroeffentlicht')}>
          {saving ? 'Speichert…' : live ? 'Speichern' : 'Veröffentlichen'}
        </button>
        <button type="button" style={{ ...btn, padding: '8px 14px', fontSize: 13 }} disabled={saving} onClick={() => speichern('entwurf')}>
          {live ? 'Zurückziehen (wieder Entwurf)' : 'Als Entwurf speichern'}
        </button>
        <button type="button" style={{ ...btn, padding: '8px 14px', fontSize: 13 }} onClick={() => vorschau(felder(b), b.id)}>Vorschau</button>
        {live && <a href={b.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: 'var(--r2, var(--r))' }}>Auf der Website ansehen ↗</a>}
      </div>
      <p style={{ fontSize: 12, color: 'var(--text3)', margin: '8px 0 0' }}>Speichern erzeugt die Seite sofort. Übersicht, Teaser und Sitemap werden mit aktualisiert. Bis alle Besucher die neue Fassung sehen, kann es wenige Minuten dauern.</p>
      {msg && <div role="status" style={{ marginTop: 12, fontSize: 13, color: msg.ok ? 'var(--green, var(--text1))' : 'var(--r2, var(--r))' }}>{msg.text}</div>}

      {wahl && (
        <Dialog titel={wahl === 'galerie' ? 'Bilder für die Galerie wählen' : wahl === 'titelbild' ? 'Titelbild wählen' : 'Bild in den Text einfügen'} onClose={() => bildGewaehlt(null)}>
          <AktuellesBilder auswahl={{ mehrfach: wahl === 'galerie', gewaehlt: wahl === 'galerie' ? b.galerie : wahl === 'titelbild' && b.titelbild ? [b.titelbild] : [], onWahl: bildGewaehlt }} />
        </Dialog>
      )}
    </div>
  )
}

// ── Liste ────────────────────────────────────────────────────────────
export default function Aktuelles() {
  const [data, setData] = useState(null)
  const [offen, setOffen] = useState(undefined)     // undefined = Liste, null = neu, sonst Beitrags-ID
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try { setData(await api(API)) } catch (e) { setMsg({ ok: false, text: e.message }) }
  }, [])
  useEffect(() => { load() }, [load])

  async function loeschen(b) {
    if (!window.confirm(`Beitrag „${b.titel}“ löschen?${b.status === 'veroeffentlicht' ? ' Die Seite verschwindet sofort von der Website und aus der Sitemap.' : ''}`)) return
    setBusy(true); setMsg(null)
    try { await api(`${API}/${b.id}`, { method: 'DELETE' }); setMsg({ ok: true, text: `„${b.titel}“ gelöscht.` }); await load() }
    catch (e) { setMsg({ ok: false, text: e.message }) }
    finally { setBusy(false) }
  }
  async function vorschauAus(b) {
    try { const d = await api(`${API}/${b.id}`); vorschau(d, b.id) } catch (e) { setMsg({ ok: false, text: e.message }) }
  }

  if (offen !== undefined && data) {
    return <Editor key={offen || 'neu'} id={offen} limits={data.limits} sparten={data.sparten} onFertig={() => { setOffen(undefined); load() }} />
  }
  if (!data) return <div style={{ color: 'var(--text3)', padding: 32 }}>{msg ? msg.text : 'Lädt…'}</div>

  const th = { textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid var(--border)' }
  const td = { padding: '10px', fontSize: 13, color: 'var(--text1)', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' }

  return (
    <div style={{ maxWidth: 980, paddingBottom: 40 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text1)', margin: 0 }}>Aktuelles</h1>
          <p style={{ fontSize: 13, color: 'var(--text3)', margin: '4px 0 0' }}>Beiträge unter <a href={`${SITE}/news/`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--r2, var(--r))' }}>randl.group/news/</a>: neue Zelte und Pakete, Messen, Referenz-Aufbauten.</p>
        </div>
        <button type="button" style={primary} onClick={() => setOffen(null)}>Neuer Beitrag</button>
      </div>

      {msg && <div role="status" style={{ marginBottom: 12, fontSize: 13, color: msg.ok ? 'var(--green, var(--text1))' : 'var(--r2, var(--r))' }}>{msg.text}</div>}

      {!data.beitraege.length ? (
        <div style={{ ...box, color: 'var(--text3)', fontSize: 13 }}>Noch kein Beitrag. Mit „Neuer Beitrag“ legen Sie den ersten an.</div>
      ) : (
        <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 9, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead><tr><th style={th}>Titel</th><th style={th}>Sparte</th><th style={th}>Datum</th><th style={th}>Status</th><th style={{ ...th, textAlign: 'right' }}>Aktionen</th></tr></thead>
            <tbody>
              {data.beitraege.map(b => (
                <tr key={b.id}>
                  <td style={td}>
                    <button type="button" onClick={() => setOffen(b.id)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text1)', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>{b.titel}</button>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>/news/{b.slug}/{b.veranstaltung ? ' · Veranstaltung' : ''}</div>
                  </td>
                  <td style={td}>{SPARTE_KURZ[b.sparte] || b.sparte}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{datumDe(b.datum)}</td>
                  <td style={td}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap',
                      background: b.status === 'veroeffentlicht' ? 'rgba(46,160,67,.15)' : 'var(--bg3)', color: b.status === 'veroeffentlicht' ? 'var(--green, #2ea043)' : 'var(--text2)' }}>{STATUS[b.status]}</span>
                  </td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button type="button" style={btn} onClick={() => setOffen(b.id)}>Bearbeiten</button>{' '}
                    <button type="button" style={btn} onClick={() => vorschauAus(b)}>Vorschau</button>{' '}
                    <button type="button" style={btn} disabled={busy} onClick={() => loeschen(b)}>Löschen</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p style={{ fontSize: 12, color: 'var(--text3)', margin: '12px 0 0' }}>Entwürfe sind öffentlich nicht sichtbar. Bilder verwalten Sie unter Bilderverwaltung → Aktuelles oder direkt im Beitrag.</p>
    </div>
  )
}
