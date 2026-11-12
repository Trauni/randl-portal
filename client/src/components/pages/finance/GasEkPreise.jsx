import { useState, useEffect, useCallback } from 'react';

const eur = (n, stellen = 2) => Number(n).toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: 3 });
const datum = (iso) => iso.split('-').reverse().join('.');
const zeit = (s) => new Date(s).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });

const input = { background:'var(--bg0)', border:'1px solid var(--border)', borderRadius:6, padding:'.35rem .6rem', color:'var(--text1)', fontSize:'.85rem', boxSizing:'border-box' };
const label = { fontSize:'.68rem', color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:'.2rem' };
const th = { textAlign:'left', padding:'.4rem .6rem', fontSize:'.68rem', color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.06em' };
const td = { padding:'.4rem .6rem', fontSize:'.85rem', color:'var(--text1)', fontVariantNumeric:'tabular-nums' };

export default function GasEkPreise() {
  const [daten, setDaten] = useState(null);
  const [protokoll, setProtokoll] = useState([]);
  const [form, setForm] = useState({ ek_gruppe:'propan', preis_netto:'', gueltig_ab:'', notiz:'' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const laden = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([fetch('/api/finance/gas-auswertung/ek-preise'), fetch('/api/finance/gas-auswertung/ek-preise/protokoll')]);
      const da = await a.json(); const db = await b.json();
      if (!a.ok) throw new Error(da.error || 'Fehler');
      setDaten(da); setProtokoll(db.protokoll || []);
    } catch (e) { setMsg({ fehler: e.message }); }
  }, []);
  useEffect(() => { laden(); }, [laden]);

  const speichern = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/finance/gas-auswertung/ek-preise', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...form, preis_netto: form.preis_netto.replace(',', '.') }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Fehler');
      setMsg({ ok: d.ersetzt ? 'Preis für diesen Tag ersetzt (alter Stand im Protokoll).' : 'Preis gespeichert.' });
      setForm((f) => ({ ...f, preis_netto:'', notiz:'' }));
      laden();
    } catch (e) { setMsg({ fehler: e.message }); }
    finally { setBusy(false); }
  };

  if (!daten) return <div style={{ padding:'1.5rem', color:'var(--text2)' }}>{msg?.fehler || 'Lade …'}</div>;
  const basis = daten.gruppen[form.ek_gruppe]?.preisbasis === 'kg' ? '€ je kg' : '€ je Füllung';

  return (
    <div style={{ padding:'1.5rem', maxWidth:980 }}>
      <h1 style={{ fontSize:'1.2rem', color:'var(--text1)', marginBottom:'.25rem' }}>Einkaufspreise Gas</h1>
      <p style={{ color:'var(--text2)', fontSize:'.85rem', marginBottom:'1.25rem' }}>
        Lieferant Tyczka, Preise netto. Eine Änderung gilt ab dem Datum „gültig ab“. Alte Stände bleiben erhalten, jede Eingabe wird protokolliert.
      </p>

      <div style={{ background:'var(--bg1)', border:'1px solid var(--border)', borderRadius:10, padding:'1rem', marginBottom:'1.25rem' }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:'.75rem', alignItems:'end' }}>
          <div><label style={label}>Preisgruppe</label>
            <select style={{ ...input, width:'100%' }} value={form.ek_gruppe} onChange={(e) => setForm((f) => ({ ...f, ek_gruppe:e.target.value }))}>
              {Object.entries(daten.gruppen).map(([k, g]) => <option key={k} value={k}>{g.label}</option>)}
            </select></div>
          <div><label style={label}>Preis netto ({basis})</label>
            <input style={{ ...input, width:'100%' }} inputMode="decimal" value={form.preis_netto} onChange={(e) => setForm((f) => ({ ...f, preis_netto:e.target.value }))} placeholder="1,52" /></div>
          <div><label style={label}>Gültig ab</label>
            <input type="date" style={{ ...input, width:'100%' }} value={form.gueltig_ab} onChange={(e) => setForm((f) => ({ ...f, gueltig_ab:e.target.value }))} /></div>
          <div style={{ gridColumn:'span 2' }}><label style={label}>Notiz</label>
            <input style={{ ...input, width:'100%' }} maxLength={200} value={form.notiz} onChange={(e) => setForm((f) => ({ ...f, notiz:e.target.value }))} placeholder="z. B. verhandelt, unbefristet" /></div>
          <button onClick={speichern} disabled={busy || !form.preis_netto || !form.gueltig_ab}
            style={{ ...input, background:'var(--accent, #cc0000)', color:'#fff', border:'none', cursor:'pointer', fontWeight:600 }}>Speichern</button>
        </div>
        {msg?.fehler && <div style={{ color:'#cc0000', fontSize:'.8rem', marginTop:'.6rem' }}>{msg.fehler}</div>}
        {msg?.ok && <div style={{ color:'#1d7a4c', fontSize:'.8rem', marginTop:'.6rem' }}>{msg.ok}</div>}
      </div>

      <h2 style={{ fontSize:'.95rem', color:'var(--text1)', marginBottom:'.5rem' }}>Preise und Historie</h2>
      <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:'1.5rem' }}>
        <thead><tr><th style={th}>Gruppe</th><th style={th}>Gültig ab</th><th style={{ ...th, textAlign:'right' }}>Preis netto</th><th style={th}>Basis</th><th style={th}>Notiz</th><th style={th}>Erfasst</th></tr></thead>
        <tbody>
          {daten.preise.map((p) => (
            <tr key={p.id} style={{ borderTop:'1px solid var(--border)', background: p.aktuell ? 'rgba(29,122,76,.10)' : 'transparent', fontWeight: p.aktuell ? 600 : 400 }}>
              <td style={td}>{daten.gruppen[p.ek_gruppe]?.label || p.ek_gruppe}{p.aktuell && ' · aktuell'}</td>
              <td style={td}>{datum(p.gueltig_ab)}</td>
              <td style={{ ...td, textAlign:'right' }}>{eur(p.preis_netto)} €</td>
              <td style={td}>{p.preisbasis === 'kg' ? 'je kg' : 'je Füllung'}</td>
              <td style={td}>{p.notiz || ''}</td>
              <td style={{ ...td, color:'var(--text3)' }}>{p.erfasst_von}, {zeit(p.erfasst_am)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ fontSize:'.95rem', color:'var(--text1)', marginBottom:'.5rem' }}>Protokoll</h2>
      <table style={{ width:'100%', borderCollapse:'collapse' }}>
        <thead><tr><th style={th}>Zeitpunkt</th><th style={th}>Benutzer</th><th style={th}>Aktion</th><th style={th}>Gruppe</th><th style={th}>Gültig ab</th><th style={{ ...th, textAlign:'right' }}>Alt</th><th style={{ ...th, textAlign:'right' }}>Neu</th></tr></thead>
        <tbody>
          {protokoll.map((l) => (
            <tr key={l.id} style={{ borderTop:'1px solid var(--border)' }}>
              <td style={td}>{zeit(l.zeitpunkt)}</td><td style={td}>{l.benutzer}</td><td style={td}>{l.aktion}</td>
              <td style={td}>{l.ek_gruppe}</td><td style={td}>{datum(l.gueltig_ab)}</td>
              <td style={{ ...td, textAlign:'right' }}>{l.preis_alt == null ? '–' : `${eur(l.preis_alt)} €`}</td>
              <td style={{ ...td, textAlign:'right' }}>{eur(l.preis_neu)} €</td>
            </tr>
          ))}
          {!protokoll.length && <tr><td style={{ ...td, color:'var(--text3)' }} colSpan={7}>Noch keine Änderungen im Portal.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
