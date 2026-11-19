// Kundengalerie randl.group/zelt/galerie/ – Bilder sichten, löschen, hinzufügen, Kategorien pflegen.
// Backend: /api/content/galerie (src/services/galerie.js)

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

const BASE = 'https://randl.group/zelt/galerie/';
const API  = '/api/content/galerie';
// Nach dem Verpixeln heißt die Datei name.vN.webp (neuer Pfad → kein Cache liefert die alte Fassung)
const phys = b => (b.v ? b.file.replace(/\.webp$/, `.v${b.v}.webp`) : b.file);
const thumbUrl = b => (b.ausgeblendet ? `${API}/papierkorb/${b.file}` : `${BASE}img/thumb/${phys(b)}`);
const fullUrl  = b => `${BASE}img/full/${phys(b)}`;
const faces = b => (b.boxen || []).length;

const btn = (variant = 'neutral', extra = {}) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', fontSize: 12, fontWeight: 500,
  borderRadius: 7, cursor: 'pointer', whiteSpace: 'nowrap',
  ...(variant === 'danger'  ? { background: 'var(--r)', border: '1px solid var(--r)', color: '#fff' } :
      variant === 'primary' ? { background: 'var(--r)', border: '1px solid var(--r)', color: '#fff' } :
      variant === 'green'   ? { background: 'var(--green, #3a8a5a)', border: '1px solid transparent', color: '#fff' } :
      variant === 'ghost'   ? { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text2)' } :
                              { background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text2)' }),
  ...extra,
});
const input = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', fontSize: 13, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg1)', color: 'var(--text1)' };
const label = { display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text3)', margin: '0 0 5px' };

