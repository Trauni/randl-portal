import { useState } from 'react';

// #253 Preis-Tool: Regel für die ausgewählten Artikel festlegen und Vorschau anzeigen.
// Gerechnet wird im Backend (netto, auf ganze Cent). Übernahme nach Lexware folgt mit #254.

const th = { textAlign:'left', padding:'.45rem .6rem', fontSize:'.65rem', textTransform:'uppercase',
  letterSpacing:'.08em', color:'var(--text3)', fontFamily:'DM Mono, monospace', whiteSpace:'nowrap' };
const td = { padding:'.4rem .6rem', fontSize:'.8rem', color:'var(--text2)' };
const mono = { fontFamily:'DM Mono, monospace' };
const input = { background:'var(--bg0)', border:'1px solid var(--border)', borderRadius:7,
  padding:'.35rem .6rem', color:'var(--text1)', fontSize:'.82rem' };
const btn = { padding:'.4rem .9rem', background:'var(--bg2)', border:'1px solid var(--border)',
  borderRadius:8, color:'var(--text2)', fontSize:'.8rem', cursor:'pointer' };
const btnPrimary = { ...btn, background:'var(--r)', border:'none', color:'#fff' };

const fmtEur = v => v == null ? '—' : Number(v).toLocaleString('de-DE', { minimumFractionDigits:2, maximumFractionDigits:2 }) + ' €';
const fmtDiff = v => (v > 0 ? '+' : '') + fmtEur(v);

const MODES = [
  ['kg',   'ct pro kg'],
  ['L',    'ct pro L (Flaschengröße)'],
  ['flat', 'ct pauschal je Artikel'],
];

export default function PricePreview({ articleIds, onClose }) {
  const [mode, setMode] = useState('kg');
  const [direction, setDirection] = useState(1);   // +1 Erhöhung, -1 Senkung
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const cents = parseFloat(String(amount).replace(',', '.'));
  const rule = mode === 'flat'
    ? { mode:'flat', cents: direction * cents }
    : { mode:'per_unit', unit: mode, cents: direction * cents };

  const preview = async () => {
    setBusy(true); setError(''); setResult(null);
    try {
      const r = await fetch('/api/finance/price-tool/preview', {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ articleIds, rule }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Fehler ' + r.status);
      setResult(d);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const ruleText = result && (
    (result.rule.cents > 0 ? '+' : '−') + Math.abs(result.rule.cents).toLocaleString('de-DE') + ' ct ' +
    (result.rule.mode === 'flat' ? 'je Artikel' : 'pro ' + result.rule.unit) + ' netto'
  );

  return (
    <div style={{ background:'var(--bg1)', border:'1px solid var(--border)', borderRadius:9,
      padding:'1rem', marginBottom:'1rem' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'.8rem' }}>
        <h2 style={{ fontSize:'.95rem', fontWeight:600, color:'var(--text1)' }}>
          Preise anpassen · {articleIds.length} Artikel ausgewählt
        </h2>
        <button onClick={onClose} style={{ ...btn, padding:'.2rem .6rem' }}>✕ Schließen</button>
      </div>

      <div style={{ display:'flex', gap:'.5rem', flexWrap:'wrap', alignItems:'center' }}>
        <select value={direction} onChange={e => { setDirection(Number(e.target.value)); setResult(null); }} style={input}>
          <option value={1}>Erhöhung +</option>
          <option value={-1}>Senkung −</option>
        </select>
        <input value={amount} onChange={e => { setAmount(e.target.value); setResult(null); }}
          onKeyDown={e => { if (e.key === 'Enter' && cents > 0) preview(); }}
          placeholder="z. B. 14" inputMode="decimal" style={{ ...input, width:90 }}/>
        <select value={mode} onChange={e => { setMode(e.target.value); setResult(null); }} style={input}>
          {MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <span style={{ fontSize:'.75rem', color:'var(--text3)' }}>netto, gerundet auf ganze Cent</span>
        <button onClick={preview} disabled={busy || !(cents > 0)} style={btnPrimary}>
          {busy ? 'Rechne…' : 'Vorschau berechnen'}
        </button>
      </div>

      {error && <div style={{ color:'var(--red2)', fontSize:'.82rem', marginTop:'.7rem' }}>✗ {error}</div>}

      {result && (
        <>
          <div style={{ margin:'.9rem 0 .5rem', fontSize:'.82rem', color:'var(--text2)' }}>
            Regel <b style={{ color:'var(--text1)' }}>{ruleText}</b> ·{' '}
            <b style={{ color:'var(--text1)' }}>{result.summary.changed}</b> werden geändert
            {result.summary.skipped > 0 && <> · {result.summary.skipped} übersprungen</>}
            {' '}· Summe der Änderungen netto <b style={{ ...mono, color:'var(--text1)' }}>{fmtDiff(result.summary.diffNetTotal)}</b>
          </div>
          <div style={{ overflowX:'auto', border:'1px solid var(--border)', borderRadius:8 }}>
            <table style={{ width:'100%', borderCollapse:'collapse', minWidth:680 }}>
              <thead>
                <tr style={{ background:'var(--bg2)' }}>
                  {['Artikel', 'Inhalt', 'netto alt', 'netto neu', 'Differenz', 'brutto neu', ''].map(h =>
                    <th key={h} style={th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {result.rows.map(r => (
                  <tr key={r.id} style={{ borderTop:'1px solid rgba(255,255,255,.04)',
                    opacity: r.status === 'ok' ? 1 : .55 }}>
                    <td style={td}>
                      <span style={{ ...mono, fontSize:'.72rem', color:'var(--text3)' }}>{r.articleNumber}</span><br/>
                      <span style={{ color:'var(--text1)' }}>{r.name}</span>
                    </td>
                    <td style={{ ...td, ...mono }}>{r.content ? `${r.content.value.toLocaleString('de-DE')} ${r.content.unit}` : '—'}</td>
                    <td style={{ ...td, ...mono }}>{fmtEur(r.oldNet)}</td>
                    <td style={{ ...td, ...mono, color:'var(--text1)', fontWeight:600 }}>{r.status === 'ok' ? fmtEur(r.newNet) : '—'}</td>
                    <td style={{ ...td, ...mono, color: r.diff > 0 ? 'var(--green)' : 'var(--red2)' }}>{r.status === 'ok' ? fmtDiff(r.diff) : ''}</td>
                    <td style={{ ...td, ...mono }}>{r.status === 'ok' ? fmtEur(r.newGross) : ''}</td>
                    <td style={{ ...td, fontSize:'.72rem', color:'var(--text3)' }}>{r.status === 'skip' ? r.reason : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:'.5rem', alignItems:'center', marginTop:'.8rem' }}>
            <span style={{ fontSize:'.75rem', color:'var(--text3)' }}>Nur Vorschau – in Lexware wird noch nichts geändert.</span>
            <button disabled title="Folgt mit #254 (Push nach Lexware)" style={{ ...btnPrimary, opacity:.45, cursor:'not-allowed' }}>
              Nach Lexware übernehmen
            </button>
          </div>
        </>
      )}
    </div>
  );
}
