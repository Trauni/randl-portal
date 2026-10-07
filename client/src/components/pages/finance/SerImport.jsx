import { useState, useEffect, useCallback, useRef } from 'react';

// #260 SER-Produktstamm: Export aus SER (produkte_tab.csv) hochladen und mit den
// Lexware-Artikeln abgleichen. Grundlage für den Preis-Push nach SER (#261) –
// vor jedem Push einen frischen Export einlesen (Erkenntnis aus #256).

const th = { textAlign:'left', padding:'.45rem .6rem', fontSize:'.65rem', textTransform:'uppercase',
  letterSpacing:'.08em', color:'var(--text3)', fontFamily:'DM Mono, monospace', whiteSpace:'nowrap' };
const td = { padding:'.4rem .6rem', fontSize:'.8rem', color:'var(--text2)', verticalAlign:'top' };
const mono = { fontFamily:'DM Mono, monospace' };
const btn = { padding:'.4rem .9rem', background:'var(--bg2)', border:'1px solid var(--border)',
  borderRadius:8, color:'var(--text2)', fontSize:'.8rem', cursor:'pointer' };
const btnPrimary = { ...btn, background:'var(--r)', border:'none', color:'#fff' };
const chip = active => ({ padding:'.2rem .6rem', borderRadius:999, fontSize:'.72rem', cursor:'pointer',
  border:'1px solid ' + (active ? 'var(--r)' : 'var(--border)'),
  background: active ? 'rgba(224,80,80,.12)' : 'var(--bg0)', color: active ? 'var(--text1)' : 'var(--text3)' });
const diff = on => on ? { color:'var(--red2)', fontWeight:600 } : {};

const fmtEur = v => v == null ? '—' : Number(v).toLocaleString('de-DE', { minimumFractionDigits:2, maximumFractionDigits:2 }) + ' €';
const fmtSerInhalt = v => v == null || v === 0 ? '—' : (v / 1000).toLocaleString('de-DE', { maximumFractionDigits:3 });
const fmtLexInhalt = c => c ? `${c.value.toLocaleString('de-DE', { maximumFractionDigits:3 })} ${c.unit}` : '—';

// Ab diesem Alter gilt der Stand als veraltet (SER-Daten ändern sich, siehe #256)
const STALE_DAYS = 7;

function age(date) {
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  return { days, text: days === 0 ? 'heute' : days === 1 ? 'gestern' : `vor ${days} Tagen` };
}

const FILTERS = [
  ['abw',    'Abweichungen', m => m.contentDiffers || m.priceDiffers],
  ['inhalt', 'Inhalt',       m => m.contentDiffers],
  ['preis',  'Preis',        m => m.priceDiffers],
  ['name',   'Name',         m => m.nameDiffers],
  ['alle',   'Alle',         () => true],
];

