import { useState, useEffect, useCallback } from 'react';

// #261 Push SER: Lexware-Preise der ausgewählten RG-Artikel per STMUPD-Datei an SER senden.
// Alle übrigen Felder kommen unverändert aus dem gespeicherten SER-Produktstamm (#260).
// Ablauf: Vorschau (alt → neu je Artikel, Datei ansehen) → Bestätigen → Upload nach /Eingang.

const th = { textAlign:'left', padding:'.45rem .6rem', fontSize:'.65rem', textTransform:'uppercase',
  letterSpacing:'.08em', color:'var(--text3)', fontFamily:'DM Mono, monospace', whiteSpace:'nowrap' };
const td = { padding:'.4rem .6rem', fontSize:'.8rem', color:'var(--text2)' };
const mono = { fontFamily:'DM Mono, monospace' };
const btn = { padding:'.4rem .9rem', background:'var(--bg2)', border:'1px solid var(--border)',
  borderRadius:8, color:'var(--text2)', fontSize:'.8rem', cursor:'pointer' };
const btnPrimary = { ...btn, background:'var(--r)', border:'none', color:'#fff' };

const fmtCt = v => v == null ? '—' : (v / 100).toLocaleString('de-DE', { minimumFractionDigits:2, maximumFractionDigits:2 }) + ' €';
const STATUS = {
  ok:    ['zu senden', 'var(--green)'],
  same:  ['unverändert', 'var(--text3)'],
  skip:  ['übersprungen', 'var(--text3)'],
  error: ['Fehler', 'var(--red2)'],
};
const rank = { error: 0, ok: 1, skip: 2, same: 3 };

export default function SerPush({ articleIds, onClose }) {
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showXml, setShowXml] = useState(false);
  const [done, setDone] = useState(null);

  const preview = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/finance/price-tool/ser-push/preview', {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ articleIds }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Fehler ' + r.status);
      setPlan(d);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }, [articleIds]);

  useEffect(() => { preview(); }, [preview]);

  const send = async () => {
    const s = plan.summary;
    const text = `${s.send} Preis${s.send === 1 ? '' : 'e'} an SER senden?\n\n` +
      `Die STMUPD-Datei geht per SFTP in den SER-Eingang. SER übernimmt die Preise; ` +
      `alle übrigen Felder bleiben wie im eingelesenen Export.` +
      (plan.lastImport?.stale ? `\n\nACHTUNG: Der SER-Export ist ${plan.lastImport.ageDays} Tage alt.` : '');
    if (!window.confirm(text)) return;

    setBusy(true); setError('');
    try {
      const r = await fetch('/api/finance/price-tool/ser-push', {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ articleIds, confirm: true, signature: plan.signature }),
      });
      const d = await r.json();
      if (r.status === 409 && d.preview) { setPlan(d.preview); throw new Error(d.error); }
      if (!r.ok || d.error) throw new Error(d.error || 'Fehler ' + r.status);
      setDone(d);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const rows = plan ? [...plan.rows].sort((a, b) => rank[a.status] - rank[b.status] || a.articleNumber.localeCompare(b.articleNumber)) : [];

  return (
    <div style={{ background:'var(--bg1)', border:'1px solid var(--border)', borderRadius:9,
      padding:'1rem', marginBottom:'1rem' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'.8rem' }}>
        <h2 style={{ fontSize:'.95rem', fontWeight:600, color:'var(--text1)' }}>
          Push SER · {articleIds.length} Artikel ausgewählt
        </h2>
        <button onClick={onClose} style={{ ...btn, padding:'.2rem .6rem' }}>✕ Schließen</button>
      </div>

      {error && <div style={{ color:'var(--red2)', fontSize:'.82rem', marginBottom:'.6rem' }}>✗ {error}</div>}
      {!plan && busy && <div style={{ color:'var(--text3)', fontSize:'.82rem' }}>Lade Vorschau…</div>}

      {done && (
        <div style={{ background:'rgba(80,200,120,.08)', border:'1px solid rgba(80,200,120,.3)', borderRadius:8,
          padding:'.6rem .9rem', fontSize:'.82rem', color:'var(--text1)' }}>
          ✓ {done.sent.length} Preis{done.sent.length === 1 ? '' : 'e'} an SER übermittelt: <span style={mono}>{done.filename}</span>
          <div style={{ color:'var(--text3)', marginTop:'.3rem' }}>SER verarbeitet die Datei aus dem Eingang; bitte in SER stichprobenartig prüfen.</div>
        </div>
      )}

      {plan && !done && (
        <>
          <div style={{ fontSize:'.8rem', color:'var(--text2)', marginBottom:'.6rem' }}>
            <b style={{ color:'var(--text1)' }}>{plan.summary.send}</b> zu senden · {plan.summary.same} unverändert
            {plan.summary.skipped > 0 && <> · {plan.summary.skipped} übersprungen</>}
            {plan.summary.errors > 0 && <> · <span style={{ color:'var(--red2)' }}>{plan.summary.errors} mit Fehler</span></>}
            {plan.cachedAt && <> · Lexware-Stand {new Date(plan.cachedAt).toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' })}</>}
            {plan.lastImport && (
              <> · SER-Export vom {new Date(plan.lastImport.importedAt).toLocaleDateString('de-DE')}
                {plan.lastImport.stale && <span style={{ color:'var(--red2)', fontWeight:600 }}> ({plan.lastImport.ageDays} Tage alt)</span>}</>
            )}
          </div>

          <div style={{ overflowX:'auto', border:'1px solid var(--border)', borderRadius:8 }}>
            <table style={{ width:'100%', borderCollapse:'collapse', minWidth:640 }}>
              <thead>
                <tr style={{ background:'var(--bg2)' }}>
                  {['Artikel', 'Bezeichnung', 'SER bisher', 'Neu (Lexware)', 'Status'].map(h => <th key={h} style={th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} style={{ borderTop:'1px solid rgba(255,255,255,.04)' }}>
                    <td style={{ ...td, ...mono, fontSize:'.75rem', color:'var(--text3)' }}>{r.articleNumber}</td>
                    <td style={{ ...td, color:'var(--text1)' }}>{r.name}</td>
                    <td style={{ ...td, ...mono }}>{fmtCt(r.oldCents)}</td>
                    <td style={{ ...td, ...mono, fontWeight: r.status === 'ok' ? 600 : 400,
                      color: r.status === 'ok' ? 'var(--text1)' : undefined }}>{fmtCt(r.newCents)}</td>
                    <td style={{ ...td, color: STATUS[r.status][1] }}>
                      {STATUS[r.status][0]}{r.reason && <span style={{ color:'var(--text3)' }}> – {r.reason}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display:'flex', gap:'.5rem', marginTop:'.8rem', flexWrap:'wrap' }}>
            <button onClick={preview} disabled={busy} style={btn}>↻ Neu berechnen</button>
            {plan.xmlString && <button onClick={() => setShowXml(v => !v)} style={btn}>{showXml ? 'Datei ausblenden' : 'Datei ansehen'}</button>}
            <button onClick={send} disabled={busy || plan.summary.send === 0} style={btnPrimary}>
              {busy ? 'Sende…' : `An SER senden (${plan.summary.send})`}
            </button>
          </div>

          {showXml && plan.xmlString && (
            <pre style={{ marginTop:'.8rem', maxHeight:360, overflow:'auto', background:'var(--bg0)',
              border:'1px solid var(--border)', borderRadius:8, padding:'.7rem', fontSize:'.72rem', ...mono,
              color:'var(--text2)', whiteSpace:'pre' }}>{plan.xmlString}</pre>
          )}
        </>
      )}
    </div>
  );
}
