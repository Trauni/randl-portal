import { useState } from 'react';
import { Panel } from '../../../ui';

const TYPEN = { F: 'Füllung', P: 'Pfand', S: 'Steuer/Nutzung (Kaufflasche)', V: 'Provision' };
const FELDER = [['artikel_nr', 'Nummer *'], ['bezeichnung', 'Bezeichnung *'], ['un_nr', 'UN-Nr.'], ['gefahrklasse', 'Gefahrklasse'], ['preis_netto_cent', 'Netto-Preis (Cent)']];

/** Neuen Artikel im Stamm anlegen (für Artikel, die im SER-Export fehlen). Nummer wie in SER/Lexware ohne Präfix. */
export default function ArtikelNeu({ onAngelegt, onClose }) {
  const [neu, setNeu] = useState({ artikel_nr: '', bezeichnung: '', typ: 'F' });
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState('');

  const anlegen = async () => {
    const body = Object.fromEntries(Object.entries(neu).filter(([, v]) => v !== '' && v != null));
    setBusy(true); setFehler('');
    try {
      const r = await fetch('/api/finance/artikelstamm/anlegen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Fehler ' + r.status);
      onAngelegt(d.artikel_nr);
    } catch (e) { setFehler(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Panel title="Neuen Artikel anlegen" actions={<button className="btn btn-secondary btn-sm" onClick={onClose}>Schließen</button>}>
      <div className="ui-panel-body">
        <p className="ui-table-sub" style={{ margin: '0 0 10px' }}>
          Nummer wie in SER/Lexware ohne Präfix (z. B. 7801200). Weitere Angaben ergänzt du danach über „Felder bearbeiten“.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
          {FELDER.map(([f, l]) => (
            <label key={f} style={{ fontSize: 13, color: 'var(--text2)' }}>{l}
              <input className="form-input" style={{ display: 'block', marginTop: 2 }} value={neu[f] ?? ''} onChange={(e) => setNeu({ ...neu, [f]: e.target.value })} />
            </label>
          ))}
          <label style={{ fontSize: 13, color: 'var(--text2)' }}>Typ *
            <select className="form-select" style={{ display: 'block', marginTop: 2 }} value={neu.typ} onChange={(e) => setNeu({ ...neu, typ: e.target.value })}>
              {Object.entries(TYPEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        </div>
        {fehler && <div className="alert alert-error" style={{ marginTop: 10 }}>✗ {fehler}</div>}
        <div style={{ marginTop: 12 }}>
          <button className="btn btn-primary" disabled={busy || !neu.artikel_nr || !neu.bezeichnung} onClick={anlegen}>{busy ? 'Speichere…' : 'Anlegen'}</button>
        </div>
      </div>
    </Panel>
  );
}
