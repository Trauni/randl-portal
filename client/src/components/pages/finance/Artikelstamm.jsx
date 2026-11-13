import { useState, useEffect, useMemo, useRef, useCallback } from 'react';

// #552 Artikelstamm: Artikel aus dem SER-Export einlesen (nur neue Artikel und leere Felder,
// nichts Vorhandenes wird überschrieben) und die komplette Liste ansehen.

const card = { background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 10, padding: '1rem', marginBottom: '1rem' };
const th = { textAlign: 'left', padding: '.4rem .6rem', fontSize: '.68rem', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' };
const td = { padding: '.4rem .6rem', fontSize: '.82rem', color: 'var(--text1)', fontVariantNumeric: 'tabular-nums', verticalAlign: 'top' };
const btn = { padding: '.4rem .9rem', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text2)', fontSize: '.8rem', cursor: 'pointer' };
const btnPrimary = { ...btn, background: 'var(--r)', border: 'none', color: '#fff' };
const inp = { background: 'var(--bg0)', border: '1px solid var(--border)', borderRadius: 6, padding: '.35rem .6rem', color: 'var(--text1)', fontSize: '.85rem', boxSizing: 'border-box' };

const TYPEN = { F: 'Füllung', P: 'Pfand', S: 'Sonstiges', V: 'Provision' };
const eur = c => (c == null ? '–' : (c / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €');
const zahl = v => (v == null ? '–' : Number(v).toLocaleString('de-DE', { maximumFractionDigits: 3 }));

async function api(url, opts) {
  const r = await fetch(url, opts);
  const d = await r.json();
  if (!r.ok || d.error) throw new Error(d.error || 'Fehler ' + r.status);
  return d;
}

export default function Artikelstamm() {
  const [artikel, setArtikel] = useState(null);
  const [fehler, setFehler] = useState('');
  const [suche, setSuche] = useState('');
  const [typ, setTyp] = useState('');
  const [nurAktiv, setNurAktiv] = useState(true);
  const [datei, setDatei] = useState(null);
  const [vorschau, setVorschau] = useState(null);
  const [ergebnis, setErgebnis] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const laden = useCallback(() => api('/api/finance/artikelstamm').then(d => setArtikel(d.artikel)).catch(e => setFehler(e.message)), []);
  useEffect(() => { laden(); }, [laden]);

  const senden = async (pfad, f) => {
    const fd = new FormData();
    fd.append('file', f);
    return api('/api/finance/artikelstamm/' + pfad, { method: 'POST', body: fd });
  };

  const waehle = async e => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setBusy(true); setFehler(''); setErgebnis(null); setVorschau(null);
    try { setVorschau(await senden('vorschau', f)); setDatei(f); }
    catch (err) { setFehler(err.message); }
    finally { setBusy(false); }
  };

  const uebernehmen = async () => {
    setBusy(true); setFehler('');
    try { setErgebnis(await senden('import', datei)); setVorschau(null); setDatei(null); await laden(); }
    catch (err) { setFehler(err.message); }
    finally { setBusy(false); }
  };

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return (artikel || []).filter(a => (!nurAktiv || a.aktiv) && (!typ || a.typ === typ)
      && (!q || a.artikel_nr.toLowerCase().includes(q) || (a.bezeichnung || '').toLowerCase().includes(q)));
  }, [artikel, suche, typ, nurAktiv]);

  const s = (vorschau || ergebnis)?.summary;
  const r = vorschau || ergebnis;

  return (
    <div style={{ maxWidth: 1200 }}>
      <h1 style={{ fontSize: '1.3rem', color: 'var(--text1)', margin: '0 0 .3rem' }}>Artikelstamm</h1>
      <p style={{ color: 'var(--text3)', fontSize: '.82rem', margin: '0 0 1rem' }}>
        Quelle für die Fahrer-App. Der Import aus SER ergänzt neue Artikel und leere Felder, vorhandene Werte (z. B. neuere Preise) bleiben unverändert.
      </p>

      <div style={card}>
        <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={waehle} style={{ display: 'none' }} />
          <button style={btnPrimary} disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? 'Moment…' : 'SER-Export prüfen'}
          </button>
          {vorschau && <button style={btn} disabled={busy} onClick={uebernehmen}>Übernehmen ({datei?.name})</button>}
          {vorschau && <button style={btn} onClick={() => { setVorschau(null); setDatei(null); }}>Verwerfen</button>}
        </div>
        {fehler && <div style={{ color: 'var(--red2)', fontSize: '.82rem', marginTop: '.6rem' }}>✗ {fehler}</div>}

        {s && (
          <div style={{ marginTop: '.8rem', fontSize: '.84rem', color: 'var(--text2)' }}>
            <b style={{ color: 'var(--text1)' }}>{ergebnis ? 'Übernommen:' : 'Vorschau (noch nichts gespeichert):'}</b>{' '}
            {s.neu} neu · {s.ergaenzt} ergänzt · {s.abweichend} abweichend (bleiben unverändert) · {s.unveraendert} unverändert · {s.nurImPortal} nur im Portal
            {r.warnings?.length > 0 && (
              <details style={{ marginTop: '.5rem' }}>
                <summary style={{ cursor: 'pointer' }}>{r.warnings.length} Hinweise</summary>
                <ul style={{ margin: '.4rem 0 0', paddingLeft: '1.2rem' }}>{r.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
              </details>
            )}
            {r.abweichend?.length > 0 && (
              <details style={{ marginTop: '.4rem' }}>
                <summary style={{ cursor: 'pointer' }}>Abweichungen (Portal bleibt)</summary>
                <ul style={{ margin: '.4rem 0 0', paddingLeft: '1.2rem' }}>
                  {r.abweichend.map(a => (
                    <li key={a.artikel_nr}>{a.artikel_nr} {a.bezeichnung}: {a.felder.map(f => `${f.feld} Portal ${f.portal} / SER ${f.export}`).join('; ')}</li>
                  ))}
                </ul>
              </details>
            )}
            {vorschau?.neu?.length > 0 && (
              <details style={{ marginTop: '.4rem' }}>
                <summary style={{ cursor: 'pointer' }}>Neue Artikel ({vorschau.neu.length})</summary>
                <ul style={{ margin: '.4rem 0 0', paddingLeft: '1.2rem' }}>
                  {vorschau.neu.map(n => <li key={n.artikel_nr}>{n.artikel_nr} {n.bezeichnung} ({TYPEN[n.typ] || n.typ || '–'}{n.aktiv ? '' : ', inaktiv'})</li>)}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '.6rem', marginBottom: '.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input style={{ ...inp, width: 240 }} placeholder="Suche Nummer oder Name" value={suche} onChange={e => setSuche(e.target.value)} />
        <select style={inp} value={typ} onChange={e => setTyp(e.target.value)}>
          <option value="">Alle Typen</option>
          {Object.entries(TYPEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label style={{ fontSize: '.82rem', color: 'var(--text2)' }}>
          <input type="checkbox" checked={nurAktiv} onChange={e => setNurAktiv(e.target.checked)} /> nur aktive
        </label>
        <span style={{ fontSize: '.8rem', color: 'var(--text3)' }}>{artikel ? `${gefiltert.length} von ${artikel.length}` : 'lade…'}</span>
      </div>

      <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            {['Nr.', 'Bezeichnung', 'Typ', 'UN', 'Klasse', 'Kat.', 'kg', 'Liter', 'Netto', 'MwSt.', 'Pfand'].map(h => <th key={h} style={th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {gefiltert.map(a => (
              <tr key={a.artikel_nr} style={{ borderTop: '1px solid var(--border)', opacity: a.aktiv ? 1 : .5 }}>
                <td style={td}>{a.artikel_nr}</td>
                <td style={td}>{a.bezeichnung}{!a.aktiv && ' (inaktiv)'}</td>
                <td style={td}>{TYPEN[a.typ] || '–'}</td>
                <td style={td}>{a.un_nr || '–'}</td>
                <td style={td}>{a.gefahrklasse || '–'}</td>
                <td style={td}>{a.befoerderungskategorie || '–'}</td>
                <td style={td}>{zahl(a.fuellgewicht_kg)}</td>
                <td style={td}>{zahl(a.inhalt_l)}</td>
                <td style={td}>{eur(a.preis_netto_cent)}</td>
                <td style={td}>{a.mwst_satz == null ? '–' : `${zahl(a.mwst_satz)} %`}</td>
                <td style={td}>{a.pfand_artikel_nr || '–'}</td>
              </tr>
            ))}
            {artikel && !gefiltert.length && <tr><td style={td} colSpan={11}>Keine Artikel.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
