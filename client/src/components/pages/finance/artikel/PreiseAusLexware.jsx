import { useState, useEffect, useCallback } from 'react';
import { Panel, Tag } from '../../../ui';

const eur = (c) => (c == null ? '–' : (c / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €');
const diff = (c) => (c == null ? 'neu' : `${c > 0 ? '+' : ''}${eur(c)}`);

/**
 * Preise aus Lexware in den Artikelstamm übernehmen. Erst die Vorschau (schreibt nichts), dann "Übernehmen" mit Bestätigung.
 * Lexware ist nur Quelle. Geschrieben wird in den Artikelstamm des Portals, mit Änderungsverlauf und Preisprotokoll;
 * nach Lexware, SER und in den Shop geht nichts. Danach "Push SER", damit SER die Preise auch sieht.
 */
export default function PreiseAusLexware({ onUebernommen, onClose }) {
  const [plan, setPlan] = useState(null);
  const [fehler, setFehler] = useState('');
  const [busy, setBusy] = useState(false);
  const [ergebnis, setErgebnis] = useState(null);

  const laden = useCallback(async () => {
    setPlan(null); setFehler('');
    try {
      const r = await fetch('/api/finance/artikelliste/preise-aus-lexware');
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Fehler ' + r.status);
      setPlan(d);
    } catch (e) { setFehler(e.message); }
  }, []);
  useEffect(() => { laden(); }, [laden]);

  const uebernehmen = async () => {
    if (!window.confirm(`${plan.zeilen.length} Preise im Artikelstamm auf den Lexware-Preis setzen? Der alte Preis bleibt im Änderungsverlauf und im Preisprotokoll. In Lexware, SER und im Shop wird nichts geändert.`)) return;
    setBusy(true); setFehler('');
    try {
      const r = await fetch('/api/finance/artikelliste/preise-aus-lexware', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true, expected: { anzahl: plan.zeilen.length, summeDiffCent: plan.summeDiffCent } }),
      });
      const d = await r.json();
      if (r.status === 409) { setFehler(d.error); await laden(); return; }
      if (!r.ok || d.error) throw new Error(d.error || 'Fehler ' + r.status);
      setErgebnis(d); setPlan(null);
      onUebernommen();
    } catch (e) { setFehler(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Panel title="Preise aus Lexware übernehmen" actions={<button className="btn btn-secondary btn-sm" onClick={onClose}>Schließen</button>}>
      <div className="ui-panel-body">
        <p className="ui-table-sub" style={{ margin: '0 0 10px' }}>
          Lexware ist hier nur die Quelle. Übernommen wird der Nettopreis in den Artikelstamm des Portals (mit Änderungsverlauf und Preisprotokoll, der alte Preis gilt in der Gas-Auswertung bis heute weiter).
          Nach Lexware, SER und in den Shop wird nichts geschrieben; für SER danach „Push SER“.
        </p>
        {fehler && <div className="alert alert-error" role="alert">✗ {fehler}</div>}
        {ergebnis && (
          <div className="alert alert-success" role="status">
            {ergebnis.geaendert} Preise übernommen, {ergebnis.unveraendert} waren schon gleich{ergebnis.ohnePreis > 0 && `, ${ergebnis.ohnePreis} Artikel ohne Lexware-Preis blieben unverändert`}. Für SER jetzt „Push SER“ (Artikel wählen, „Push SER“).
          </div>
        )}
        {!plan && !fehler && !ergebnis && <div style={{ color: 'var(--text3)', padding: 12 }}>Lade Vorschau …</div>}
        {plan && (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', fontSize: 15, marginBottom: 10 }}>
              <b>{plan.zeilen.length} Preise weichen ab</b>
              <span>{plan.gleich} sind gleich</span>
              {plan.ohnePreis.length > 0 && <span>{plan.ohnePreis.length} ohne Preis in Lexware</span>}
              {plan.nurInLexware > 0 && <span>{plan.nurInLexware} Artikel nur in Lexware (nicht im Stamm)</span>}
              {plan.cachedAt && <span className="ui-table-sub">Lexware-Stand {new Date(plan.cachedAt).toLocaleString('de-DE')}</span>}
            </div>
            {plan.zeilen.length > 0 && (
              <div style={{ overflowX: 'auto', maxHeight: 420, border: '1px solid var(--border)', borderRadius: 8 }}>
                <table className="ui-table">
                  <thead><tr><th>Nr.</th><th>Bezeichnung</th><th className="r">Stamm heute</th><th className="r">Lexware</th><th className="r">Änderung</th></tr></thead>
                  <tbody>
                    {plan.zeilen.map((z) => (
                      <tr key={z.artikel_nr}>
                        <td style={{ fontWeight: 700 }}>{z.artikel_nr}</td><td>{z.bezeichnung}</td>
                        <td className="r">{eur(z.alt_cent)}</td><td className="r">{eur(z.neu_cent)}</td>
                        <td className="r"><Tag tone={z.diff_cent == null ? 'warn' : z.diff_cent > 0 ? 'err' : 'ok'}>{diff(z.diff_cent)}</Tag></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {plan.zeilen.length === 0 && <p style={{ margin: 0 }}>Alle Preise im Artikelstamm stimmen mit Lexware überein.</p>}
            {plan.zeilen.length > 0 && (
              <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
                <button className="btn btn-primary" disabled={busy} onClick={uebernehmen}>{busy ? 'Übernehme …' : `${plan.zeilen.length} Preise übernehmen`}</button>
                <button className="btn btn-secondary" onClick={laden} disabled={busy}>Vorschau neu laden</button>
              </div>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}