const IconTrash = ({ s = 14 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
);
const IconFace = ({ s = 12 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r=".6" fill="currentColor"/><circle cx="15" cy="10" r=".6" fill="currentColor"/><path d="M8.5 15c1 1 2.2 1.5 3.5 1.5s2.5-.5 3.5-1.5"/></svg>
);
const IconPlus = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>);

async function call(url, opts) {
  const res = await fetch(url, opts);
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || `Fehler ${res.status}`);
  return d;
}
const postJson = (weg, body) => call(`${API}/${weg}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

function Modal({ title, onClose, children, width = 560 }) {
  useEffect(() => {
    const k = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 16px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: width, background: 'var(--bg1)', borderRadius: 12, border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text1)' }}>{title}</h3>
          <button onClick={onClose} aria-label="Schließen" style={{ border: 'none', background: 'none', fontSize: 20, lineHeight: 1, cursor: 'pointer', color: 'var(--text3)' }}>×</button>
        </div>
        <div style={{ padding: 18 }}>{children}</div>
      </div>
    </div>
  );
}

// ── Bilder hinzufügen ───────────────────────────────────────────────
function UploadDialog({ alben, startAlbum, onClose, onDone }) {
  const [files, setFiles]     = useState([]);
  const [album, setAlbum]     = useState(startAlbum || alben[0]?.id || '');
  const [caption, setCaption] = useState('');
  const [busy, setBusy]       = useState(false);
  const [err, setErr]         = useState(null);
  const [drag, setDrag]       = useState(false);
  const ref = useRef();
  const previews = useMemo(() => files.map(f => ({ f, url: URL.createObjectURL(f) })), [files]);
  useEffect(() => () => previews.forEach(p => URL.revokeObjectURL(p.url)), [previews]);

  const add = list => {
    const ok = [...list].filter(f => /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name) || /^image\//.test(f.type));
    setFiles(prev => [...prev, ...ok].slice(0, 20));
  };
  const submit = async () => {
    setBusy(true); setErr(null);
    const fd = new FormData();
    fd.append('album', album); fd.append('caption', caption);
    files.forEach(f => fd.append('bilder', f));
    try { onDone(await call(`${API}/hochladen`, { method: 'POST', body: fd })); }
    catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <Modal title="Bilder hinzufügen" onClose={busy ? () => {} : onClose}>
      <div onClick={() => ref.current.click()}
        onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}
        style={{ border: `2px dashed ${drag ? 'var(--r)' : 'var(--border)'}`, borderRadius: 10, padding: '22px 12px', textAlign: 'center', cursor: 'pointer', background: drag ? 'rgba(184,49,31,.05)' : 'var(--bg2)', marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: 'var(--text2)' }}>Bilder hierher ziehen oder <span style={{ color: 'var(--r2)', fontWeight: 600 }}>auswählen</span></div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>JPG, PNG, WebP, HEIC · bis 20 Bilder · je max. 30 MB · GPS/EXIF werden entfernt</div>
        <input ref={ref} type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,.heic,.heif" style={{ display: 'none' }} onChange={e => { add(e.target.files); e.target.value = ''; }} />
      </div>

      {!!previews.length && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 6, marginBottom: 14 }}>
          {previews.map((p, i) => (
            <div key={i} style={{ position: 'relative', aspectRatio: '1', borderRadius: 6, overflow: 'hidden', background: 'var(--bg3)' }}>
              <img src={p.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />
              <button onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label="Entfernen"
                style={{ position: 'absolute', top: 3, right: 3, width: 20, height: 20, borderRadius: 4, border: 'none', background: 'rgba(0,0,0,.6)', color: '#fff', cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>×</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div>
          <label style={label}>Kategorie</label>
          <select value={album} onChange={e => setAlbum(e.target.value)} style={input}>
            {alben.map(a => <option key={a.id} value={a.id}>{a.titel}</option>)}
          </select>
        </div>
        <div>
          <label style={label}>Beschriftung (optional)</label>
          <input value={caption} onChange={e => setCaption(e.target.value)} maxLength={80} placeholder="z. B. Hochzeit Seeon 2026" style={input} />
        </div>
      </div>

      {err && <div style={{ fontSize: 12, color: 'var(--red2)', marginBottom: 12 }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button style={btn('ghost')} onClick={onClose} disabled={busy}>Abbrechen</button>
        <button style={btn('primary', { opacity: files.length && album && !busy ? 1 : .5 })} disabled={!files.length || !album || busy} onClick={submit}>
          {busy ? `Lädt ${files.length} Bild(er) hoch…` : `${files.length || ''} Bild${files.length === 1 ? '' : 'er'} hochladen`}
        </button>
      </div>
    </Modal>
  );
}

// ── Kategorien bearbeiten ───────────────────────────────────────────
function KategorienDialog({ alben, papierkorb, onClose, onDone }) {
  const [liste, setListe] = useState(alben.map(a => ({ ...a })));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const imKorb = id => papierkorb.filter(b => b.album === id).length;
  const set = (i, patch) => setListe(l => l.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const swap = (i, j) => setListe(l => { const n = [...l]; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const save = async () => {
    setBusy(true); setErr(null);
    try { onDone(await call(`${API}/alben`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ alben: liste.map(a => (a.id ? { id: a.id, titel: a.titel } : { titel: a.titel })) }) })); }
    catch (e) { setErr(e.message); setBusy(false); }
  };
  const small = { width: 28, height: 30, padding: 0, justifyContent: 'center' };

  return (
    <Modal title="Kategorien bearbeiten" onClose={busy ? () => {} : onClose} width={620}>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text3)' }}>
        Name und Reihenfolge erscheinen so auf randl.group. Löschen geht nur bei leeren Kategorien, die nicht an einem Nextcloud-Ordner hängen.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        {liste.map((a, i) => {
          const korb = a.id ? imKorb(a.id) : 0;
          const sperre = a.anzahl ? `${a.anzahl} Bilder` : korb ? `${korb} im Papierkorb` : a.nextcloud?.length ? 'Nextcloud-Ordner' : null;
          return (
            <div key={a.id || `neu-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button style={btn('ghost', small)} disabled={i === 0} onClick={() => swap(i, i - 1)} aria-label="Nach oben">↑</button>
              <button style={btn('ghost', small)} disabled={i === liste.length - 1} onClick={() => swap(i, i + 1)} aria-label="Nach unten">↓</button>
              <input value={a.titel} onChange={e => set(i, { titel: e.target.value })} maxLength={60} style={{ ...input, flex: 1 }} />
              <span title={a.nextcloud?.length ? `Nextcloud: Photos/${a.nextcloud.join(', Photos/')}` : ''}
                style={{ fontSize: 11, color: 'var(--text3)', width: 92, textAlign: 'right' }}>
                {a.id ? `${a.anzahl} Bilder${a.nextcloud?.length ? ' · NC' : ''}` : 'neu'}
              </span>
              <button style={btn('ghost', { ...small, color: sperre ? 'var(--text3)' : 'var(--r2)', opacity: sperre ? .45 : 1 })}
                disabled={!!sperre} title={sperre ? `Nicht löschbar: ${sperre}` : 'Kategorie löschen'}
                onClick={() => setListe(l => l.filter((_, j) => j !== i))} aria-label="Löschen"><IconTrash /></button>
            </div>
          );
        })}
      </div>
      <button style={btn('ghost')} onClick={() => setListe(l => [...l, { titel: '', anzahl: 0 }])}><IconPlus /> Neue Kategorie</button>
      {err && <div style={{ fontSize: 12, color: 'var(--red2)', marginTop: 12 }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button style={btn('ghost')} onClick={onClose} disabled={busy}>Abbrechen</button>
        <button style={btn('primary', { opacity: busy ? .5 : 1 })} disabled={busy || liste.some(a => !a.titel.trim())} onClick={save}>{busy ? 'Speichert…' : 'Speichern'}</button>
      </div>
    </Modal>
  );
}

