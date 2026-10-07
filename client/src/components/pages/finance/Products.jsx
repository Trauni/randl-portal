import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../../context/AuthContext';
import PricePreview from './PricePreview';
import SerImport from './SerImport';
import SerPush from './SerPush';

// #249 Preis-Tool: Produktliste aller Gasfüllungen (RG-/NRG-) mit Inhalt kg/L (#251),
// Filtern und Mehrfachauswahl (#252). Inhalt pflegen nur mit gashandel.preise (#250).

const th = { textAlign:'left', padding:'.5rem .6rem', fontSize:'.65rem', textTransform:'uppercase',
  letterSpacing:'.08em', color:'var(--text3)', fontFamily:'DM Mono, monospace', whiteSpace:'nowrap' };
const td = { padding:'.45rem .6rem', fontSize:'.8rem', color:'var(--text2)', verticalAlign:'middle' };
const mono = { fontFamily:'DM Mono, monospace' };
const btn = { padding:'.4rem .9rem', background:'var(--bg2)', border:'1px solid var(--border)',
  borderRadius:8, color:'var(--text2)', fontSize:'.8rem', cursor:'pointer' };
const btnPrimary = { ...btn, background:'var(--r)', border:'none', color:'#fff' };
const chip = active => ({ padding:'.2rem .6rem', borderRadius:999, fontSize:'.72rem', cursor:'pointer',
  border:'1px solid ' + (active ? 'var(--r)' : 'var(--border)'),
  background: active ? 'rgba(224,80,80,.12)' : 'var(--bg0)', color: active ? 'var(--text1)' : 'var(--text3)' });

const fmtEur = v => v == null ? '—' : Number(v).toLocaleString('de-DE', { minimumFractionDigits:2, maximumFractionDigits:2 }) + ' €';
const fmtNum = v => Number(v).toLocaleString('de-DE', { maximumFractionDigits:3 });

