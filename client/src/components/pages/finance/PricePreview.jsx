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

// Bei „Festsetzen“ die größten Abweichungen zuerst – so fallen falsche Preise sofort auf.
// Übersprungene immer ans Ende.
function sortedRows(result) {
  const isTarget = result.rule.mode === 'set' || result.rule.mode === 'target_per_unit';
  const rank = r => r.status === 'skip' ? 2 : 0;
  return [...result.rows].sort((a, b) =>
    rank(a) - rank(b) ||
    (isTarget ? Math.abs(b.diff ?? Infinity) - Math.abs(a.diff ?? Infinity) : 0) ||
    a.articleNumber.localeCompare(b.articleNumber));
}

// Basis der Regel: pro kg, pro L (Flaschengröße) oder je Artikel
const BASES = [
  ['kg',   'pro kg'],
  ['L',    'pro L (Flaschengröße)'],
  ['item', 'je Artikel'],
];

// kind: 'plus' / 'minus' = ändern um x ct, 'target' = festsetzen auf x €
export default function PricePreview({ articleIds, onClose, onApplied }) {
  const [ids, setIds] = useState(articleIds);   // bei „erneut versuchen“ nur die fehlgeschlagenen
  const [kind, setKind] = useState('plus');
  const [base, setBase] = useState('kg');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [job, setJob] = useState(null);         // Übernahme läuft / ist fertig (#254)

  const num = parseFloat(String(amount).replace(',', '.'));
  // Ändern wird in ct eingegeben, Festsetzen in € – ans Backend geht immer ct
  const cents = kind === 'target' ? Math.round(num * 100 * 1000) / 1000 : (kind === 'minus' ? -num : num);
  const rule = kind === 'target'
    ? (base === 'item' ? { mode:'set', cents } : { mode:'target_per_unit', unit: base, cents })
    : (base === 'item' ? { mode:'flat', cents } : { mode:'per_unit', unit: base, cents });
  const reset = () => setResult(null);

  const preview = async (forIds = ids) => {
    setBusy(true); setError(''); setResult(null); setJob(null);
    try {
      const r = await fetch('/api/finance/price-tool/preview', {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ articleIds: forIds, rule }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Fehler ' + r.status);
      setResult(d);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  // #254: nach ausdrücklicher Bestätigung nach Lexware schreiben, dann Fortschritt abfragen
  const apply = async () => {
    const s = result.summary;
    const text = `${s.changed} Preis${s.changed === 1 ? '' : 'e'} in Lexware ändern?\n\n` +
      `Regel: ${ruleText}\nSumme der Änderungen netto: ${fmtDiff(s.diffNetTotal)}\n\n` +
      `Das ändert die echten Preise in Lexware (und damit im Shop).`;
    if (!window.confirm(text)) return;

    setBusy(true); setError('');
    try {
      const r = await fetch('/api/finance/price-tool/apply', {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ articleIds: ids, rule: result.rule, confirm: true,
          expected: { changed: s.changed, diffNetTotal: s.diffNetTotal } }),
      });
      const d = await r.json();
      if (r.status === 409 && d.preview) {   // Daten haben sich geändert → neue Vorschau zeigen
        setResult(d.preview);
        throw new Error(d.error);
      }
      if (!r.ok || d.error) throw new Error(d.error || 'Fehler ' + r.status);
      setJob({ jobId: d.jobId, status: 'running', total: d.total, processed: 0, results: [] });
      poll(d.jobId);
    } catch (e) { setError(e.message); setBusy(false); }
  };

  const poll = async (jobId) => {
    try {
      const r = await fetch('/api/finance/price-tool/apply/' + jobId);
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Fehler ' + r.status);
      setJob({ jobId, ...d });
      if (d.status === 'running') { setTimeout(() => poll(jobId), 1500); return; }
      setBusy(false);
      onApplied && onApplied();
    } catch (e) { setError('Fortschritt nicht abrufbar: ' + e.message); setBusy(false); }
  };

  const retryFailed = () => {
    const failed = job.results.filter(r => r.status === 'error').map(r => r.id);
    setIds(failed);
    preview(failed);
  };

  const ruleText = result && (() => {
    const r = result.rule;
    const per = r.unit ? 'pro ' + r.unit : 'je Artikel';
    if (r.mode === 'set' || r.mode === 'target_per_unit') return `festsetzen auf ${fmtEur(r.cents / 100)} ${per} netto`;
    return (r.cents > 0 ? '+' : '−') + Math.abs(r.cents).toLocaleString('de-DE') + ` ct ${per} netto`;
  })();

  return (
    <div style={{ background:'var(--bg1)', border:'1px solid var(--border)', borderRadius:9,
      padding:'1rem', marginBottom:'1rem' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'.8rem' }}>
        <h2 style={{ fontSize:'.95rem', fontWeight:600, color:'var(--text1)' }}>
          Preise anpassen · {ids.length} Artikel{ids.length !== articleIds.length ? ' (erneuter Versuch)' : ' ausgewählt'}
        </h2>
        <button onClick={onClose} style={{ ...btn, padding:'.2rem .6rem' }}>✕ Schließen</button>
      </div>

      <div style={{ display:'flex', gap:'.5rem', flexWrap:'wrap', alignItems:'center' }}>
        <select value={kind} onChange={e => { setKind(e.target.value); reset(); }} style={input}>
          <option value="plus">Erhöhen um +</option>
          <option value="minus">Senken um −</option>
          <option value="target">Festsetzen auf =</option>
        </select>
        <input value={amount} onChange={e => { setAmount(e.target.value); reset(); }}
          onKeyDown={e => { if (e.key === 'Enter' && num > 0) preview(); }}
          placeholder={kind === 'target' ? 'z. B. 2,10' : 'z. B. 14'} inputMode="decimal" style={{ ...input, width:90 }}/>
        <span style={{ fontSize:'.82rem', color:'var(--text2)' }}>{kind === 'target' ? '€' : 'ct'}</span>
        <select value={base} onChange={e => { setBase(e.target.value); reset(); }} style={input}>
          {BASES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <span style={{ fontSize:'.75rem', color:'var(--text3)' }}>netto, gerundet auf ganze Cent</span>
        <button onClick={() => preview()} disabled={busy || !(num > 0)} style={btnPrimary}>
          {busy ? 'Rechne…' : 'Vorschau berechnen'}
        </button>
      </div>

      {error && <div style={{ color:'var(--red2)', fontSize:'.82rem', marginTop:'.7rem' }}>✗ {error}</div>}

      {result && (
        <>
          <div style={{ margin:'.9rem 0 .5rem', fontSize:'.82rem', color:'var(--text2)' }}>
            Regel <b style={{ color:'var(--text1)' }}>{ruleText}</b> ·{' '}
            <b style={{ color:'var(--text1)' }}>{result.summary.changed}</b> werden geändert
            {result.summary.same > 0 && <> · {result.summary.same} stimmen bereits</>}
            {result.summary.skipped > 0 && <> · {result.summary.skipped} übersprungen</>}
            {' '}· Summe der Änderungen netto <b style={{ ...mono, color:'var(--text1)' }}>{fmtDiff(result.summary.diffNetTotal)}</b>
          </div>
          <div style={{ overflowX:'auto', border:'1px solid var(--border)', borderRadius:8 }}>
            <table style={{ width:'100%', borderCollapse:'collapse', minWidth:680 }}>
              <thead>
                <tr style={{ background:'var(--bg2)' }}>
                  {['Artikel', 'Inhalt', 'netto alt', 'alt je kg/L', 'netto neu', 'Differenz', 'brutto neu', ''].map(h =>
                    <th key={h} style={th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {sortedRows(result).map(r => (
                  <tr key={r.id} style={{ borderTop:'1px solid rgba(255,255,255,.04)',
                    opacity: r.status === 'skip' ? .5 : 1 }}>
                    <td style={td}>
                      <span style={{ ...mono, fontSize:'.72rem', color:'var(--text3)' }}>{r.articleNumber}</span><br/>
                      <span style={{ color:'var(--text1)' }}>{r.name}</span>
                    </td>
                    <td style={{ ...td, ...mono }}>{r.content ? `${r.content.value.toLocaleString('de-DE')} ${r.content.unit}` : '—'}</td>
                    <td style={{ ...td, ...mono }}>{fmtEur(r.oldNet)}</td>
                    <td style={{ ...td, ...mono, fontSize:'.75rem' }}>
                      {r.content && r.oldNet != null ? `${fmtEur(r.oldNet / r.content.value)}/${r.content.unit}` : '—'}
                    </td>
                    <td style={{ ...td, ...mono, color:'var(--text1)', fontWeight:600 }}>{r.status !== 'skip' ? fmtEur(r.newNet) : '—'}</td>
                    <td style={{ ...td, ...mono, color: r.status === 'same' ? 'var(--text3)' : r.diff > 0 ? 'var(--green)' : 'var(--red2)' }}>
                      {r.status === 'same' ? '±0' : r.status === 'ok' ? (r.diff == null ? 'neu' : fmtDiff(r.diff)) : ''}
                    </td>
                    <td style={{ ...td, ...mono }}>{r.status !== 'skip' ? fmtEur(r.newGross) : ''}</td>
                    <td style={{ ...td, fontSize:'.72rem', color: r.status === 'same' ? 'var(--green)' : 'var(--text3)' }}>
                      {r.status === 'same' ? '✓ stimmt bereits' : r.status === 'skip' ? r.reason : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:'.5rem', alignItems:'center', marginTop:'.8rem' }}>
            {!job && <>
              <span style={{ fontSize:'.75rem', color:'var(--text3)' }}>Vorschau – geändert wird erst nach Bestätigung.</span>
              <button onClick={apply} disabled={busy || result.summary.changed === 0}
                style={{ ...btnPrimary, opacity: busy || result.summary.changed === 0 ? .45 : 1 }}>
                {result.summary.changed} Preis{result.summary.changed === 1 ? '' : 'e'} nach Lexware übernehmen
              </button>
            </>}
          </div>
        </>
      )}

      {job && <JobProgress job={job} onRetry={retryFailed}/>}
    </div>
  );
}

// #254: Fortschritt und Ergebnis pro Artikel
const STATUS_LABEL = {
  ok:       ['✓ geändert', 'var(--green)'],
  conflict: ['⚠ Konflikt – nicht geändert', 'var(--orange, #e0a040)'],
  error:    ['✗ Fehler', 'var(--red2)'],
};

function JobProgress({ job, onRetry }) {
  const pct = job.total ? Math.round(job.processed / job.total * 100) : 0;
  const done = job.status !== 'running';
  const failed = (job.results || []).filter(r => r.status === 'error').length;
  return (
    <div style={{ marginTop:'1rem', borderTop:'1px solid var(--border)', paddingTop:'.9rem' }}>
      <div style={{ fontSize:'.82rem', color:'var(--text2)', marginBottom:'.4rem' }}>
        {done
          ? <>Fertig: <b style={{ color:'var(--green)' }}>{job.success} geändert</b>
              {job.conflicts > 0 && <> · <b>{job.conflicts} Konflikt{job.conflicts === 1 ? '' : 'e'}</b></>}
              {job.errors > 0 && <> · <b style={{ color:'var(--red2)' }}>{job.errors} Fehler</b></>}
              {job.fatalError && <> · Abbruch: {job.fatalError}</>}</>
          : <>Schreibe nach Lexware … {job.processed} / {job.total} (Lexware erlaubt nur 2 Anfragen pro Sekunde)</>}
      </div>
      <div style={{ height:6, background:'var(--bg2)', borderRadius:3, overflow:'hidden', marginBottom:'.7rem' }}>
        <div style={{ width: pct + '%', height:'100%', background: done && job.errors ? 'var(--red2)' : 'var(--green)', transition:'width .3s' }}/>
      </div>
      {(job.results || []).length > 0 && (
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <tbody>
            {job.results.map(r => {
              const [label, color] = STATUS_LABEL[r.status] || [r.status, 'var(--text3)'];
              return (
                <tr key={r.id} style={{ borderTop:'1px solid rgba(255,255,255,.04)' }}>
                  <td style={{ ...td, ...mono, fontSize:'.72rem', color:'var(--text3)' }}>{r.articleNumber}</td>
                  <td style={{ ...td, ...mono }}>{fmtEur(r.expectedNet)} → {fmtEur(r.newNet)}</td>
                  <td style={{ ...td, color }}>{label}</td>
                  <td style={{ ...td, fontSize:'.72rem', color:'var(--text3)' }}>{r.reason || r.warning || ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {done && failed > 0 && (
        <div style={{ textAlign:'right', marginTop:'.7rem' }}>
          <button onClick={onRetry} style={btn}>{failed} fehlgeschlagene erneut versuchen</button>
        </div>
      )}
      {done && job.conflicts > 0 && (
        <div style={{ fontSize:'.75rem', color:'var(--text3)', marginTop:'.5rem' }}>
          Konflikt = Preis wurde seit der Vorschau in Lexware geändert und deshalb nicht überschrieben.
          Liste neu laden und Vorschau neu berechnen.
        </div>
      )}
    </div>
  );
}
