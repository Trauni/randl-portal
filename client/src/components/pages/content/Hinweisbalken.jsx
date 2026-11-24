import { useState, useEffect, useMemo } from 'react'

const STYLES = [
  { id: 'rot',    label: 'Rot (Standard)' },
  { id: 'dunkel', label: 'Dunkel' },
  { id: 'hell',   label: 'Hell' },
]
const LIMITS = { badge: 20, text: 160, linkLabel: 40 }

const VORLAGEN = [
  { id: 'messe', label: 'Messe', v: {
    badge: 'Messe', text: "Rosenheimer Hochzeitsmesse · 28. + 29. November 2026 · KU'KO Rosenheim",
    linkUrl: '/news/hochzeitsmesse-rosenheim-2026/', linkLabel: 'Besuchen Sie uns', style: 'rot' } },
  { id: 'urlaub', label: 'Betriebsurlaub', v: {
    badge: 'Hinweis', text: 'Unser Büro ist im Betriebsurlaub. Anfragen beantworten wir danach.',
    linkUrl: '/kontakt/', linkLabel: 'Kontakt', style: 'dunkel' } },
  { id: 'feiertag', label: 'Feiertag', v: {
    badge: 'Hinweis', text: 'Am Feiertag ist unser Büro nicht besetzt.',
    linkUrl: '', linkLabel: '', style: 'hell' } },
]

