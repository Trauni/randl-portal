import { useState, useEffect, useCallback } from 'react';
import { Tag } from '../../../ui';
import FeldFormular from './FeldFormular';
import { FELD, EK_GRUPPEN } from './artikelFelder';

const eur = (n) => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const datum = (iso) => iso.split('-').reverse().join('.');
const zeit = (s) => new Date(s).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });

/**
 * Einkauf eines Artikels (nur mit artikel.einkauf): Preisgruppe des Artikels, Preise und Historie der Gruppe,
 * neuer Preis mit Gültigkeitsdatum (gleicher Tag ersetzt, alter Stand bleibt im Protokoll) und das Protokoll.
 * Die Preise hängen an der Gruppe und gelten für alle Artikel dieser Gruppe.
 */
export default function EinkaufTab({ artikel, alle, canEditArtikel, onGeaendert }) {
  const [daten, setDaten] = useState(null);
  const [protokoll, setProtokoll] = useState([]);
  const [form, setForm] = useState({ preis_netto: '', gueltig_ab: '', notiz: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const gruppe = artikel.ek_gruppe;

  const laden = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([fetch('/api/finance/ek-preise'), fetch('/api/finance/ek-preise/protokoll')]);
      const da = await a.json(); const db = await b.json();
      if (!a.ok) throw new Error(da.error || 'Fehler');
      setDaten(da); setProtokoll(db.protokoll || []);
    } catch (e) { setMsg({ fehler: e.message }); }
  }, []);
  useEffect(() => { laden(); }, [laden]);

  const speichern = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/finance/ek-preise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ek_gruppe: gruppe, ...form, preis_netto: form.preis_netto.replace(',', '.') }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Fehler');
      setMsg({ ok: d.ersetzt ? 'Preis für diesen Tag ersetzt (alter Stand im Protokoll).' : 'Preis gespeichert.' });
      setForm((f) => ({ ...f, preis_netto: '', notiz: '' }));
      laden();
    } catch (e) { setMsg({ fehler: e.message }); }
    finally { setBusy(false); }
  };

  const g = daten?.gruppen?.[gruppe];
  const preise = (daten?.preise || []).filter((p) => p.ek_gruppe === gruppe);
  const log = protokoll.filter((l) => l.ek_gruppe === gruppe);

  return (
    <div>
      <p className="ui-table-sub" style={{ margin: '12px 0' }}>Nur mit Auswertungs-Recht sichtbar. Der Einkaufspreis hängt über die Preisgruppe am Artikel und gilt für alle Artikel dieser Gruppe.</p>
      <FeldFormular key={artikel.artikel_nr + (gruppe || '')} artikel={artikel} felder={[FELD.ek_gruppe]} alle={alle} canEdit={canEditArtikel} onGespeichert={onGeaendert} />

      {!gruppe && <p style={{ margin: '18px 0', color: 'var(--text2)' }}>Dieser Artikel hat keine Preisgruppe, sein Einkauf geht nicht in den Rohertrag ein. Für Propan, Motogas und Bluetec ist sie gesetzt; Preise für CO2, Biergas und technische Gase gibt es noch nicht ({Object.values(EK_GRUPPEN).join(', ')} sind die vorhandenen Gruppen).</p>}

      {gruppe && daten && (
        <>
          <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, alignItems: 'end' }}>
            <label style={lab}>Preis netto ({g?.preisbasis === 'kg' ? '€ je kg' : '€ je Füllung'})
              <input className="form-input" inputMode="decimal" value={form.preis_netto} onChange={(e) => setForm((f) => ({ ...f, preis_netto: e.target.value }))} placeholder="1,52" />
            </label>
            <label style={lab}>Gültig ab
              <input type="date" className="form-input" value={form.gueltig_ab} onChange={(e) => setForm((f) => ({ ...f, gueltig_ab: e.target.value }))} />
            </label>
            <label style={{ ...lab, gridColumn: 'span 2' }}>Notiz
              <input className="form-input" maxLength={200} value={form.notiz} onChange={(e) => setForm((f) => ({ ...f, notiz: e.target.value }))} placeholder="z. B. verhandelt, unbefristet" />
            </label>
            <button className="btn btn-primary" onClick={speichern} disabled={busy || !form.preis_netto || !form.gueltig_ab}>Speichern</button>
          </div>
          {msg?.fehler && <div className="alert alert-error" style={{ marginTop: 10 }}>{msg.fehler}</div>}
          {msg?.ok && <div className="alert alert-success" style={{ marginTop: 10 }}>{msg.ok}</div>}

          <h3 className="ui-panel-title" style={{ margin: '20px 0 8px' }}>Preise und Historie: {g?.label}</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="ui-table">
              <thead><tr><th>Lieferant</th><th>Gültig ab</th><th className="r">Preis netto</th><th>Basis</th><th>Notiz</th><th>Erfasst</th></tr></thead>
              <tbody>
                {preise.map((p) => (
                  <tr key={p.id} style={p.aktuell ? { fontWeight: 700 } : undefined}>
                    <td>{p.lieferant}{p.aktuell && <> <Tag tone="ok">aktuell</Tag></>}</td>
                    <td>{datum(p.gueltig_ab)}</td>
                    <td className="r">{eur(p.preis_netto)} €</td>
                    <td>{p.preisbasis === 'kg' ? 'je kg' : 'je Füllung'}</td>
                    <td>{p.notiz || ''}</td>
                    <td className="ui-table-sub">{p.erfasst_von}, {zeit(p.erfasst_am)}</td>
                  </tr>
                ))}
                {!preise.length && <tr><td colSpan={6} style={{ color: 'var(--text3)', textAlign: 'center', padding: 20 }}>Noch kein Preis für diese Gruppe.</td></tr>}
              </tbody>
            </table>
          </div>

          <h3 className="ui-panel-title" style={{ margin: '20px 0 8px' }}>Protokoll</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="ui-table">
              <thead><tr><th>Zeitpunkt</th><th>Benutzer</th><th>Aktion</th><th>Gültig ab</th><th className="r">alt</th><th className="r">neu</th></tr></thead>
              <tbody>
                {log.map((l) => (
                  <tr key={l.id}>
                    <td>{zeit(l.zeitpunkt)}</td><td>{l.benutzer}</td><td>{l.aktion}</td><td>{datum(l.gueltig_ab)}</td>
                    <td className="r">{l.preis_alt == null ? '–' : `${eur(l.preis_alt)} €`}</td><td className="r">{eur(l.preis_neu)} €</td>
                  </tr>
                ))}
                {!log.length && <tr><td colSpan={6} style={{ color: 'var(--text3)', textAlign: 'center', padding: 20 }}>Noch keine Änderungen im Portal.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

const lab = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--text2)' };
