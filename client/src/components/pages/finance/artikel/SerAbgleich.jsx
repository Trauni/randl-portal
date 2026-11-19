import { useState, useEffect, useCallback, useRef } from 'react';
import { Panel, Tag } from '../../../ui';

// Ein SER-Import für beides (#606): die Datei produkte_tab.csv füllt den Artikelstamm (neue Artikel, leere Felder)
// und ersetzt den gespeicherten SER-Produktstamm, den Push SER braucht. Vorher gab es dafür zwei Uploads.
// Ablauf: Datei wählen -> Vorschau (schreibt nichts) -> Übernehmen (beide Schritte).

const STALE_DAYS = 7; // ab diesem Alter gilt der SER-Stand als veraltet (siehe #256)
const TYPEN = { F: 'Füllung', P: 'Pfand', S: 'Steuer/Nutzung', V: 'Provision' };

function alter(datum) {
  const tage = Math.floor((Date.now() - new Date(datum).getTime()) / 86400000);
  return { tage, text: tage === 0 ? 'heute' : tage === 1 ? 'gestern' : `vor ${tage} Tagen` };
}

async function api(url, opts) {
  const r = await fetch(url, opts);
  const d = await r.json();
  if (!r.ok || d.error) throw new Error(d.error || 'Fehler ' + r.status);
  return d;
}
const senden = (url, datei) => { const fd = new FormData(); fd.append('file', datei); return api(url, { method: 'POST', body: fd }); };