// ISO (UTC) <-> Wert für <input type="datetime-local"> (lokale Zeit)
function isoToLocal(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
function localToIso(v) {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
function fmt(iso) {
  return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Fallback-Farben wie in site-banner.js (nur Vorschau)
const PREVIEW = {
  rot:    { bg: 'var(--r, #a83020)', fg: '#fff', badgeBg: '#fff', badgeFg: 'var(--r, #a83020)' },
  dunkel: { bg: '#1c1c1c', fg: '#fff', badgeBg: '#fff', badgeFg: '#1c1c1c' },
  hell:   { bg: '#f1ebe0', fg: '#1c1c1c', badgeBg: '#1c1c1c', badgeFg: '#fff' },
}

function Vorschau({ cfg }) {
  const c = PREVIEW[cfg.style] || PREVIEW.rot
  return (
    <div role="region" aria-label="Vorschau" style={{
      background: c.bg, color: c.fg, minHeight: 44, padding: '6px 14px', display: 'flex',
      flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 10, textAlign: 'center',
      fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, textTransform: 'uppercase',
      letterSpacing: '.12em', fontSize: 14, borderRadius: 7,
    }}>
      {cfg.badge && <span style={{ background: c.badgeBg, color: c.badgeFg, borderRadius: 999, padding: '2px 10px', fontSize: 12 }}>{cfg.badge}</span>}
      <span>{cfg.text || 'Ihr Text erscheint hier'}</span>
      {cfg.linkUrl && cfg.linkLabel && <span style={{ textDecoration: 'underline' }}>{cfg.linkLabel} →</span>}
    </div>
  )
}

const label = { display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 4 }
const input = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', fontSize: 13, background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text1)' }
const counter = (n, max) => <span style={{ float: 'right', color: n > max ? 'var(--r)' : 'var(--text3)' }}>{n}/{max}</span>

export default function Hinweisbalken() {
  const [cfg, setCfg] = useState(null)
  const [meta, setMeta] = useState(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    fetch('/api/content/hinweis')
      .then(r => r.json())
      .then(d => { setCfg(d); setMeta({ updatedAt: d.updatedAt, updatedBy: d.updatedBy }) })
      .catch(() => setMsg({ ok: false, text: 'Laden fehlgeschlagen' }))
  }, [])

  const set = (k, v) => setCfg(c => ({ ...c, [k]: v }))

  const status = useMemo(() => {
    if (!cfg) return ''
    if (!cfg.enabled) return 'Aus'
    const now = Date.now()
    if (cfg.endAt && Date.parse(cfg.endAt) <= now) return 'Abgelaufen'
    if (cfg.startAt && Date.parse(cfg.startAt) > now) return `Geplant ab ${fmt(cfg.startAt)}`
    return cfg.endAt ? `Sichtbar bis ${fmt(cfg.endAt)}` : 'Sichtbar (ohne Ende)'
  }, [cfg])

  async function save() {
    setSaving(true); setMsg(null)
    try {
      const body = { enabled: !!cfg.enabled, badge: cfg.badge || '', text: cfg.text || '', linkUrl: cfg.linkUrl || '',
        linkLabel: cfg.linkLabel || '', style: cfg.style || 'rot', startAt: cfg.startAt || null, endAt: cfg.endAt || null }
      const r = await fetch('/api/content/hinweis', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Speichern fehlgeschlagen')
      setCfg(d); setMeta({ updatedAt: d.updatedAt, updatedBy: d.updatedBy })
      setMsg({ ok: true, text: 'Gespeichert. Änderung ist nach ca. 1–5 Minuten auf der Website sichtbar.' })
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    } finally { setSaving(false) }
  }

  if (!cfg) return <div style={{ color: 'var(--text3)', padding: 32 }}>{msg ? msg.text : 'Lädt…'}</div>

  return (
    <div style={{ maxWidth: 760, paddingBottom: 40 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text1)', margin: 0 }}>Hinweisbalken Website</h1>
        <p style={{ fontSize: 13, color: 'var(--text3)', margin: '4px 0 0' }}>Schmaler Balken oben auf allen Seiten von randl.group</p>
      </div>

      <div style={{ marginBottom: 16 }}><Vorschau cfg={cfg} /></div>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 20 }}>
        Status: <strong style={{ color: 'var(--text1)' }}>{status}</strong>
        {meta?.updatedAt && <span style={{ color: 'var(--text3)' }}> · zuletzt geändert {fmt(meta.updatedAt)}{meta.updatedBy ? ` von ${meta.updatedBy}` : ''}</span>}
      </div>

      <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 9, padding: 16, display: 'grid', gap: 14 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text1)', cursor: 'pointer' }}>
          <input type="checkbox" checked={!!cfg.enabled} onChange={e => set('enabled', e.target.checked)} />
          Balken einschalten
        </label>

        <div>
          <span style={label}>Vorlage (füllt nur das Formular)</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {VORLAGEN.map(v => (
              <button key={v.id} type="button" onClick={() => setCfg(c => ({ ...c, ...v.v }))}
                style={{ padding: '5px 12px', fontSize: 12, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text2)', cursor: 'pointer' }}>{v.label}</button>
            ))}
          </div>
        </div>

        <div>
          <label style={label} htmlFor="hb-badge">Badge (optional){counter((cfg.badge || '').length, LIMITS.badge)}</label>
          <input id="hb-badge" style={input} value={cfg.badge || ''} onChange={e => set('badge', e.target.value)} />
        </div>
        <div>
          <label style={label} htmlFor="hb-text">Text{counter((cfg.text || '').length, LIMITS.text)}</label>
          <textarea id="hb-text" rows={2} style={{ ...input, resize: 'vertical' }} value={cfg.text || ''} onChange={e => set('text', e.target.value)} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label style={label} htmlFor="hb-url">Link-Ziel (/pfad oder https://…)</label>
            <input id="hb-url" style={input} value={cfg.linkUrl || ''} onChange={e => set('linkUrl', e.target.value)} />
          </div>
          <div>
            <label style={label} htmlFor="hb-lbl">Link-Text{counter((cfg.linkLabel || '').length, LIMITS.linkLabel)}</label>
            <input id="hb-lbl" style={input} value={cfg.linkLabel || ''} onChange={e => set('linkLabel', e.target.value)} />
          </div>
        </div>
        <div>
          <label style={label} htmlFor="hb-style">Stil</label>
          <select id="hb-style" style={input} value={cfg.style || 'rot'} onChange={e => set('style', e.target.value)}>
            {STYLES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label style={label} htmlFor="hb-von">Sichtbar ab (optional)</label>
            <input id="hb-von" type="datetime-local" style={input} value={isoToLocal(cfg.startAt)} onChange={e => set('startAt', localToIso(e.target.value))} />
          </div>
          <div>
            <label style={label} htmlFor="hb-bis">Sichtbar bis (optional)</label>
            <input id="hb-bis" type="datetime-local" style={input} value={isoToLocal(cfg.endAt)} onChange={e => set('endAt', localToIso(e.target.value))} />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
        <button type="button" onClick={save} disabled={saving}
          style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, background: 'var(--r)', border: 'none', borderRadius: 7, color: '#fff', cursor: saving ? 'default' : 'pointer', opacity: saving ? .6 : 1 }}>
          {saving ? 'Speichert…' : 'Speichern'}
        </button>
        <span style={{ fontSize: 12, color: 'var(--text3)' }}>Änderung ist nach ca. 1–5 Minuten auf der Website sichtbar.</span>
      </div>
      {msg && <div role="status" style={{ marginTop: 12, fontSize: 13, color: msg.ok ? 'var(--green, var(--text1))' : 'var(--r2, var(--r))' }}>{msg.text}</div>}
    </div>
  )
}
