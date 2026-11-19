import { useState, useEffect, useCallback } from 'react';
import { Panel, Tag } from '../../../ui';

// #514 Ladebasen für das ADR-Beförderungspapier der Fahrer-App (seit #608 unter Einstellungen).
// Eine Zeile Adresse, Deaktivieren statt Löschen.

const api = async (url, methode, body) => {
  const r = await fetch(url, { method: methode, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Fehler');
  return d;
};

export default function LadebasenTab() {
  const [liste, setListe] = useState(null);
  const [neu, setNeu] = useState({ name: '', adresse: '' });
  const [bearbeite, setBearbeite] = useState(null);
  const [fehler, setFehler] = useState('');

  const laden = useCallback(async () => {
    try { setListe(await api('/api/fahrer-ladebasen', 'GET')); } catch (e) { setFehler(e.message); }
  }, []);
  useEffect(() => { laden(); }, [laden]);

  const ausfuehren = async (fn) => {
    setFehler('');
    try { await fn(); await laden(); } catch (e) { setFehler(e.message); }
  };
  const anlegen = () => ausfuehren(async () => {
    await api('/api/fahrer-ladebasen', 'POST', { name: neu.name, adresse: neu.adresse, sortierung: (liste?.length || 0) * 10 + 10 });
    setNeu({ name: '', adresse: '' });
  });
  const speichern = () => ausfuehren(async () => {
    await api(`/api/fahrer-ladebasen/${bearbeite.id}`, 'PATCH', { name: bearbeite.name, adresse: bearbeite.adresse });
    setBearbeite(null);
  });
  const umschalten = (b) => ausfuehren(() => api(`/api/fahrer-ladebasen/${b.id}`, 'PATCH', { aktiv: !b.aktiv }));

  if (!liste) return <div style={{ color: 'var(--text3)', padding: 20 }}>{fehler || 'Lade …'}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ margin: 0, fontSize: 15, color: 'var(--text2)', maxWidth: 760 }}>
        Die Ladebasis steht im Kopf des Beförderungspapiers („Ladebasis“) und kommt mit „Touren neu laden“ aufs Tablet. Adresse in einer Zeile, z. B. „Grünweg 1, 83370 Seeon“.
        Nicht mehr genutzte Ladebasen deaktivieren, nicht löschen.
      </p>
      {fehler && <div className="alert alert-error" role="alert">✗ {fehler}</div>}

      <Panel title="Neue Ladebasis">
        <div className="ui-panel-body" style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) minmax(200px, 2fr) auto', gap: 12, alignItems: 'end' }}>
          <label style={lab}>Name<input className="form-input" placeholder="z. B. Obing" value={neu.name} onChange={(e) => setNeu((n) => ({ ...n, name: e.target.value }))} /></label>
          <label style={lab}>Adresse (optional, kann nachgetragen werden)<input className="form-input" value={neu.adresse} onChange={(e) => setNeu((n) => ({ ...n, adresse: e.target.value }))} /></label>
          <button className="btn btn-primary" disabled={!neu.name.trim()} onClick={anlegen}>Anlegen</button>
        </div>
      </Panel>

      <Panel>
        <div style={{ overflowX: 'auto' }}>
          <table className="ui-table">
            <thead><tr><th>Name</th><th>Adresse</th><th>Status</th><th /></tr></thead>
            <tbody>
              {liste.map((b) => (bearbeite?.id === b.id ? (
                <tr key={b.id}>
                  <td><input className="form-input" aria-label="Name" value={bearbeite.name} onChange={(e) => setBearbeite((x) => ({ ...x, name: e.target.value }))} /></td>
                  <td><input className="form-input" aria-label="Adresse" value={bearbeite.adresse} onChange={(e) => setBearbeite((x) => ({ ...x, adresse: e.target.value }))} /></td>
                  <td />
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-primary btn-sm" onClick={speichern}>Speichern</button>{' '}
                    <button className="btn btn-secondary btn-sm" onClick={() => setBearbeite(null)}>Abbrechen</button>
                  </td>
                </tr>
              ) : (
                <tr key={b.id} style={{ opacity: b.aktiv ? 1 : 0.6 }}>
                  <td style={{ fontWeight: 600 }}>{b.name}</td>
                  <td>{b.adresse || <Tag tone="warn">Adresse fehlt noch</Tag>}</td>
                  <td>{b.aktiv ? <Tag tone="ok">aktiv</Tag> : <Tag>deaktiviert</Tag>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => setBearbeite({ id: b.id, name: b.name, adresse: b.adresse || '' })}>Ändern</button>{' '}
                    <button className="btn btn-secondary btn-sm" onClick={() => umschalten(b)}>{b.aktiv ? 'Deaktivieren' : 'Aktivieren'}</button>
                  </td>
                </tr>
              )))}
              {!liste.length && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text3)', padding: 24 }}>Noch keine Ladebasis.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

const lab = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14, color: 'var(--text2)' };
