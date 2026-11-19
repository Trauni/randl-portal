import { useState, useEffect, useMemo } from 'react';
import { Panel } from '../../../ui';

import { EDIT_FELDER, GASARTEN, EK_GRUPPEN, JA_NEIN } from './artikelFelder';

async function api(url, opts) {
  const r = await fetch(url, opts);
  const d = await r.json();
  if (!r.ok || d.error) throw new Error(d.error || 'Fehler ' + r.status);
  return d;
}
const post = (pfad, body) => api('/api/finance/artikelstamm/' + pfad, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/**
 * Felder bearbeiten (einzeln oder Mehrfachauswahl, höchstens 500): nur angehakte Felder werden geändert,
 * angehakt und leer = Wert löschen. Dazu Löschen mit Prüfung und der Änderungsverlauf bei genau einem Artikel.
 * gewaehlt: Zeilen der Liste (nur Artikel aus dem Stamm), alle: komplette Liste (für Pfand-/Kaufflaschen-Auswahl).
 */
export default function ArtikelBearbeiten({ gewaehlt, alle, onFertig, onClose }) {
  const [aktiv, setAktiv] = useState(new Set());
  const [eingabe, setEingabe] = useState({});
  const [bezeichnung, setBezeichnung] = useState(null);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState('');
  const [meldung, setMeldung] = useState('');
  const [loeschInfo, setLoeschInfo] = useState(null);
  const [protokoll, setProtokoll] = useState([]);

  const nummern = useMemo(() => gewaehlt.map((a) => a.artikel_nr), [gewaehlt]);
  const einzel = gewaehlt.length === 1 ? gewaehlt[0] : null;
  const kaufListe = useMemo(() => alle.filter((a) => a.typ === 'S' && a.aktiv), [alle]);
  const pfandListe = useMemo(() => alle.filter((a) => a.typ === 'P' && a.aktiv), [alle]);

  useEffect(() => {
    setProtokoll([]);
    if (!einzel) return;
    api(`/api/finance/artikelstamm/${encodeURIComponent(einzel.artikel_nr)}/protokoll`).then((d) => setProtokoll(d.eintraege)).catch(() => {});
  }, [einzel?.artikel_nr, meldung]);

  const setze = (feld, wert) => { setEingabe((e) => ({ ...e, [feld]: wert })); setAktiv((p) => new Set(p).add(feld)); };

  const speichern = async () => {
    const werte = {};
    for (const f of aktiv) werte[f] = eingabe[f] ?? '';
    if (einzel && bezeichnung != null && bezeichnung !== einzel.bezeichnung) werte.bezeichnung = bezeichnung;
    setBusy(true); setFehler(''); setMeldung('');
    try {
      const r = await post('aendern', { nummern, werte });
      setMeldung(`${r.geaendert} Artikel geändert, ${r.unveraendert} unverändert.`);
      setAktiv(new Set()); setEingabe({}); setBezeichnung(null);
      onFertig();
    } catch (e) { setFehler(e.message); }
    finally { setBusy(false); }
  };

  const loeschenPruefen = async () => {
    setBusy(true); setFehler(''); setMeldung('');
    try { setLoeschInfo(await post('loeschen', { nummern, pruefen: true })); }
    catch (e) { setFehler(e.message); }
    finally { setBusy(false); }
  };
  const loeschen = async () => {
    setBusy(true); setFehler('');
    try {
      const r = await post('loeschen', { nummern });
      setMeldung(`${r.geloescht} Artikel gelöscht${r.blockiert.length ? `, ${r.blockiert.length} bleiben (noch in Verwendung)` : ''}.`);
      setLoeschInfo(null);
      onFertig(r.blockiert.map((b) => b.artikel_nr));
    } catch (e) { setFehler(e.message); }
    finally { setBusy(false); }
  };

  const titel = einzel ? `${einzel.artikel_nr} bearbeiten` : `${gewaehlt.length} Artikel gemeinsam bearbeiten`;
  const keineAenderung = !aktiv.size && (bezeichnung == null || bezeichnung === einzel?.bezeichnung);

  return (
    <Panel title={titel} actions={
      <>
        <button className="btn btn-secondary btn-sm" style={{ color: 'var(--err-fg)' }} disabled={busy} onClick={loeschenPruefen}>Löschen…</button>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Schließen</button>
      </>}>
      <div className="ui-panel-body">
        {fehler && <div className="alert alert-error">✗ {fehler}</div>}
        {meldung && <div className="alert alert-success">✓ {meldung}</div>}
        {loeschInfo && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 14, color: 'var(--text2)' }}>
            <b style={{ color: 'var(--text1)' }}>{loeschInfo.loeschbar} von {nummern.length} Artikeln können endgültig gelöscht werden.</b>
            {loeschInfo.blockiert.length > 0 && (
              <div style={{ marginTop: 6 }}>
                Diese bleiben stehen, weil sie noch verwendet werden (stattdessen auf inaktiv setzen):
                <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                  {loeschInfo.blockiert.map((b) => <li key={b.artikel_nr}>{b.artikel_nr} {b.bezeichnung}: {b.gruende.join(', ')}</li>)}
                </ul>
              </div>
            )}
            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
              {loeschInfo.loeschbar > 0 && <button className="btn btn-danger" disabled={busy} onClick={loeschen}>{loeschInfo.loeschbar} Artikel endgültig löschen</button>}
              <button className="btn btn-secondary" onClick={() => setLoeschInfo(null)}>Abbrechen</button>
            </div>
            <div className="ui-table-sub" style={{ marginTop: 6 }}>Gelöschte Artikel legt der SER-Import nicht wieder an.</div>
          </div>
        )}
        <p className="ui-table-sub" style={{ margin: '0 0 10px' }}>Nur angehakte Felder werden geändert. Angehakt und leer gelassen: Wert wird gelöscht.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 }}>
          {einzel && (
            <label style={{ fontSize: 13, color: 'var(--text2)', gridColumn: '1 / -1' }}>Bezeichnung
              <input className="form-input" style={{ display: 'block', marginTop: 2 }} value={bezeichnung ?? einzel.bezeichnung ?? ''} onChange={(e) => setBezeichnung(e.target.value)} />
            </label>
          )}
          {EDIT_FELDER.map(([feld, label, typ, hinweis]) => (
            <div key={feld} style={{ fontSize: 13, color: 'var(--text2)' }}>
              <label>
                <input type="checkbox" checked={aktiv.has(feld)} style={{ accentColor: 'var(--r)' }}
                  onChange={(e) => setAktiv((prev) => { const n = new Set(prev); e.target.checked ? n.add(feld) : n.delete(feld); return n; })} /> {label}
              </label>
              {typ === 'pfand' || typ === 'kauf' ? (
                <select className="form-select" style={{ display: 'block', marginTop: 2 }} value={eingabe[feld] ?? ''} onChange={(e) => setze(feld, e.target.value)} aria-label={label}>
                  <option value="">– keiner –</option>
                  {(typ === 'kauf' ? kaufListe : pfandListe).map((p) => <option key={p.artikel_nr} value={p.artikel_nr}>{p.artikel_nr} {p.bezeichnung}</option>)}
                </select>
              ) : typ === 'gasart' || typ === 'ekgruppe' ? (
                <select className="form-select" style={{ display: 'block', marginTop: 2 }} value={eingabe[feld] ?? ''} onChange={(e) => setze(feld, e.target.value)} aria-label={label}>
                  <option value="">–</option>
                  {typ === 'gasart' ? GASARTEN.map((g) => <option key={g} value={g}>{g}</option>) : Object.entries(EK_GRUPPEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              ) : typ.startsWith('select:') ? (
                <select className="form-select" style={{ display: 'block', marginTop: 2 }} value={eingabe[feld] ?? ''} onChange={(e) => setze(feld, e.target.value)} aria-label={label}>
                  <option value="">–</option>
                  {typ.slice(7).split(',').map((v) => <option key={v} value={v}>{JA_NEIN[feld] ? JA_NEIN[feld][v] : v}</option>)}
                </select>
              ) : (
                <input className="form-input" style={{ display: 'block', marginTop: 2 }} placeholder={hinweis} value={eingabe[feld] ?? ''} onChange={(e) => setze(feld, e.target.value)} aria-label={label} />
              )}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="btn btn-primary" disabled={busy || keineAenderung} onClick={speichern}>{busy ? 'Speichere…' : `Auf ${gewaehlt.length} Artikel anwenden`}</button>
        </div>
        {protokoll.length > 0 && (
          <details style={{ marginTop: 14, fontSize: 13, color: 'var(--text2)' }}>
            <summary style={{ cursor: 'pointer' }}>Änderungsverlauf ({protokoll.length})</summary>
            <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
              {protokoll.map((p, i) => <li key={i}>{new Date(p.geaendert_am).toLocaleString('de-DE')} · {p.von_name || '–'}: {p.feld} „{p.alt ?? '–'}“ → „{p.neu ?? '–'}“</li>)}
            </ul>
          </details>
        )}
      </div>
    </Panel>
  );
}