export default function SerImport() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('abw');
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await fetch('/api/finance/price-tool/ser-import');
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Fehler ' + r.status);
      setData(d);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const upload = async e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true); setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch('/api/finance/price-tool/ser-import', { method:'POST', body: fd });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Fehler ' + r.status);
      setData(d);
      setOpen(true);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const last = data?.lastImport;
  const a = last ? age(last.importedAt) : null;
  const stale = a && a.days >= STALE_DAYS;
  const s = data?.summary;
  const rows = data?.matched?.filter(FILTERS.find(f => f[0] === filter)?.[2] || (() => true)) || [];

  return (
    <div style={{ background:'var(--bg1)', border:'1px solid var(--border)', borderRadius:9,
      padding:'.7rem 1rem', marginBottom:'1rem' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'.5rem', flexWrap:'wrap' }}>
        <div style={{ fontSize:'.82rem', color:'var(--text2)' }}>
          <b style={{ color:'var(--text1)' }}>SER-Produktstamm</b>
          {loading ? ' · lade…' : !last ? ' · noch nicht eingelesen' : (
            <>
              {' · '}
              <span style={stale ? { color:'var(--red2)', fontWeight:600 } : undefined}
                title={stale ? 'Vor dem Preis-Push nach SER einen frischen Export einlesen' : undefined}>
                Stand {new Date(last.importedAt).toLocaleDateString('de-DE')} ({a.text})
              </span>
              {' · '}{last.storedTotal} Artikel · {last.sourceFile}{last.importedBy && <> · {last.importedBy}</>}
            </>
          )}
        </div>
        <div style={{ display:'flex', gap:'.5rem' }}>
          {last && <button onClick={() => setOpen(o => !o)} style={btn}>{open ? 'Abgleich ausblenden' : 'Abgleich anzeigen'}</button>}
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={upload} style={{ display:'none' }}/>
          <button onClick={() => fileRef.current?.click()} disabled={busy} style={btnPrimary}
            title="SER-Export produkte_tab.csv – ersetzt den gespeicherten Stand">
            {busy ? 'Lese ein…' : 'Export einlesen'}
          </button>
        </div>
      </div>

      {error && <div style={{ color:'var(--red2)', fontSize:'.8rem', marginTop:'.5rem' }}>✗ {error}</div>}

      {open && last && s && (
        <div style={{ marginTop:'.8rem' }}>
          <div style={{ fontSize:'.8rem', color:'var(--text2)', marginBottom:'.6rem' }}>
            {s.matched} von {s.rgArticles} RG-Artikeln in SER gefunden
            {s.withoutSer > 0 && <> · <span style={{ color:'var(--red2)' }}>{s.withoutSer} ohne SER-Eintrag</span></>}
            {' · '}{s.contentDiffers} Inhalt abweichend · {s.priceDiffers} Preis abweichend · {s.nameDiffers} Name abweichend
            {' · '}Datei: {last.productsTotal} aktive SER-Produkte
          </div>

          {last.warnings.length > 0 && (
            <ul style={{ margin:'0 0 .6rem 1rem', padding:0, fontSize:'.75rem', color:'var(--text3)' }}>
              {last.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}

          {data.withoutSer.length > 0 && (
            <div style={{ fontSize:'.78rem', color:'var(--text2)', marginBottom:'.6rem' }}>
              <b>Ohne SER-Eintrag:</b>{' '}
              {data.withoutSer.map(w => (
                <span key={w.id} style={{ marginRight:'.6rem' }}>
                  <span style={mono}>{w.articleNumber}</span> {w.name}{w.serInactive && ' (in SER inaktiv)'}
                </span>
              ))}
            </div>
          )}

          <div style={{ display:'flex', gap:'.3rem', marginBottom:'.5rem' }}>
            {FILTERS.map(([k, l, fn]) =>
              <button key={k} onClick={() => setFilter(k)} style={chip(filter === k)}>
                {l} ({data.matched.filter(fn).length})
              </button>)}
          </div>

          <div style={{ overflowX:'auto', border:'1px solid var(--border)', borderRadius:8 }}>
            <table style={{ width:'100%', borderCollapse:'collapse', minWidth:760 }}>
              <thead>
                <tr style={{ background:'var(--bg2)' }}>
                  {['Artikel', 'Name Lexware', 'Name SER', 'Inhalt Lexware', 'Inhalt SER', 'Preis Lexware', 'Preis SER'].map(h =>
                    <th key={h} style={th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map(m => (
                  <tr key={m.id} style={{ borderTop:'1px solid rgba(255,255,255,.04)' }}>
                    <td style={{ ...td, ...mono, fontSize:'.75rem', color:'var(--text3)' }}>{m.articleNumber}</td>
                    <td style={{ ...td, color:'var(--text1)' }}>{m.lexName}</td>
                    <td style={{ ...td, ...diff(m.nameDiffers), fontWeight:400 }}>{m.serName}</td>
                    <td style={{ ...td, ...mono, ...diff(m.contentDiffers) }}>{fmtLexInhalt(m.lexContent)}</td>
                    <td style={{ ...td, ...mono, ...diff(m.contentDiffers) }}>{fmtSerInhalt(m.serInhalt)}</td>
                    <td style={{ ...td, ...mono, ...diff(m.priceDiffers) }}>{fmtEur(m.lexNet)}</td>
                    <td style={{ ...td, ...mono, ...diff(m.priceDiffers) }}>{fmtEur(m.serNet)}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={7} style={{ padding:'1.5rem', textAlign:'center', color:'var(--text3)', fontSize:'.8rem' }}>
                    Keine Artikel für diesen Filter.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