// ── Hauptansicht ────────────────────────────────────────────────────
export default function GalerieVerwaltung() {
  const [data, setData]       = useState(null);
  const [error, setError]     = useState(null);
  const [ansicht, setAnsicht] = useState('online');   // online | papierkorb
  const [album, setAlbum]     = useState('alle');
  const [auswahl, setAuswahl] = useState(new Set());
  const [busy, setBusy]       = useState(false);
  const [msg, setMsg]         = useState(null);
  const [gross, setGross]     = useState(null);
  const [dialog, setDialog]   = useState(null);       // upload | kategorien
  const [nurGesichter, setNurGesichter] = useState(false);
  const [rahmen, setRahmen]   = useState(true);       // Gesichter in der Großansicht markieren

  const load = useCallback(async () => {
    try { setData(await call(`${API}/list`)); setError(null); }
    catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const titel  = useMemo(() => Object.fromEntries((data?.alben || []).map(a => [a.id, a.titel])), [data]);
  const quelle = ansicht === 'online' ? (data?.bilder || []) : (data?.ausgeblendet || []);
  const imAlbum = album === 'alle' ? quelle : quelle.filter(b => b.album === album);
  const liste  = nurGesichter ? imAlbum.filter(b => faces(b)) : imAlbum;
  const mitGesichtern = imAlbum.filter(b => faces(b)).length;
  const ungeprueft = (data?.bilder || []).filter(b => !b.boxen).length;

  const toggle  = f => setAuswahl(prev => { const n = new Set(prev); n.has(f) ? n.delete(f) : n.add(f); return n; });
  const wechsel = v => { setAnsicht(v); setAuswahl(new Set()); setGross(null); setAlbum('alle'); setNurGesichter(false); };
  const flash   = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 6000); };

  const run = async (fn, text) => {
    setBusy(true);
    try { const d = await fn(); flash('ok', text(d)); setAuswahl(new Set()); await load(); return d; }
    catch (e) { flash('err', e.message); }
    finally { setBusy(false); }
  };
  const loeschen = (files, frage = true) => {
    if (!files.length) return Promise.resolve();
    if (frage && files.length > 1 && !window.confirm(`${files.length} Bilder von randl.group nehmen?\n\nSie landen im Papierkorb und lassen sich wiederherstellen.`)) return Promise.resolve();
    return run(() => postJson('ausblenden', { files }), d => `${d.ausgeblendet} Bild(er) gelöscht (Papierkorb) – online sind jetzt ${d.sichtbar}.`);
  };
  const wiederherstellen = files => run(() => postJson('einblenden', { files }),
    d => `${d.wiederhergestellt} Bild(er) wieder online${d.fehlend ? `, ${d.fehlend} kommen beim nächsten Galerie-Lauf zurück` : ''}.`);
  const endgueltig = files => {
    if (!window.confirm(`${files.length} Bild(er) endgültig löschen?\n\nDas lässt sich nicht rückgängig machen. Fotos aus der Nextcloud bleiben dort erhalten, kommen aber nicht mehr in die Galerie.`)) return;
    run(() => postJson('endgueltig', { files }), d => `${d.geloescht} Bild(er) endgültig gelöscht.`);
  };
  const verpixeln = files => run(() => postJson('verpixeln', { files }),
    d => `${d.verpixelt} Bild(er) verpixelt${d.uebersprungen ? `, ${d.uebersprungen} ohne erkannte Gesichter übersprungen` : ''}. Das Original bleibt gesichert.`);
  const entpixeln = files => run(() => postJson('entpixeln', { files }),
    d => `${d.entpixelt} Bild(er) wieder im Original${d.fehlend ? `, bei ${d.fehlend} fehlt das Original` : ''}.`);
  const verschieben = (files, ziel) => run(() => postJson('verschieben', { files, album: ziel }),
    d => `${d.verschoben} Bild(er) nach „${titel[ziel]}“ verschoben.`);

  // Großansicht: ← → blättern, Entf löschen, Esc schließen
  useEffect(() => {
    if (!gross) return;
    const onKey = e => {
      if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
      const i = liste.findIndex(b => b.file === gross);
      if (e.key === 'Escape') setGross(null);
      else if (e.key === 'ArrowRight' && liste[i + 1]) setGross(liste[i + 1].file);
      else if (e.key === 'ArrowLeft' && liste[i - 1]) setGross(liste[i - 1].file);
      else if ((e.key === 'Delete' || e.key === 'Backspace') && !busy && i >= 0) {
        const next = liste[i + 1] || liste[i - 1];
        loeschen([gross], false).then(() => setGross(next ? next.file : null));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (error) return <div style={{ background: 'rgba(224,80,80,0.1)', border: '1px solid var(--red2)', borderRadius: 9, padding: 16, color: 'var(--red2)', fontSize: 13 }}>Fehler: {error}</div>;
  if (!data) return <div style={{ color: 'var(--text3)', padding: 32, textAlign: 'center', fontSize: 13 }}>Lädt…</div>;

  const alleGewaehlt = liste.length > 0 && liste.every(b => auswahl.has(b.file));
  const grossBild = gross && liste.find(b => b.file === gross);
  const grossIdx  = grossBild ? liste.indexOf(grossBild) : -1;
  const online = ansicht === 'online';

  return (
    <div>
      {/* Kopf */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text1)' }}>Kundengalerie</h3>
        <a href={BASE} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--text3)', background: 'var(--bg3)', padding: '2px 8px', borderRadius: 4, textDecoration: 'none' }}>randl.group/zelt/galerie/ ↗</a>
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>Stand {new Date(data.geaendert || data.erstellt).toLocaleString('de-DE')}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={btn()} onClick={() => setDialog('kategorien')}>Kategorien bearbeiten</button>
          <button style={btn('primary')} onClick={() => setDialog('upload')}><IconPlus /> Bilder hinzufügen</button>
        </div>
      </div>

      {/* Online / Papierkorb */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
        {[['online', `Online (${data.bilder.length})`], ['papierkorb', `Papierkorb (${data.ausgeblendet.length})`]].map(([id, text]) => (
          <button key={id} onClick={() => wechsel(id)} style={{ padding: '7px 12px', fontSize: 13, border: 'none', background: 'transparent', cursor: 'pointer', marginBottom: -1,
            borderBottom: ansicht === id ? '2px solid var(--r)' : '2px solid transparent', color: ansicht === id ? 'var(--text1)' : 'var(--text2)', fontWeight: ansicht === id ? 600 : 400 }}>{text}</button>
        ))}
      </div>

      {/* Kategorie-Filter */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {[{ id: 'alle', titel: 'Alle' }, ...data.alben].map(a => {
          const n = a.id === 'alle' ? quelle.length : quelle.filter(b => b.album === a.id).length;
          if (a.id !== 'alle' && !n && !(online && !a.nextcloud?.length)) return null;   // leere eigene Kategorien trotzdem zeigen
          const on = album === a.id;
          return (
            <button key={a.id} onClick={() => { setAlbum(a.id); setAuswahl(new Set()); }} style={{ padding: '4px 11px', fontSize: 12, borderRadius: 999, cursor: 'pointer',
              border: `1px solid ${on ? 'var(--r)' : 'var(--border)'}`, background: on ? 'var(--r)' : 'var(--bg1)', color: on ? '#fff' : 'var(--text2)' }}>
              {a.titel} <span style={{ opacity: .7 }}>{n}</span>
            </button>
          );
        })}
      </div>

      {/* Aktionsleiste */}
      <div style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '9px 12px', marginBottom: 12,
        background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 9 }}>
        <button style={btn()} disabled={!liste.length} onClick={() => setAuswahl(alleGewaehlt ? new Set() : new Set(liste.map(b => b.file)))}>
          {alleGewaehlt ? 'Auswahl aufheben' : 'Alle wählen'}
        </button>
        <span style={{ fontSize: 12, color: 'var(--text2)' }}>{auswahl.size} ausgewählt</span>
        <button onClick={() => { setNurGesichter(!nurGesichter); setAuswahl(new Set()); }} disabled={!mitGesichtern && !nurGesichter}
          style={btn(nurGesichter ? 'primary' : 'ghost', { padding: '5px 10px', opacity: mitGesichtern || nurGesichter ? 1 : .45 })}>
          <IconFace /> Mit Gesichtern ({mitGesichtern})
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap', opacity: auswahl.size && !busy ? 1 : .45, pointerEvents: auswahl.size && !busy ? 'auto' : 'none' }}>
          {online ? (
            <>
              <select value="" onChange={e => e.target.value && verschieben([...auswahl], e.target.value)} style={{ ...input, width: 'auto', padding: '6px 8px', fontSize: 12 }}>
                <option value="">Kategorie ändern…</option>
                {data.alben.map(a => <option key={a.id} value={a.id}>→ {a.titel}</option>)}
              </select>
              <button style={btn()} onClick={() => verpixeln([...auswahl])}><IconFace /> Gesichter verpixeln</button>
              <button style={btn('danger')} onClick={() => loeschen([...auswahl])}><IconTrash /> Löschen ({auswahl.size})</button>
            </>
          ) : (
            <>
              <button style={btn('ghost', { color: 'var(--r2)' })} onClick={() => endgueltig([...auswahl])}><IconTrash /> Endgültig löschen</button>
              <button style={btn('green')} onClick={() => wiederherstellen([...auswahl])}>Wiederherstellen ({auswahl.size})</button>
            </>
          )}
        </div>
        {msg && <div style={{ flexBasis: '100%', fontSize: 12, color: msg.type === 'ok' ? 'var(--green, #3a8a5a)' : 'var(--red2)' }}>{msg.text}</div>}
      </div>

      <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text3)' }}>
        {online
          ? `Klick aufs Bild = auswählen · Papierkorb-Symbol = sofort löschen · ⤢ = groß ansehen (← → blättern, Entf = löschen). Gelöschte Bilder bleiben auch nach dem nächsten Galerie-Lauf draußen.${ungeprueft ? ` ${ungeprueft} Bild(er) noch nicht auf Gesichter geprüft – passiert beim nächsten Galerie-Lauf.` : ''}`
          : 'Gelöschte Bilder sind nicht mehr auf randl.group. Wiederherstellen bringt sie zurück, endgültig löschen entfernt die Dateien.'}
      </p>

      {/* Raster */}
      {!liste.length ? (
        <div style={{ color: 'var(--text3)', padding: 32, textAlign: 'center', fontSize: 13 }}>
          {online ? <>Keine Bilder in dieser Kategorie. <button style={btn('ghost', { marginLeft: 8 })} onClick={() => setDialog('upload')}><IconPlus /> Bilder hinzufügen</button></> : 'Der Papierkorb ist leer.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10 }}>
          {liste.map(b => {
            const sel = auswahl.has(b.file);
            return (
              <div key={b.file} className="gv-tile" onClick={() => toggle(b.file)} title={b.alt}
                style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', cursor: 'pointer', background: 'var(--bg2)', aspectRatio: '4/3',
                  outline: sel ? '3px solid var(--r)' : '1px solid var(--border)', outlineOffset: sel ? -3 : -1 }}>
                <img src={thumbUrl(b)} alt={b.alt} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: sel ? .75 : 1 }} />
                <span style={{ position: 'absolute', top: 6, left: 6, width: 20, height: 20, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: sel ? 'var(--r)' : 'rgba(255,255,255,.85)', border: '1px solid rgba(0,0,0,.15)', color: '#fff', fontSize: 13, fontWeight: 700 }}>{sel ? '✓' : ''}</span>
                {(faces(b) > 0 || b.verpixelt) && (
                  <span title={b.verpixelt ? 'Gesichter verpixelt' : `${faces(b)} Gesicht(er) erkannt`} style={{ position: 'absolute', bottom: 24, left: 6, display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 600,
                    background: b.verpixelt ? 'rgba(58,138,90,.92)' : 'rgba(0,0,0,.65)', color: '#fff', padding: '2px 6px', borderRadius: 4 }}>
                    <IconFace s={11} />{b.verpixelt ? 'verpixelt' : faces(b)}
                  </span>
                )}
                {b.hochgeladen && <span style={{ position: 'absolute', top: 7, left: 32, fontSize: 9, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', background: 'var(--green, #3a8a5a)', color: '#fff', padding: '2px 5px', borderRadius: 3 }}>Upload</span>}
                {online && (
                  <div className="gv-tools" style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4 }}>
                    <button onClick={e => { e.stopPropagation(); loeschen([b.file], false); }} aria-label="Löschen" title="Löschen (Papierkorb)"
                      style={{ width: 26, height: 26, borderRadius: 6, border: 'none', cursor: 'pointer', background: 'rgba(184,49,31,.9)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IconTrash s={13} /></button>
                    <button onClick={e => { e.stopPropagation(); setGross(b.file); }} aria-label="Groß ansehen" title="Groß ansehen"
                      style={{ width: 26, height: 26, borderRadius: 6, border: 'none', cursor: 'pointer', background: 'rgba(0,0,0,.55)', color: '#fff', fontSize: 13 }}>⤢</button>
                  </div>
                )}
                <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 7px 5px', fontSize: 10, color: '#fff', background: 'linear-gradient(transparent, rgba(0,0,0,.6))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {titel[b.album] || b.album}{b.caption ? ` · ${b.caption}` : ''}{b.ausgeblendet ? ` · gelöscht ${new Date(b.ausgeblendet).toLocaleDateString('de-DE')}` : ''}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <style>{`.gv-tile .gv-tools{opacity:0;transition:opacity .15s}.gv-tile:hover .gv-tools,.gv-tile:focus-within .gv-tools{opacity:1}@media (hover:none){.gv-tile .gv-tools{opacity:1}}`}</style>

      {/* Großansicht */}
      {grossBild && (
        <div onClick={() => setGross(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.9)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ position: 'relative', display: 'inline-block', lineHeight: 0 }}>
            <img src={fullUrl(grossBild)} alt={grossBild.alt} style={{ display: 'block', maxWidth: '92vw', maxHeight: '76vh', borderRadius: 6 }} />
            {rahmen && !grossBild.verpixelt && (grossBild.boxen || []).map(([x, y, w, h], i) => (
              <span key={i} style={{ position: 'absolute', left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%`,
                border: '2px solid #ffd23f', borderRadius: 4, boxShadow: '0 0 0 1px rgba(0,0,0,.6)', pointerEvents: 'none' }} />
            ))}
          </div>
          <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button style={btn()} disabled={grossIdx <= 0} onClick={() => setGross(liste[grossIdx - 1].file)}>‹ Zurück</button>
            <span style={{ color: '#ccc', fontSize: 12 }}>{grossBild.caption ? `${grossBild.caption} · ` : ''}{grossIdx + 1}/{liste.length}</span>
            <button style={btn()} disabled={grossIdx >= liste.length - 1} onClick={() => setGross(liste[grossIdx + 1].file)}>Weiter ›</button>
            <select value={grossBild.album} disabled={busy} onChange={async e => {
              const ziel = e.target.value, next = liste[grossIdx + 1] || liste[grossIdx - 1];
              await verschieben([grossBild.file], ziel);
              setGross(album === 'alle' ? null : next ? next.file : null);
            }} style={{ ...input, width: 'auto', padding: '6px 8px', fontSize: 12 }} title="Kategorie">
              {data.alben.map(a => <option key={a.id} value={a.id}>{a.titel}</option>)}
            </select>
            {grossBild.verpixelt
              ? <button style={btn()} disabled={busy} onClick={() => entpixeln([grossBild.file])}><IconFace /> Verpixelung aufheben</button>
              : faces(grossBild) > 0 && <>
                  <button style={btn()} onClick={() => setRahmen(!rahmen)}>{rahmen ? 'Markierung aus' : `${faces(grossBild)} Gesicht(er) zeigen`}</button>
                  <button style={btn('primary')} disabled={busy} onClick={() => verpixeln([grossBild.file])}><IconFace /> Gesichter verpixeln</button>
                </>}
            <button style={btn('danger')} disabled={busy} onClick={() => {
              const next = liste[grossIdx + 1] || liste[grossIdx - 1];
              loeschen([grossBild.file], false).then(() => setGross(next ? next.file : null));
            }}><IconTrash /> Löschen (Entf)</button>
            <button style={btn()} onClick={() => setGross(null)}>Schließen</button>
          </div>
        </div>
      )}

      {dialog === 'upload' && (
        <UploadDialog alben={data.alben} startAlbum={album !== 'alle' ? album : null} onClose={() => setDialog(null)}
          onDone={async d => { setDialog(null); flash('ok', `${d.hinzugefuegt} Bild(er) hinzugefügt${d.doppelt ? `, ${d.doppelt} waren schon vorhanden` : ''}.`); await load(); }} />
      )}
      {dialog === 'kategorien' && (
        <KategorienDialog alben={data.alben} papierkorb={data.ausgeblendet} onClose={() => setDialog(null)}
          onDone={async () => { setDialog(null); flash('ok', 'Kategorien gespeichert.'); await load(); }} />
      )}
    </div>
  );
}