function ContentCell({ article, canEdit, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('kg');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const c = article.content;

  const start = () => {
    setValue(c ? String(c.value).replace('.', ',') : '');
    setUnit(c ? c.unit : 'kg');
    setErr(''); setEditing(true);
  };
  const save = async () => {
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/finance/article-content/' + article.id, {
        method:'PUT', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ value: value.trim() === '' ? null : value, unit,
          articleNumber: article.articleNumber, name: article.name }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Fehler ' + r.status);
      setEditing(false); onSaved(article.id, d.content);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  if (editing) return (
    <span style={{ display:'inline-flex', gap:'.3rem', alignItems:'center', flexWrap:'wrap' }}>
      <input value={value} onChange={e => setValue(e.target.value)} autoFocus placeholder="leer = entfernen"
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
        style={{ width:70, background:'var(--bg0)', border:'1px solid var(--border)', borderRadius:6,
          padding:'.2rem .4rem', color:'var(--text1)', fontSize:'.8rem' }}/>
      <select value={unit} onChange={e => setUnit(e.target.value)}
        style={{ background:'var(--bg0)', border:'1px solid var(--border)', borderRadius:6,
          padding:'.2rem', color:'var(--text1)', fontSize:'.8rem' }}>
        <option value="kg">kg</option><option value="L">L</option>
      </select>
      <button onClick={save} disabled={busy} style={{ ...btnPrimary, padding:'.2rem .5rem' }}>✓</button>
      <button onClick={() => setEditing(false)} style={{ ...btn, padding:'.2rem .5rem' }}>✕</button>
      {err && <span style={{ color:'var(--red2)', fontSize:'.72rem', width:'100%' }}>{err}</span>}
    </span>
  );

  const label = c
    ? <span style={{ ...mono, color:'var(--text1)' }}>{fmtNum(c.value)} {c.unit}
        {c.source === 'manuell' && <span title="manuell gepflegt" style={{ color:'var(--text3)' }}> ✎</span>}</span>
    : <span style={{ color:'var(--red2)', fontSize:'.75rem' }}>fehlt</span>;

  return canEdit
    ? <button onClick={start} title="Inhalt bearbeiten"
        style={{ background:'none', border:'none', padding:0, cursor:'pointer', textAlign:'left' }}>{label}</button>
    : label;
}

export default function Products() {
  const { hasArea } = useAuth();
  const canEdit = hasArea('gashandel.preise');

  const [articles, setArticles] = useState([]);
  const [cachedAt, setCachedAt] = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [notice,   setNotice]   = useState('');
  const [q,        setQ]        = useState('');
  const [tagFilter,  setTagFilter]  = useState([]);   // leer = alle
  const [unitFilter, setUnitFilter] = useState('');   // '', 'kg', 'L', 'fehlt'
  const [selected, setSelected] = useState(() => new Set());
  const [prefilling, setPrefilling] = useState(false);
  const [showPrice, setShowPrice] = useState(false);
  const [showSerPush, setShowSerPush] = useState(false);   // #261

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await fetch('/api/finance/article-content');
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Fehler ' + r.status);
      setArticles(d.articles || []);
      setCachedAt(d.cachedAt);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Fehlervermeidung (Wunsch 06.10.2026): neue Suche oder neuer Filter leert die Auswahl,
  // damit keine unsichtbaren Artikel aus einer früheren Suche markiert bleiben.
  useEffect(() => { setSelected(new Set()); setShowPrice(false); setShowSerPush(false); }, [q, tagFilter, unitFilter]);

  const allTags = useMemo(() => [...new Set(articles.flatMap(a => a.tags || []))].sort(), [articles]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return articles.filter(a => {
      if (needle && !(a.name.toLowerCase().includes(needle) || a.articleNumber.toLowerCase().includes(needle))) return false;
      if (tagFilter.length && !(a.tags || []).some(t => tagFilter.includes(t))) return false;
      if (unitFilter === 'fehlt') return !a.content;
      if (unitFilter) return a.content && a.content.unit === unitFilter;
      return true;
    });
  }, [articles, q, tagFilter, unitFilter]);

  const missing = articles.filter(a => !a.content).length;
  const allVisibleSelected = visible.length > 0 && visible.every(a => selected.has(a.id));

  const toggle = id => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAllVisible = () => setSelected(s => {
    const n = new Set(s);
    if (allVisibleSelected) visible.forEach(a => n.delete(a.id)); else visible.forEach(a => n.add(a.id));
    return n;
  });
  const toggleTag = t => setTagFilter(f => f.includes(t) ? f.filter(x => x !== t) : [...f, t]);

  const onSaved = (id, content) =>
    setArticles(list => list.map(a => a.id === id ? { ...a, content } : a));

  const prefill = async () => {
    setPrefilling(true); setError(''); setNotice('');
    try {
      const r = await fetch('/api/finance/article-content/prefill', { method:'POST' });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Fehler ' + r.status);
      const rest = d.unrecognized.length
        ? ` Nicht erkannt (bitte nachpflegen): ${d.unrecognized.map(u => u.articleNumber).join(', ')}.` : '';
      setNotice(`${d.filled.length} Artikel aus dem Titel vorbefüllt.${rest}`);
      await load();
    } catch (e) { setError(e.message); }
    finally { setPrefilling(false); }
  };

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'1rem', flexWrap:'wrap', gap:'.5rem' }}>
        <div>
          <h1 style={{ fontSize:'1.15rem', fontWeight:600, color:'var(--text1)' }}>Produkte</h1>
          <p style={{ color:'var(--text2)', fontSize:'.8rem', marginTop:'.2rem' }}>
            Gasfüllungen aus Lexware (RG-/NRG-) · {articles.length} Artikel
            {missing > 0 && <> · <span style={{ color:'var(--red2)' }}>{missing} ohne Inhalt</span></>}
            {cachedAt && <> · Stand {new Date(cachedAt).toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' })}</>}
          </p>
        </div>
        <div style={{ display:'flex', gap:'.5rem', flexWrap:'wrap' }}>
          {canEdit && missing > 0 && (
            <button onClick={prefill} disabled={prefilling} style={btn}
              title="Füllt nur Artikel ohne Inhalt aus dem Titel; vorhandene Werte bleiben unverändert">
              {prefilling ? 'Fülle…' : 'Inhalt aus Titel vorbefüllen'}
            </button>
          )}
          <button onClick={load} style={btn}>↻ Neu laden</button>
        </div>
      </div>

      {/* SER-Produktstamm (#260) – nur mit gashandel.preise */}
      {canEdit && <SerImport/>}

      {/* Filter */}
      <div style={{ display:'flex', gap:'.75rem', flexWrap:'wrap', alignItems:'center', marginBottom:'.8rem' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Artikelname / Nummer…"
          style={{ background:'var(--bg0)', border:'1px solid var(--border)', borderRadius:7,
            padding:'.35rem .7rem', color:'var(--text1)', fontSize:'.8rem', outline:'none', width:220 }}/>
        <div style={{ display:'flex', gap:'.3rem', flexWrap:'wrap' }}>
          {allTags.map(t => <button key={t} onClick={() => toggleTag(t)} style={chip(tagFilter.includes(t))}>{t}</button>)}
        </div>
        <div style={{ display:'flex', gap:'.3rem' }}>
          {[['', 'Alle'], ['kg', 'kg'], ['L', 'L'], ['fehlt', 'ohne Inhalt']].map(([v, l]) =>
            <button key={l} onClick={() => setUnitFilter(v)} style={chip(unitFilter === v)}>{l}</button>)}
        </div>
        {(q || tagFilter.length > 0 || unitFilter) &&
          <button onClick={() => { setQ(''); setTagFilter([]); setUnitFilter(''); }} style={{ ...btn, padding:'.2rem .6rem' }}>✕ Filter</button>}
      </div>

      {error && (
        <div style={{ background:'rgba(224,80,80,.08)', border:'1px solid rgba(224,80,80,.3)',
          borderRadius:9, padding:'.75rem 1rem', color:'var(--red2)', fontSize:'.85rem', marginBottom:'1rem' }}>
          ✗ {error}
        </div>
      )}
      {notice && (
        <div style={{ background:'var(--bg1)', border:'1px solid var(--border)', borderRadius:9,
          padding:'.6rem 1rem', color:'var(--text2)', fontSize:'.82rem', marginBottom:'1rem' }}>
          {notice}
        </div>
      )}

      {/* Auswahl-Leiste */}
      {selected.size > 0 && (
        <div style={{ display:'flex', gap:'.75rem', alignItems:'center', marginBottom:'.6rem',
          fontSize:'.8rem', color:'var(--text2)' }}>
          <span><b style={{ color:'var(--text1)' }}>{selected.size}</b> ausgewählt</span>
          <button onClick={() => { setSelected(new Set()); setShowPrice(false); setShowSerPush(false); }} style={{ ...btn, padding:'.2rem .6rem' }}>Auswahl aufheben</button>
          {canEdit && !showPrice && (
            <button onClick={() => { setShowPrice(true); setShowSerPush(false); }} style={{ ...btnPrimary, padding:'.3rem .8rem' }}>
              Preise anpassen ({selected.size})
            </button>
          )}
          {canEdit && (
            <button onClick={() => { setShowSerPush(v => !v); setShowPrice(false); }}
              style={{ ...btn, padding:'.3rem .8rem', ...(showSerPush ? { borderColor:'var(--r)', color:'var(--text1)' } : {}) }}
              title="Lexware-Preise der ausgewählten RG-Artikel per STMUPD an SER senden">
              Push SER ({selected.size})
            </button>
          )}
        </div>
      )}

      {canEdit && showPrice && selected.size > 0 && (
        <PricePreview key={[...selected].sort().join(',')} articleIds={[...selected]} onClose={() => setShowPrice(false)}
          onApplied={load}/>
      )}

      {canEdit && showSerPush && selected.size > 0 && (
        <SerPush key={[...selected].sort().join(',')} articleIds={[...selected]} onClose={() => setShowSerPush(false)}/>
      )}

      {loading ? (
        <div style={{ color:'var(--text3)', textAlign:'center', padding:'3rem' }}>Lade Artikel…</div>
      ) : (
        <div style={{ background:'var(--bg1)', border:'1px solid var(--border)', borderRadius:9, overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:720 }}>
            <thead>
              <tr style={{ background:'var(--bg2)', borderBottom:'1px solid var(--border)' }}>
                <th style={{ ...th, width:32 }}>
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible}
                    title="Alle sichtbaren markieren"/>
                </th>
                {['Artikelnummer', 'Bezeichnung', 'Tags', 'Inhalt', 'Preis netto', 'netto je kg/L'].map(h =>
                  <th key={h} style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {visible.map(a => {
                const perUnit = a.content && a.netPrice != null ? a.netPrice / a.content.value : null;
                return (
                  <tr key={a.id} style={{ borderBottom:'1px solid rgba(255,255,255,.04)',
                    background: selected.has(a.id) ? 'rgba(224,80,80,.05)' : undefined }}>
                    <td style={td}><input type="checkbox" checked={selected.has(a.id)} onChange={() => toggle(a.id)}/></td>
                    <td style={{ ...td, ...mono, fontSize:'.75rem', color:'var(--text3)' }}>{a.articleNumber}</td>
                    <td style={{ ...td, color:'var(--text1)', fontWeight:500 }}>{a.name}</td>
                    <td style={{ ...td, fontSize:'.7rem', color:'var(--text3)' }}>{(a.tags || []).join(', ')}</td>
                    <td style={td}><ContentCell article={a} canEdit={canEdit} onSaved={onSaved}/></td>
                    <td style={{ ...td, ...mono, color:'var(--green)', fontWeight:600 }}>{fmtEur(a.netPrice)}</td>
                    <td style={{ ...td, ...mono, fontSize:'.75rem' }}>
                      {perUnit != null ? `${fmtEur(perUnit)}/${a.content.unit}` : '—'}
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr><td colSpan={7} style={{ padding:'2rem', textAlign:'center', color:'var(--text3)', fontSize:'.82rem' }}>
                  {articles.length ? 'Keine Artikel für diesen Filter.' : 'Keine Artikel vorhanden.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
