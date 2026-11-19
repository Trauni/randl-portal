import { useState, useEffect, useCallback } from 'react';
import { Tag } from '../../../ui';
import PricePreview from '../PricePreview';
import SerPush from '../SerPush';

const eurC = (c) => (c == null ? '–' : (c / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €');
const eur = (n) => (n == null ? '–' : Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €');
const STATUS = { ok: ['ok', 'ok'], pending: ['läuft', 'warn'], conflict: ['Konflikt', 'err'], error: ['Fehler', 'err'] };
const ZIEL = { lexware: 'Lexware', ser: 'SER' };

/**
 * Preis eines Artikels: Stand in Stamm, Lexware und SER, Preise anpassen und Push SER (die bisherigen Dialoge)
 * und das Preisprotokoll dieses Artikels (wer, wann, welche Regel, alt/neu, Ergebnis).
 */
export default function PreisTab({ artikel, canEdit, onGeaendert }) {
  const [dialog, setDialog] = useState('');
  const [protokoll, setProtokoll] = useState(null);
  const [fehler, setFehler] = useState('');
  const lexId = artikel.lexware?.id;

  const laden = useCallback(() => {
    if (!canEdit) return;
    fetch(`/api/finance/price-tool/log?limit=200&artikel=${encodeURIComponent(artikel.artikel_nr)}`)
      .then((r) => r.json().then((d) => { if (!r.ok || d.error) throw new Error(d.error || 'Fehler ' + r.status); return d; }))
      .then((d) => setProtokoll(d.entries)).catch((e) => setFehler(e.message));
  }, [artikel.artikel_nr, canEdit]);
  useEffect(() => { laden(); }, [laden]);

  return (
    <div>
      <div className="ui-feld"><span>Preis netto (Stamm)</span><b style={{ fontSize: 17 }}>{eurC(artikel.preis_netto_cent)}</b><span className="ui-table-sub">führend, Lexware und SER folgen</span></div>
      <div className="ui-feld"><span>Lexware</span><span>{artikel.lexware ? eurC(artikel.lexware.netto_cent) : 'kein Artikel'} {artikel.lexware_status === 'abweichend' && <Tag tone="err">Preis anders</Tag>}</span><span className="ui-table-sub">{artikel.lexware?.nummer}</span></div>
      <div className="ui-feld"><span>SER</span><span>{artikel.ser ? eurC(artikel.ser.preis_cent) : 'nicht im Export'} {artikel.ser_status === 'abweichend' && <Tag tone="err">Preis anders</Tag>}</span><span className="ui-table-sub">Stand des letzten SER-Exports</span></div>

      {canEdit && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, padding: '16px 0' }}>
          <button className="btn btn-primary" disabled={!lexId} onClick={() => setDialog('preis')} title={lexId ? undefined : 'Der Preis wird über den Lexware-Artikel geändert'}>Preis anpassen</button>
          <button className="btn btn-secondary" disabled={!lexId} onClick={() => setDialog((d) => (d === 'serpush' ? '' : 'serpush'))}>Push SER</button>
        </div>
      )}
      {canEdit && dialog === 'preis' && lexId && <PricePreview key={lexId} articleIds={[lexId]} onClose={() => setDialog('')} onApplied={() => { laden(); onGeaendert(); }} />}
      {canEdit && dialog === 'serpush' && lexId && <SerPush key={lexId} articleIds={[lexId]} onClose={() => setDialog('')} />}
      <p className="ui-table-sub" style={{ margin: '4px 0 16px' }}>
        Nach dem Übernehmen geht der Preis an Lexware und in den Artikelstamm. Danach „Push SER“, dann sieht SER ihn auch. Jede Änderung landet im Preisprotokoll.
      </p>

      {canEdit && (
        <>
          <h3 className="ui-panel-title" style={{ marginBottom: 8 }}>Preisprotokoll</h3>
          {fehler && <div className="alert alert-error">✗ {fehler}</div>}
          <div style={{ overflowX: 'auto' }}>
            <table className="ui-table">
              <thead><tr><th>Zeitpunkt</th><th>Ziel</th><th>Regel</th><th className="r">alt</th><th className="r">neu</th><th>Ergebnis</th><th>Benutzer</th></tr></thead>
              <tbody>
                {(protokoll || []).map((p) => {
                  const [text, ton] = STATUS[p.status] || [p.status, 'mute'];
                  return (
                    <tr key={p.id}>
                      <td>{new Date(p.created_at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td>{ZIEL[p.target] || p.target}</td>
                      <td>{p.rule_text}</td>
                      <td className="r">{eur(p.old_net)}</td>
                      <td className="r">{eur(p.new_net)}</td>
                      <td><Tag tone={ton}>{text}</Tag>{p.reason && <div className="ui-table-sub">{p.reason}</div>}</td>
                      <td>{p.changed_by_name || '–'}</td>
                    </tr>
                  );
                })}
                {protokoll && !protokoll.length && <tr><td colSpan={7} style={{ color: 'var(--text3)', textAlign: 'center', padding: 20 }}>Noch keine Preisänderung im Portal protokolliert.</td></tr>}
                {!protokoll && !fehler && <tr><td colSpan={7} style={{ color: 'var(--text3)', textAlign: 'center', padding: 20 }}>Lade…</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
