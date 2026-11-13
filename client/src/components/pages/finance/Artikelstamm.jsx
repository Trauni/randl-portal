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

// Felder der Bearbeitung: [Spalte, Beschriftung, Eingabe-Typ, Hinweis]
const EDIT_FELDER = [
  ['un_nr', 'UN-Nr.', 'text', '4 Ziffern, z. B. 1965'],
  ['gefahrklasse', 'Gefahrklasse', 'text', 'z. B. 2.1'],
  ['ggvs_faktor', 'ADR-Faktor', 'select:50,3,1', 'ADR 1.1.3.6 (50 = Kat. 1, 3 = Kat. 2, 1 = Kat. 3)'],
  ['preis_netto_cent', 'Netto-Preis (Cent)', 'text', 'z. B. 2926 für 29,26 €'],
  ['mwst_satz', 'MwSt. %', 'select:19,7', ''],
  ['fuellgewicht_kg', 'Gewicht (kg)', 'text', ''],
  ['inhalt_l', 'Inhalt (Liter)', 'text', ''],
  ['pfand_artikel_nr', 'Pfandartikel', 'pfand', 'Leergut-Rücknahme, nur Typ Pfand'],
  ['kaufflasche_artikel_nr', 'Kaufflasche', 'kauf', 'wird mit der Füllung verkauft (1:1 oder 1:0)'],
  ['aktiv', 'Status', 'select:1,0', '1 = aktiv, 0 = inaktiv'],
];
const aktivText = { 1: 'aktiv', 0: 'inaktiv' };

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
  const [luecke, setLuecke] = useState('');
  const [neu, setNeu] = useState(null);               // Formular „Neuer Artikel“ (null = zu)
  const [loeschInfo, setLoeschInfo] = useState(null); // Ergebnis der Löschprüfung
  const [auswahl, setAuswahl] = useState(new Set());
  const [aktiv, setAktiv] = useState(new Set());      // Felder, die geändert werden sollen
  const [eingabe, setEingabe] = useState({});
  const [bezeichnung, setBezeichnung] = useState(null);
  const [meldung, setMeldung] = useState('');
  const [protokoll, setProtokoll] = useState([]);
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
    const woerter = suche.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (artikel || []).filter(a => {
      if (nurAktiv && !a.aktiv) return false;
      if (typ && a.typ !== typ) return false;
      if (luecke === 'pfand' && !(a.typ === 'F' && !a.pfand_artikel_nr)) return false;
      if (luecke === 'un' && !(a.typ === 'F' && !a.un_nr)) return false;
      const heu = `${a.artikel_nr} ${a.bezeichnung || ''}`.toLowerCase();
      return woerter.every(w => heu.includes(w));
    });
  }, [artikel, suche, typ, nurAktiv, luecke]);

  const kaufListe = useMemo(() => (artikel || []).filter(a => a.typ === 'S' && a.aktiv), [artikel]);
  const pfandListe = useMemo(() => (artikel || []).filter(a => a.typ === 'P' && a.aktiv), [artikel]);
  const gewaehlt = useMemo(() => (artikel || []).filter(a => auswahl.has(a.artikel_nr)), [artikel, auswahl]);
  const alleSichtbar = gefiltert.length > 0 && gefiltert.every(a => auswahl.has(a.artikel_nr));

  const umschalten = nr => { setLoeschInfo(null); setAuswahl(prev => { const n = new Set(prev); n.has(nr) ? n.delete(nr) : n.add(nr); return n; }); };
  const alleUmschalten = () => setAuswahl(prev => {
    const n = new Set(prev);
    gefiltert.forEach(a => (alleSichtbar ? n.delete(a.artikel_nr) : n.add(a.artikel_nr)));
    return n;
  });

  // Protokoll bei genau einem gewählten Artikel
  const einzel = gewaehlt.length === 1 ? gewaehlt[0].artikel_nr : null;
  useEffect(() => {
    setProtokoll([]);
    if (!einzel) return;
    api(`/api/finance/artikelstamm/${encodeURIComponent(einzel)}/protokoll`).then(d => setProtokoll(d.eintraege)).catch(() => {});
  }, [einzel, artikel]);

  const post = (pfad, body) => api('/api/finance/artikelstamm/' + pfad, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  const anlegen = async () => {
    const body = Object.fromEntries(Object.entries(neu).filter(([, v]) => v !== '' && v != null));
    setBusy(true); setFehler(''); setMeldung('');
    try {
      const r = await post('anlegen', body);
      setMeldung(`Artikel ${r.artikel_nr} angelegt.`);
      setNeu(null);
      await laden();
    } catch (err) { setFehler(err.message); }
    finally { setBusy(false); }
  };

  const loeschenPruefen = async () => {
    setBusy(true); setFehler(''); setMeldung('');
    try { setLoeschInfo(await post('loeschen', { nummern: [...auswahl], pruefen: true })); }
    catch (err) { setFehler(err.message); }
    finally { setBusy(false); }
  };

  const loeschen = async () => {
    setBusy(true); setFehler('');
    try {
      const r = await post('loeschen', { nummern: [...auswahl] });
      setMeldung(`${r.geloescht} Artikel gelöscht${r.blockiert.length ? `, ${r.blockiert.length} bleiben (noch in Verwendung)` : ''}.`);
      setLoeschInfo(null);
      setAuswahl(new Set(r.blockiert.map(b => b.artikel_nr)));
      await laden();
    } catch (err) { setFehler(err.message); }
    finally { setBusy(false); }
  };

  const speichern = async () => {
    const werte = {};
    for (const f of aktiv) werte[f] = eingabe[f] ?? '';
    if (einzel && bezeichnung != null && bezeichnung !== gewaehlt[0].bezeichnung) werte.bezeichnung = bezeichnung;
    setBusy(true); setFehler(''); setMeldung('');
    try {
      const r = await api('/api/finance/artikelstamm/aendern', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nummern: [...auswahl], werte }),
      });
      setMeldung(`${r.geaendert} Artikel geändert, ${r.unveraendert} unverändert.`);
      setAktiv(new Set()); setEingabe({}); setBezeichnung(null);
      await laden();
    } catch (err) { setFehler(err.message); }
    finally { setBusy(false); }
  };

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
        <select style={inp} value={luecke} onChange={e => setLuecke(e.target.value)}>
          <option value="">Alle Füllungen/Artikel</option>
          <option value="pfand">Füllung ohne Pfandartikel</option>
          <option value="un">Füllung ohne UN-Nr.</option>
        </select>
        <label style={{ fontSize: '.82rem', color: 'var(--text2)' }}>
          <input type="checkbox" checked={nurAktiv} onChange={e => setNurAktiv(e.target.checked)} /> nur aktive
        </label>
        <span style={{ fontSize: '.8rem', color: 'var(--text3)' }}>{artikel ? `${gefiltert.length} von ${artikel.length}` : 'lade…'}</span>
      </div>

      <div style={{ marginBottom: '.6rem' }}>
        <button style={btn} onClick={() => setNeu(neu ? null : { artikel_nr: '', bezeichnung: '', typ: 'F' })}>
          {neu ? 'Formular schließen' : '+ Neuer Artikel'}
        </button>
      </div>
      {neu && (
        <div style={card}>
          <b style={{ color: 'var(--text1)', fontSize: '.88rem' }}>Neuen Artikel anlegen</b>
          <div style={{ fontSize: '.78rem', color: 'var(--text3)', margin: '.3rem 0 .6rem' }}>
            Nummer wie in SER/Lexware ohne Präfix (z. B. 7801200). Weitere Angaben kannst du danach in der Bearbeitung ergänzen.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '.6rem' }}>
            {[['artikel_nr', 'Nummer *'], ['bezeichnung', 'Bezeichnung *'], ['un_nr', 'UN-Nr.'], ['gefahrklasse', 'Gefahrklasse'], ['preis_netto_cent', 'Netto-Preis (Cent)']].map(([f, l]) => (
              <label key={f} style={{ fontSize: '.78rem', color: 'var(--text2)' }}>{l}
                <input style={{ ...inp, width: '100%', display: 'block', marginTop: 2 }} value={neu[f] ?? ''} onChange={e => setNeu({ ...neu, [f]: e.target.value })} />
              </label>
            ))}
            <label style={{ fontSize: '.78rem', color: 'var(--text2)' }}>Typ *
              <select style={{ ...inp, width: '100%', display: 'block', marginTop: 2 }} value={neu.typ} onChange={e => setNeu({ ...neu, typ: e.target.value })}>
                {Object.entries(TYPEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
          </div>
          <div style={{ marginTop: '.8rem' }}>
            <button style={btnPrimary} disabled={busy || !neu.artikel_nr || !neu.bezeichnung} onClick={anlegen}>{busy ? 'Speichere…' : 'Anlegen'}</button>
          </div>
        </div>
      )}
      {meldung && <div style={{ color: 'var(--text2)', fontSize: '.82rem', marginBottom: '.6rem' }}>✓ {meldung}</div>}
      {gewaehlt.length > 0 && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.6rem' }}>
            <b style={{ color: 'var(--text1)', fontSize: '.88rem' }}>
              {gewaehlt.length === 1 ? `${gewaehlt[0].artikel_nr} bearbeiten` : `${gewaehlt.length} Artikel gemeinsam bearbeiten`}
            </b>
            <div style={{ display: 'flex', gap: '.5rem' }}>
              <button style={{ ...btn, color: 'var(--red2)' }} disabled={busy} onClick={loeschenPruefen}>Löschen…</button>
              <button style={btn} onClick={() => { setAuswahl(new Set()); setAktiv(new Set()); setEingabe({}); setBezeichnung(null); setLoeschInfo(null); }}>Auswahl aufheben</button>
            </div>
          </div>
          {loeschInfo && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '.7rem', marginBottom: '.7rem', fontSize: '.82rem', color: 'var(--text2)' }}>
              <b style={{ color: 'var(--text1)' }}>{loeschInfo.loeschbar} von {auswahl.size} Artikeln können endgültig gelöscht werden.</b>
              {loeschInfo.blockiert.length > 0 && (
                <div style={{ marginTop: '.4rem' }}>
                  Diese bleiben stehen, weil sie noch verwendet werden (stattdessen auf inaktiv setzen):
                  <ul style={{ margin: '.3rem 0 0', paddingLeft: '1.2rem' }}>
                    {loeschInfo.blockiert.map(b => <li key={b.artikel_nr}>{b.artikel_nr} {b.bezeichnung}: {b.gruende.join(', ')}</li>)}
                  </ul>
                </div>
              )}
              <div style={{ marginTop: '.6rem', display: 'flex', gap: '.5rem' }}>
                {loeschInfo.loeschbar > 0 && <button style={{ ...btnPrimary, background: 'var(--red2)' }} disabled={busy} onClick={loeschen}>{loeschInfo.loeschbar} Artikel endgültig löschen</button>}
                <button style={btn} onClick={() => setLoeschInfo(null)}>Abbrechen</button>
              </div>
              <div style={{ marginTop: '.4rem', fontSize: '.74rem', color: 'var(--text3)' }}>Gelöschte Artikel legt der SER-Import nicht wieder an.</div>
            </div>
          )}
          <div style={{ fontSize: '.78rem', color: 'var(--text3)', marginBottom: '.6rem' }}>
            Nur angehakte Felder werden geändert. Leer gelassen und angehakt: Wert wird gelöscht.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '.6rem' }}>
            {einzel && (
              <label style={{ fontSize: '.78rem', color: 'var(--text2)', gridColumn: '1 / -1' }}>Bezeichnung
                <input style={{ ...inp, width: '100%', display: 'block', marginTop: 2 }}
                  value={bezeichnung ?? gewaehlt[0].bezeichnung ?? ''} onChange={e => setBezeichnung(e.target.value)} />
              </label>
            )}
            {EDIT_FELDER.map(([feld, label, typ_, hinweis]) => (
              <div key={feld} style={{ fontSize: '.78rem', color: 'var(--text2)' }}>
                <label>
                  <input type="checkbox" checked={aktiv.has(feld)}
                    onChange={e => setAktiv(prev => { const n = new Set(prev); e.target.checked ? n.add(feld) : n.delete(feld); return n; })} /> {label}
                </label>
                {typ_ === 'pfand' || typ_ === 'kauf' ? (
                  <select style={{ ...inp, width: '100%', display: 'block', marginTop: 2 }} value={eingabe[feld] ?? ''}
                    onChange={e => { setEingabe({ ...eingabe, [feld]: e.target.value }); setAktiv(p => new Set(p).add(feld)); }}>
                    <option value="">– keiner –</option>
                    {(typ_ === 'kauf' ? kaufListe : pfandListe).map(p => <option key={p.artikel_nr} value={p.artikel_nr}>{p.artikel_nr} {p.bezeichnung}</option>)}
                  </select>
                ) : typ_.startsWith('select:') ? (
                  <select style={{ ...inp, width: '100%', display: 'block', marginTop: 2 }} value={eingabe[feld] ?? ''}
                    onChange={e => { setEingabe({ ...eingabe, [feld]: e.target.value }); setAktiv(p => new Set(p).add(feld)); }}>
                    <option value="">–</option>
                    {typ_.slice(7).split(',').map(v => <option key={v} value={v}>{feld === 'aktiv' ? aktivText[v] : v}</option>)}
                  </select>
                ) : (
                  <input style={{ ...inp, width: '100%', display: 'block', marginTop: 2 }} placeholder={hinweis} value={eingabe[feld] ?? ''}
                    onChange={e => { setEingabe({ ...eingabe, [feld]: e.target.value }); setAktiv(p => new Set(p).add(feld)); }} />
                )}
              </div>
            ))}
          </div>
          <div style={{ marginTop: '.8rem', display: 'flex', gap: '.6rem', alignItems: 'center' }}>
            <button style={btnPrimary} disabled={busy || (!aktiv.size && (bezeichnung == null || bezeichnung === gewaehlt[0]?.bezeichnung))} onClick={speichern}>
              {busy ? 'Speichere…' : `Auf ${gewaehlt.length} Artikel anwenden`}
            </button>
          </div>
          {protokoll.length > 0 && (
            <details style={{ marginTop: '.8rem', fontSize: '.78rem', color: 'var(--text2)' }}>
              <summary style={{ cursor: 'pointer' }}>Änderungsprotokoll ({protokoll.length})</summary>
              <ul style={{ margin: '.4rem 0 0', paddingLeft: '1.2rem' }}>
                {protokoll.map((p, i) => (
                  <li key={i}>{new Date(p.geaendert_am).toLocaleString('de-DE')} · {p.von_name || '–'}: {p.feld} „{p.alt ?? '–'}“ → „{p.neu ?? '–'}“</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th}><input type="checkbox" checked={alleSichtbar} onChange={alleUmschalten} title="Alle sichtbaren auswählen" /></th>
            {['Nr.', 'Bezeichnung', 'Typ', 'UN', 'Klasse', 'Kat.', 'kg', 'Liter', 'Netto', 'MwSt.', 'Pfand', 'Kaufflasche'].map(h => <th key={h} style={th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {gefiltert.map(a => (
              <tr key={a.artikel_nr} style={{ borderTop: '1px solid var(--border)', opacity: a.aktiv ? 1 : .5 }}>
                <td style={td}><input type="checkbox" checked={auswahl.has(a.artikel_nr)} onChange={() => umschalten(a.artikel_nr)} /></td>
                <td style={td}>{a.artikel_nr}</td>
                <td style={td}>{a.bezeichnung}{!a.aktiv && ' (inaktiv)'}</td>
                <td style={td}>{TYPEN[a.typ] || '–'}</td>
                <td style={td}>{a.un_nr || '–'}</td>
                <td style={td}>{a.gefahrklasse || '–'}</td>
                <td style={td}>{a.befoerderungskategorie || '–'}{a.ggvs_faktor && !a.befoerderungskategorie ? ` (×${a.ggvs_faktor})` : ''}</td>
                <td style={td}>{zahl(a.fuellgewicht_kg)}</td>
                <td style={td}>{zahl(a.inhalt_l)}</td>
                <td style={td}>{eur(a.preis_netto_cent)}</td>
                <td style={td}>{a.mwst_satz == null ? '–' : `${zahl(a.mwst_satz)} %`}</td>
                <td style={td}>{a.pfand_artikel_nr || '–'}</td>
                <td style={td}>{a.kaufflasche_artikel_nr || '–'}</td>
              </tr>
            ))}
            {artikel && !gefiltert.length && <tr><td style={td} colSpan={13}>Keine Artikel.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
