// Kundengalerie randl.group/zelt/galerie/ – Bilder sichten, ausblenden, wiederherstellen.
// Backend: /api/content/galerie (src/services/galerie.js)

import React, { useState, useEffect, useCallback, useMemo } from 'react';

const BASE = 'https://randl.group/zelt/galerie/';
const thumbUrl = f => `${BASE}img/thumb/${f}`;
const fullUrl  = f => `${BASE}img/full/${f}`;

const btn = (variant = 'neutral') => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', fontSize: 12, fontWeight: 500,
  borderRadius: 7, cursor: 'pointer',
  ...(variant === 'danger'  ? { background: 'var(--r)', border: '1px solid var(--r)', color: '#fff' } :
      variant === 'primary' ? { background: 'var(--green, #3a8a5a)', border: '1px solid transparent', color: '#fff' } :
                              { background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text2)' }),
});

export default function GalerieVerwaltung() {
  const [data, setData]       = useState(null);
  const [error, setError]     = useState(null);
  const [ansicht, setAnsicht] = useState('sichtbar');   // sichtbar | ausgeblendet
  const [album, setAlbum]     = useState('alle');
  const [auswahl, setAuswahl] = useState(new Set());
  const [busy, setBusy]       = useState(false);
  const [msg, setMsg]         = useState(null);
  const [gross, setGross]     = useState(null);         // Dateiname für Großansicht

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/content/galerie/list');
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Laden fehlgeschlagen');
      setData(d); setError(null);
    } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const titel = useMemo(() => Object.fromEntries((data?.alben || []).map(a => [a.id, a.titel])), [data]);
  const quelle = ansicht === 'sichtbar' ? (data?.bilder || []) : (data?.ausgeblendet || []);
  const liste = album === 'alle' ? quelle : quelle.filter(b => b.album === album);
  const zaehler = id => quelle.filter(b => b.album === id).length;

  const toggle = f => setAuswahl(prev => { const n = new Set(prev); n.has(f) ? n.delete(f) : n.add(f); return n; });
  const wechsel = v => { setAnsicht(v); setAuswahl(new Set()); setGross(null); };
  const flash = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 5000); };

  const aktion = async (weg, files, ohneRueckfrage = false) => {
    if (!files.length) return;
    if (weg === 'ausblenden' && !ohneRueckfrage && !window.confirm(`${files.length} Bild(er) aus der Galerie auf randl.group nehmen?\n\nDie Bilder kommen in den Papierkorb und lassen sich unter „Ausgeblendet“ wiederherstellen.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/content/galerie/${weg}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Fehler');
      flash('ok', weg === 'ausblenden'
        ? `${d.ausgeblendet} Bild(er) ausgeblendet – online sind jetzt ${d.sichtbar}.`
        : `${d.wiederhergestellt} Bild(er) wieder online${d.fehlend ? `, ${d.fehlend} kommen beim nächsten Galerie-Lauf zurück` : ''}.`);
      setAuswahl(new Set()); setGross(null);
      await load();
    } catch (e) { flash('err', e.message); }
    setBusy(false);
  };

  // Tastatur in der Großansicht: ← → blättern, Entf ausblenden, Esc schließen
  useEffect(() => {
    if (!gross) return;
    const onKey = e => {
      const i = liste.findIndex(b => b.file === gross);
      if (e.key === 'Escape') setGross(null);
      else if (e.key === 'ArrowRight' && liste[i + 1]) setGross(liste[i + 1].file);
      else if (e.key === 'ArrowLeft' && liste[i - 1]) setGross(liste[i - 1].file);
      else if ((e.key === 'Delete' || e.key === 'Backspace') && !busy && i >= 0) {
        const next = liste[i + 1] || liste[i - 1];
        aktion('ausblenden', [gross], true).then(() => next && setGross(next.file));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (error) return <div style={{ background: 'rgba(224,80,80,0.1)', border: '1px solid var(--red2)', borderRadius: 9, padding: 16, color: 'var(--red2)', fontSize: 13 }}>Fehler: {error}</div>;
  if (!data) return <div style={{ color: 'var(--text3)', padding: 32, textAlign: 'center', fontSize: 13 }}>Lädt…</div>;

  const alleGewaehlt = liste.length > 0 && liste.every(b => auswahl.has(b.file));
  const grossBild = gross && quelle.find(b => b.file === gross);
  const grossIdx = grossBild ? liste.findIndex(b => b.file === gross) : -1;

  return (
    <div>
      {/* Kopf */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text1)' }}>Kundengalerie</h3>
        <a href={BASE} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--text3)', background: 'var(--bg3)', padding: '2px 8px', borderRadius: 4, textDecoration: 'none' }}>
          randl.group/zelt/galerie/ ↗
        </a>
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>
          Stand {new Date(data.geaendert || data.erstellt).toLocaleString('de-DE')}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: 3 }}>
          {[['sichtbar', `Online (${data.bilder.length})`], ['ausgeblendet', `Ausgeblendet (${data.ausgeblendet.length})`]].map(([id, label]) => (
            <button key={id} onClick={() => wechsel(id)} style={{ padding: '5px 12px', fontSize: 12, border: 'none', borderRadius: 6, cursor: 'pointer',
              background: ansicht === id ? 'var(--bg1)' : 'transparent', color: ansicht === id ? 'var(--text1)' : 'var(--text2)', fontWeight: ansicht === id ? 600 : 400,
              boxShadow: ansicht === id ? '0 1px 3px rgba(0,0,0,.1)' : 'none' }}>{label}</button>
          ))}
        </div>
      </div>

      {/* Album-Filter */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {[{ id: 'alle', titel: 'Alle' }, ...data.alben].map(a => {
          const n = a.id === 'alle' ? quelle.length : zaehler(a.id);
          if (a.id !== 'alle' && !n) return null;
          const on = album === a.id;
          return (
            <button key={a.id} onClick={() => setAlbum(a.id)} style={{ padding: '4px 11px', fontSize: 12, borderRadius: 999, cursor: 'pointer',
              border: `1px solid ${on ? 'var(--r)' : 'var(--border)'}`, background: on ? 'var(--r)' : 'var(--bg1)', color: on ? '#fff' : 'var(--text2)' }}>
              {a.titel} <span style={{ opacity: .7 }}>{n}</span>
            </button>
          );
        })}
      </div>

      {/* Aktionsleiste */}
      <div style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 12px', marginBottom: 14,
        background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 9 }}>
        <button style={btn()} onClick={() => setAuswahl(alleGewaehlt ? new Set() : new Set(liste.map(b => b.file)))} disabled={!liste.length}>
          {alleGewaehlt ? 'Auswahl aufheben' : 'Alle wählen'}
        </button>
        <span style={{ fontSize: 12, color: 'var(--text2)' }}>{auswahl.size} ausgewählt</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {ansicht === 'sichtbar'
            ? <button style={{ ...btn('danger'), opacity: auswahl.size && !busy ? 1 : .5 }} disabled={!auswahl.size || busy} onClick={() => aktion('ausblenden', [...auswahl])}>
                {busy ? '…' : `Ausblenden (${auswahl.size})`}
              </button>
            : <button style={{ ...btn('primary'), opacity: auswahl.size && !busy ? 1 : .5 }} disabled={!auswahl.size || busy} onClick={() => aktion('einblenden', [...auswahl])}>
                {busy ? '…' : `Wiederherstellen (${auswahl.size})`}
              </button>}
        </div>
        {msg && <div style={{ flexBasis: '100%', fontSize: 12, color: msg.type === 'ok' ? 'var(--green, #3a8a5a)' : 'var(--red2)' }}>{msg.text}</div>}
      </div>

      <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text3)' }}>
        Klick aufs Bild = auswählen · ⤢ = groß ansehen (← → blättern, Entf = ausblenden). Ausgeblendete Bilder bleiben auch nach dem nächsten Galerie-Lauf draußen.
      </p>

      {/* Raster */}
      {!liste.length ? (
        <div style={{ color: 'var(--text3)', padding: 32, textAlign: 'center', fontSize: 13 }}>
          {ansicht === 'sichtbar' ? 'Keine Bilder in diesem Album.' : 'Keine ausgeblendeten Bilder.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10 }}>
          {liste.map(b => {
            const sel = auswahl.has(b.file);
            return (
              <div key={b.file} onClick={() => toggle(b.file)} title={b.alt}
                style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', cursor: 'pointer', background: 'var(--bg2)', aspectRatio: '4/3',
                  outline: sel ? '3px solid var(--r)' : '1px solid var(--border)', outlineOffset: sel ? -3 : -1 }}>
                <img src={ansicht === 'sichtbar' ? thumbUrl(b.file) : `/api/content/galerie/papierkorb/${b.file}`} alt={b.alt} loading="lazy"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: sel ? .75 : 1 }} />
                <span style={{ position: 'absolute', top: 6, left: 6, width: 20, height: 20, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: sel ? 'var(--r)' : 'rgba(255,255,255,.85)', border: '1px solid rgba(0,0,0,.15)', color: '#fff', fontSize: 13, fontWeight: 700 }}>{sel ? '✓' : ''}</span>
                {ansicht === 'sichtbar' && (
                  <button onClick={e => { e.stopPropagation(); setGross(b.file); }} aria-label="Groß ansehen"
                    style={{ position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 6, border: 'none', cursor: 'pointer', background: 'rgba(0,0,0,.55)', color: '#fff', fontSize: 13 }}>⤢</button>
                )}
                <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 7px 5px', fontSize: 10, color: '#fff', background: 'linear-gradient(transparent, rgba(0,0,0,.6))',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {titel[b.album]}{b.caption ? ` · ${b.caption}` : ''}{b.ausgeblendet ? ` · weg seit ${new Date(b.ausgeblendet).toLocaleDateString('de-DE')}` : ''}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Großansicht */}
      {grossBild && (
        <div onClick={() => setGross(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.9)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20 }}>
          <img src={fullUrl(grossBild.file)} alt={grossBild.alt} onClick={e => e.stopPropagation()} style={{ maxWidth: '92vw', maxHeight: '78vh', objectFit: 'contain', borderRadius: 6 }} />
          <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button style={btn()} disabled={grossIdx <= 0} onClick={() => setGross(liste[grossIdx - 1].file)}>‹ Zurück</button>
            <span style={{ color: '#ccc', fontSize: 12 }}>{titel[grossBild.album]}{grossBild.caption ? ` · ${grossBild.caption}` : ''} · {grossIdx + 1}/{liste.length}</span>
            <button style={btn()} disabled={grossIdx >= liste.length - 1} onClick={() => setGross(liste[grossIdx + 1].file)}>Weiter ›</button>
            <button style={btn('danger')} disabled={busy} onClick={() => {
              const next = liste[grossIdx + 1] || liste[grossIdx - 1];
              aktion('ausblenden', [grossBild.file], true).then(() => next && setGross(next.file));
            }}>Dieses ausblenden (Entf)</button>
            <button style={btn()} onClick={() => setGross(null)}>Schließen</button>
          </div>
        </div>
      )}
    </div>
  );
}
