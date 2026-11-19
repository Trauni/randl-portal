import { useState, useEffect, useCallback } from 'react';
import { Panel } from '../../../ui';

// Tourvorlagen pflegen (#518, hierher verschoben mit #608): umbenennen, löschen, Kunden suchen, hinzufügen, entfernen, Reihenfolge.
// Neue Vorlagen entstehen in der Disposition über "Als Vorlage speichern".

const api = async (url, methode = 'GET', body) => {
  const r = await fetch(url, { method: methode, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Fehler');
  return d;
};

function KundeHinzu({ vorhanden, onWahl }) {
  const [q, setQ] = useState('');
  const [treffer, setTreffer] = useState([]);
  useEffect(() => {
    if (q.trim().length < 2) { setTreffer([]); return undefined; }
    let aktuell = true;
    const t = setTimeout(async () => {
      try { const r = await api(`/api/fahrer-touren/kunden?q=${encodeURIComponent(q.trim())}`); if (aktuell) setTreffer(r); } catch { if (aktuell) setTreffer([]); }
    }, 300);
    return () => { aktuell = false; clearTimeout(t); };
  }, [q]);
  return (
    <div style={{ padding: '6px 0 0 8px' }}>
      <input className="form-input" style={{ maxWidth: 340 }} placeholder="Kunde suchen (Name, Nr., Ort) und hinzufügen" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Kunde suchen" />
      {treffer.map((k) => {
        const schon = vorhanden.includes(k.kundeNr);
        return (
          <div key={k.kundeNr} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0', fontSize: 14, color: 'var(--text2)' }}>
            <span style={{ flex: 1 }}>{k.kundeName} <span className="ui-table-sub">#{k.kundeNr}{k.ort ? ` · ${k.ort}` : ''}</span></span>
            <button className="btn btn-secondary btn-sm" disabled={schon} onClick={async () => { await onWahl(k); setQ(''); }}>{schon ? 'schon drin' : 'Hinzufügen'}</button>
          </div>
        );
      })}
    </div>
  );
}

function Vorlagen({ vorlagen, onGeaendert, onFehler }) {
  const speichern = async (v, kunden, name = v.name) => {
    try { await api(`/api/fahrer-touren/vorlagen/${v.id}`, 'PUT', { name, employeeId: v.employeeId, fahrzeug: v.fahrzeug, ladebasisId: v.ladebasisId, kunden }); await onGeaendert(); } catch (e) { onFehler(e.message); }
  };
  const verschiebe = (v, i, r) => { const k = [...v.kunden]; [k[i], k[i + r]] = [k[i + r], k[i]]; return speichern(v, k); };
  const umbenennen = (v) => { const n = window.prompt('Neuer Name der Vorlage', v.name); if (n && n.trim()) speichern(v, v.kunden, n.trim()); };
  const loeschen = async (v) => {
    if (!window.confirm(`Vorlage „${v.name}“ löschen? Bereits angelegte Touren bleiben.`)) return;
    try { await api(`/api/fahrer-touren/vorlagen/${v.id}`, 'DELETE'); await onGeaendert(); } catch (e) { onFehler(e.message); }
  };
  return (
    <Panel title={`Tourvorlagen (${vorlagen.length})`}>
      <div className="ui-panel-body">
        <p className="ui-table-sub" style={{ margin: '0 0 8px' }}>Neue Vorlage: eine Tour mit Stopps öffnen und „Als Vorlage speichern“ wählen. Weitere Kunden fügst du hier über die Suche hinzu.</p>
        {vorlagen.map((v) => (
          <div key={v.id} style={{ borderTop: '1px solid var(--border)', padding: '10px 0' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: 1 }}><b>{v.name}</b> <span className="ui-table-sub">{v.fahrerName} · {v.fahrzeug || 'kein Fahrzeug'} · {v.ladebasisName || 'keine Ladebasis'}</span></div>
              <button className="btn btn-secondary btn-sm" onClick={() => umbenennen(v)}>Umbenennen</button>
              <button className="btn btn-secondary btn-sm" style={{ color: 'var(--err-fg)' }} onClick={() => loeschen(v)}>Löschen</button>
            </div>
            {v.kunden.map((k, i) => (
              <div key={k.kundeNr} style={{ display: 'grid', gridTemplateColumns: '1.5rem 1fr auto', gap: 8, padding: '4px 0 4px 8px', fontSize: 14, color: 'var(--text2)' }}>
                <span>{i + 1}</span>
                <span>{k.kundeName} <span className="ui-table-sub">#{k.kundeNr}{k.lieferzeit ? ` · ${k.lieferzeit}` : ''}</span></span>
                <span style={{ display: 'flex', gap: 4 }}>
                  <button className="btn btn-secondary btn-sm" disabled={i === 0} onClick={() => verschiebe(v, i, -1)} aria-label="nach oben">↑</button>
                  <button className="btn btn-secondary btn-sm" disabled={i === v.kunden.length - 1} onClick={() => verschiebe(v, i, 1)} aria-label="nach unten">↓</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => speichern(v, v.kunden.filter((x) => x.kundeNr !== k.kundeNr))}>Raus</button>
                </span>
              </div>
            ))}
            {!v.kunden.length && <div className="ui-table-sub">Keine Kunden.</div>}
            <KundeHinzu vorhanden={v.kunden.map((x) => x.kundeNr)} onWahl={(k) => speichern(v, [...v.kunden, { kundeNr: k.kundeNr, kundeName: k.kundeName, lieferzeit: null, hinweise: null }])} />
          </div>
        ))}
        {!vorlagen.length && <div className="ui-table-sub">Noch keine Vorlagen.</div>}
      </div>
    </Panel>
  );
}


export default function TourvorlagenTab() {
  const [vorlagen, setVorlagen] = useState(null);
  const [fehler, setFehler] = useState('');
  const laden = useCallback(async () => { try { setVorlagen(await api('/api/fahrer-touren/vorlagen')); } catch (e) { setFehler(e.message); } }, []);
  useEffect(() => { laden(); }, [laden]);
  if (!vorlagen) return <div style={{ color: 'var(--text3)', padding: 20 }}>{fehler || 'Lade …'}</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {fehler && <div className="alert alert-error" role="alert">✗ {fehler}</div>}
      <Vorlagen vorlagen={vorlagen} onFehler={setFehler} onGeaendert={laden} />
    </div>
  );
}