export default function SerAbgleich({ onUebernommen }) {
  const [status, setStatus] = useState(null);
  const [datei, setDatei] = useState(null);
  const [vorschau, setVorschau] = useState(null);
  const [ergebnis, setErgebnis] = useState(null);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState('');
  const [warnung, setWarnung] = useState('');
  const fileRef = useRef(null);

  const ladeStatus = useCallback(() => api('/api/finance/price-tool/ser-import').then(setStatus).catch((e) => setFehler(e.message)), []);
  useEffect(() => { ladeStatus(); }, [ladeStatus]);

  const waehle = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setBusy(true); setFehler(''); setWarnung(''); setErgebnis(null); setVorschau(null);
    try { setVorschau(await senden('/api/finance/artikelstamm/vorschau', f)); setDatei(f); }
    catch (err) { setFehler(err.message); }
    finally { setBusy(false); }
  };

  const uebernehmen = async () => {
    setBusy(true); setFehler(''); setWarnung('');
    try {
      const stamm = await senden('/api/finance/artikelstamm/import', datei);
      setErgebnis(stamm); setVorschau(null);
      try { setStatus(await senden('/api/finance/price-tool/ser-import', datei)); }
      catch (err) { setWarnung(`Artikelstamm übernommen, aber der SER-Produktstamm für Push SER konnte nicht eingelesen werden: ${err.message}`); }
      setDatei(null);
      onUebernommen();
    } catch (err) { setFehler(err.message); }
    finally { setBusy(false); }
  };

  const last = status?.lastImport;
  const a = last ? alter(last.importedAt) : null;
  const veraltet = a && a.tage >= STALE_DAYS;
  const s = status?.summary;
  const r = vorschau || ergebnis;
  const z = r?.summary;

  return (
    <Panel title="SER-Export" actions={
      <>
        <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={waehle} style={{ display: 'none' }} />
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => fileRef.current?.click()} title="SER-Export produkte_tab.csv prüfen (schreibt noch nichts)">
          {busy ? 'Moment…' : 'SER-Export prüfen'}
        </button>
        {vorschau && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={uebernehmen}>Übernehmen ({datei?.name})</button>}
        {vorschau && <button className="btn btn-secondary btn-sm" onClick={() => { setVorschau(null); setDatei(null); }}>Verwerfen</button>}
      </>}>
      <div className="ui-panel-body" style={{ fontSize: 14, color: 'var(--text2)' }}>
        <div>
          <b style={{ color: 'var(--text1)' }}>SER-Produktstamm für Push SER:</b>{' '}
          {!status ? 'lade…' : !last ? 'noch nicht eingelesen' : (
            <>
              <span style={veraltet ? { color: 'var(--err-fg)', fontWeight: 700 } : undefined}
                title={veraltet ? 'Vor dem Preis-Push nach SER einen frischen Export einlesen' : undefined}>
                Stand {new Date(last.importedAt).toLocaleDateString('de-DE')} ({a.text})
              </span>
              {' · '}{last.storedTotal} Artikel · {last.sourceFile}{last.importedBy && <> · {last.importedBy}</>}
              {veraltet && <> <Tag tone="err">veraltet</Tag></>}
            </>
          )}
        </div>
        {s && (
          <div style={{ marginTop: 4 }}>
            {s.matched} von {s.rgArticles} RG-Artikeln in SER gefunden · {s.contentDiffers} Inhalt abweichend · {s.priceDiffers} Preis abweichend · {s.nameDiffers} Name abweichend
            {s.withoutSer > 0 && <> · <b style={{ color: 'var(--err-fg)' }}>{s.withoutSer} ohne SER-Eintrag</b></>}
          </div>
        )}
        {status?.withoutSer?.length > 0 && (
          <details style={{ marginTop: 6 }}>
            <summary style={{ cursor: 'pointer' }}>Ohne SER-Eintrag ({status.withoutSer.length})</summary>
            <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
              {status.withoutSer.map((w) => <li key={w.id}>{w.articleNumber} {w.name}{w.serInactive && ' (in SER inaktiv)'}</li>)}
            </ul>
          </details>
        )}
        {fehler && <div className="alert alert-error" style={{ marginTop: 10 }}>✗ {fehler}</div>}
        {warnung && <div className="alert alert-error" style={{ marginTop: 10 }}>{warnung}</div>}

        {z && (
          <div style={{ marginTop: 12 }}>
            <b style={{ color: 'var(--text1)' }}>{ergebnis ? 'Übernommen:' : 'Vorschau (noch nichts gespeichert):'}</b>{' '}
            {z.neu} neu · {z.ergaenzt} ergänzt · {z.abweichend} abweichend (bleiben unverändert) · {z.unveraendert} unverändert · {z.nurImPortal} nur im Portal
            {r.warnings?.length > 0 && (
              <details style={{ marginTop: 6 }}>
                <summary style={{ cursor: 'pointer' }}>{r.warnings.length} Hinweise</summary>
                <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>{r.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
              </details>
            )}
            {r.abweichend?.length > 0 && (
              <details style={{ marginTop: 6 }}>
                <summary style={{ cursor: 'pointer' }}>Abweichungen (Portal bleibt)</summary>
                <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                  {r.abweichend.map((x) => <li key={x.artikel_nr}>{x.artikel_nr} {x.bezeichnung}: {x.felder.map((f) => `${f.feld} Portal ${f.portal} / SER ${f.export}`).join('; ')}</li>)}
                </ul>
              </details>
            )}
            {vorschau?.neu?.length > 0 && (
              <details style={{ marginTop: 6 }}>
                <summary style={{ cursor: 'pointer' }}>Neue Artikel ({vorschau.neu.length})</summary>
                <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                  {vorschau.neu.map((n) => <li key={n.artikel_nr}>{n.artikel_nr} {n.bezeichnung} ({TYPEN[n.typ] || n.typ || '–'}{n.aktiv ? '' : ', inaktiv'})</li>)}
                </ul>
              </details>
            )}
            {vorschau && <p className="ui-table-sub" style={{ margin: '8px 0 0' }}>„Übernehmen“ ergänzt den Artikelstamm (nur neue Artikel und leere Felder) und ersetzt den SER-Produktstamm für Push SER.</p>}
          </div>
        )}
      </div>
    </Panel>
  );
}
