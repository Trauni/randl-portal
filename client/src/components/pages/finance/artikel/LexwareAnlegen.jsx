import { useState, useEffect, useCallback } from 'react';
import { Panel } from '../../../ui';

const eur = (n) => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const PRAEFIXE = [['PFAND', 'PFAND- (Pfand, Leergut)'], ['GZ', 'GZ- (Zubehör, Dienstleistung)'], ['RG', 'RG- (Gasfüllung)']];

/**
 * Artikel aus dem Portal in Lexware anlegen. Erst die Vorschau (schreibt nichts), dann "Anlegen" mit Bestätigung.
 * Es wird nur angelegt, was es in Lexware noch nicht gibt; danach steht die Lexware-Nummer im Artikel (Verknüpfung, Sparte, Einheit).
 * Nach SER und in den Shop geht nichts.
 */
export default function LexwareAnlegen({ nummern, onFertig, onClose }) {
  const [praefix, setPraefix] = useState('');
  const [plan, setPlan] = useState(null);
  const [fehler, setFehler] = useState('');
  const [busy, setBusy] = useState(false);
  const [ergebnis, setErgebnis] = useState(null);
  const schluessel = nummern.join(',');

  const post = (body) => fetch('/api/finance/artikelliste/lexware-anlegen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(async (r) => { const d = await r.json(); if (!r.ok || d.error) throw Object.assign(new Error(d.error || 'Fehler ' + r.status), { status: r.status }); return d; });

  const laden = useCallback(async () => {
    setPlan(null); setFehler(''); setErgebnis(null);
    try { setPlan(await post({ nummern: schluessel.split(','), praefix })); }
    catch (e) { setFehler(e.message); }
  }, [schluessel, praefix]);
  useEffect(() => { laden(); }, [laden]);

  const anlegen = async () => {
    if (!window.confirm(`${plan.zeilen.length} ${plan.zeilen.length === 1 ? 'Artikel' : 'Artikel'} in Lexware anlegen? Bestehende Lexware-Artikel werden nicht verändert.`)) return;
    setBusy(true); setFehler('');
    try {
      const d = await post({ nummern: schluessel.split(','), praefix, bestaetigt: true, erwartet: { anzahl: plan.zeilen.length } });
      setErgebnis(d); setPlan(null);
      onFertig();
    } catch (e) { setFehler(e.message); if (e.status === 409) laden(); }
    finally { setBusy(false); }
  };

  return (
    <Panel title="In Lexware anlegen" actions={<button className="btn btn-secondary btn-sm" onClick={onClose}>Schließen</button>}>
      <div className="ui-panel-body">
        <p className="ui-table-sub" style={{ margin: '0 0 10px' }}>
          Nummer, Bezeichnung, Nettopreis und MwSt. kommen aus dem Portal. Angelegt wird nur, was es in Lexware noch nicht gibt; danach ist der Artikel mit Lexware verknüpft.
          Nach SER und in den Shop wird nichts geschrieben.
        </p>
        {fehler && <div className="alert alert-error" role="alert">✗ {fehler}</div>}
        {ergebnis && (
          <div className={`alert ${ergebnis.fehler ? 'alert-error' : 'alert-success'}`} role="status">
            {ergebnis.angelegt.length} in Lexware angelegt{ergebnis.angelegt.length > 0 && `: ${ergebnis.angelegt.map((a) => a.lexware_nummer).join(', ')}`}.
            {ergebnis.fehler && <> Abgebrochen bei {ergebnis.fehler}</>}
          </div>
        )}
        {!plan && !fehler && !ergebnis && <div style={{ color: 'var(--text3)', padding: 12 }}>Lade Vorschau …</div>}
        {plan && (
          <>
            {(plan.brauchtPraefix || praefix) && (
              <label style={{ display: 'block', marginBottom: 10, fontSize: 14 }}>Präfix in Lexware{' '}
                <select className="form-select" style={{ width: 'auto' }} value={praefix} onChange={(e) => setPraefix(e.target.value)}>
                  <option value="">nach Typ</option>
                  {PRAEFIXE.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </label>
            )}
            {plan.fehler.length > 0 && (
              <div className="alert alert-error" role="alert">
                {plan.fehler.map((f) => <div key={f}>✗ {f}</div>)}
              </div>
            )}
            {plan.zeilen.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table className="ui-table">
                  <thead><tr><th>Portal</th><th>Lexware-Nummer</th><th>Bezeichnung</th><th>Einheit</th><th className="r">Preis netto</th><th className="r">MwSt.</th></tr></thead>
                  <tbody>
                    {plan.zeilen.map((z) => (
                      <tr key={z.artikel_nr}>
                        <td style={{ fontWeight: 700 }}>{z.artikel_nr}</td><td>{z.lexware_nummer}</td><td>{z.bezeichnung}</td><td>{z.einheit}</td>
                        <td className="r">{eur(z.netto)}</td><td className="r">{z.mwst} %</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{ paddingTop: 12 }}>
              <button className="btn btn-primary" disabled={busy || plan.fehler.length > 0 || plan.zeilen.length === 0} onClick={anlegen}>
                {busy ? 'Lege an …' : `${plan.zeilen.length} in Lexware anlegen`}
              </button>
              {plan.fehler.length > 0 && <span className="ui-table-sub" style={{ marginLeft: 12 }}>Erst die Hinweise oben beheben, dann geht es weiter.</span>}
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}
