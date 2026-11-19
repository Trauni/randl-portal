import { useState, useEffect } from 'react';

/** Änderungsverlauf eines Artikels aus dem Stamm (gas_artikel_aenderungen): wann, wer, Feld, alt und neu. */
export default function VerlaufTab({ nr, aktualisiert }) {
  const [eintraege, setEintraege] = useState(null);
  const [fehler, setFehler] = useState('');
  useEffect(() => {
    fetch(`/api/finance/artikelstamm/${encodeURIComponent(nr)}/protokoll`)
      .then((r) => r.json().then((d) => { if (!r.ok || d.error) throw new Error(d.error || 'Fehler ' + r.status); return d; }))
      .then((d) => setEintraege(d.eintraege)).catch((e) => setFehler(e.message));
  }, [nr, aktualisiert]);

  return (
    <div style={{ overflowX: 'auto' }}>
      {fehler && <div className="alert alert-error">✗ {fehler}</div>}
      <table className="ui-table">
        <thead><tr><th>Zeitpunkt</th><th>Benutzer</th><th>Feld</th><th>alt</th><th>neu</th></tr></thead>
        <tbody>
          {(eintraege || []).map((p, i) => (
            <tr key={i}>
              <td>{new Date(p.geaendert_am).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</td>
              <td>{p.von_name || '–'}</td><td>{p.feld}</td><td>{p.alt ?? '–'}</td><td>{p.neu ?? '–'}</td>
            </tr>
          ))}
          {eintraege && !eintraege.length && <tr><td colSpan={5} style={{ color: 'var(--text3)', textAlign: 'center', padding: 20 }}>Noch keine Änderung im Portal.</td></tr>}
          {!eintraege && !fehler && <tr><td colSpan={5} style={{ color: 'var(--text3)', textAlign: 'center', padding: 20 }}>Lade…</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
