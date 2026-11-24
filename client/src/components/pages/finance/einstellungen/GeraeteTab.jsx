import { useState, useEffect, useCallback } from 'react';
import { Panel, Tag } from '../../../ui';

// #550 Fahrer-Geräte im Büro: anlegen, Kopplungscode anzeigen, sperren. API seit #541 (/api/fahrer-geraete).
// #516: Rolle „Lager-Tablet“ – festes Tablet am Lager, nach dem Koppeln dauerhaft angemeldet (ohne Authentik).

const api = async (url, methode = 'GET', body) => {
  const r = await fetch(url, { method: methode, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Fehler');
  return d;
};

const ROLLEN = [
  { id: 'tablet', name: 'Tablet', hilfe: 'Gehört zum Fahrzeug. Jeder Fahrer meldet sich morgens mit seinem Randl-Konto an.' },
  { id: 'notfall', name: 'Notfall-Handy', hilfe: 'Privates Handy eines Fahrers, nur er kann sich darauf anmelden.' },
  { id: 'lager', name: 'Lager-Tablet', hilfe: 'Bleibt am Lager für den Barverkauf. Nach dem Koppeln dauerhaft angemeldet, bis es gesperrt wird.' },
];
const rollenName = (id) => ROLLEN.find((r) => r.id === id)?.name || id;

const zeit = (iso) => (iso ? new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–');
const codeLesbar = (c) => (c && c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c);

function Status({ g }) {
  if (g.gesperrtAm) return <Tag tone="err">gesperrt</Tag>;
  if (g.gekoppelt) return <Tag tone="ok">gekoppelt</Tag>;
  if (g.codeGueltigBis) return <Tag tone="warn">Code offen</Tag>;
  return <Tag>nicht gekoppelt</Tag>;
}

/** Großer Kopplungscode mit Restzeit. Gültig 10 Minuten, nur einmal verwendbar. */
function CodeAnzeige({ code, onZu }) {
  const [jetzt, setJetzt] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setJetzt(Date.now()), 1000); return () => clearInterval(t); }, []);
  const rest = Math.max(0, new Date(code.gueltigBis).getTime() - jetzt);
  const min = Math.floor(rest / 60000), sek = Math.floor((rest % 60000) / 1000);
  return (
    <Panel title={`Kopplungscode für ${code.kennung}`}>
      <div className="ui-panel-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center' }}>
        <div aria-live="polite" style={{ fontFamily: 'DM Mono, ui-monospace, monospace', fontSize: 40, fontWeight: 700, letterSpacing: '.08em', opacity: rest ? 1 : 0.35 }}>
          {codeLesbar(code.code)}
        </div>
        <div style={{ flex: 1, minWidth: 220, fontSize: 15, color: 'var(--text2)' }}>
          {rest
            ? <>In der Fahrer-App unter „Gerät koppeln“ eingeben. Gültig noch <b>{min}:{String(sek).padStart(2, '0')} min</b>, nur einmal verwendbar.</>
            : <>Der Code ist abgelaufen. Bitte einen neuen erzeugen.</>}
          {code.rolle === 'lager' && <div style={{ marginTop: 6 }}>Ein Lager-Tablet ist mit dem Koppeln angemeldet, eine Anmeldung mit Randl-Konto gibt es dort nicht.</div>}
        </div>
        <button className="btn btn-secondary" onClick={onZu}>Ausblenden</button>
      </div>
    </Panel>
  );
}

export default function GeraeteTab() {
  const [liste, setListe] = useState(null);
  const [fahrer, setFahrer] = useState([]);
  const [neu, setNeu] = useState({ kennung: '', rolle: 'tablet', bezeichnung: '', employeeId: '' });
  const [code, setCode] = useState(null);
  const [bearbeite, setBearbeite] = useState(null);
  const [fehler, setFehler] = useState('');

  const laden = useCallback(async () => {
    try { setListe(await api('/api/fahrer-geraete')); } catch (e) { setFehler(e.message); }
  }, []);
  useEffect(() => {
    laden();
    api('/api/fahrer-touren/fahrer').then(setFahrer).catch(() => setFahrer([]));
  }, [laden]);

  const ausfuehren = async (fn) => {
    setFehler('');
    try { await fn(); await laden(); } catch (e) { setFehler(e.message); }
  };

  const anlegen = () => ausfuehren(async () => {
    const r = await api('/api/fahrer-geraete', 'POST', {
      kennung: neu.kennung, rolle: neu.rolle, bezeichnung: neu.bezeichnung,
      employeeId: neu.rolle === 'notfall' && neu.employeeId ? Number(neu.employeeId) : null,
    });
    setCode({ kennung: r.geraet.kennung, rolle: r.geraet.rolle, ...r.kopplung });
    setNeu({ kennung: '', rolle: neu.rolle, bezeichnung: '', employeeId: '' });
  });
  const neuerCode = (g) => {
    if (g.gekoppelt && !window.confirm(`Neuen Kopplungscode für ${g.kennung}? Wird er eingelöst, ersetzt das neue Gerät das bisherige und dessen Anmeldung endet.`)) return;
    ausfuehren(async () => { const k = await api(`/api/fahrer-geraete/${g.id}/kopplungscode`, 'POST'); setCode({ kennung: g.kennung, rolle: g.rolle, ...k }); });
  };
  const sperren = (g) => {
    if (!window.confirm(`${g.kennung} sperren? Die Anmeldung endet sofort, das Gerät kann nichts mehr senden, bis es entsperrt ist. Belege auf dem Gerät bleiben dort liegen.`)) return;
    ausfuehren(() => api(`/api/fahrer-geraete/${g.id}/sperren`, 'POST'));
  };
  const entsperren = (g) => ausfuehren(() => api(`/api/fahrer-geraete/${g.id}/entsperren`, 'POST'));
  const speichern = () => ausfuehren(async () => {
    await api(`/api/fahrer-geraete/${bearbeite.id}`, 'PATCH', {
      bezeichnung: bearbeite.bezeichnung,
      ...(bearbeite.rolle === 'notfall' ? { employeeId: bearbeite.employeeId ? Number(bearbeite.employeeId) : null } : {}),
    });
    setBearbeite(null);
  });

  if (!liste) return <div style={{ color: 'var(--text3)', padding: 20 }}>{fehler || 'Lade …'}</div>;

  const kennungOk = /^[A-Z0-9]{2,5}$/.test(neu.kennung);
  const rolle = ROLLEN.find((r) => r.id === neu.rolle);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ margin: 0, fontSize: 15, color: 'var(--text2)', maxWidth: 760 }}>
        Jedes Gerät mit der Fahrer-App wird hier einmal angelegt und mit einem Kopplungscode verbunden. Die Kennung steht in jeder Belegnummer
        (z. B. LS-T1-0042) und lässt sich nicht ändern. Ein verlorenes Gerät hier sperren.
      </p>
      {fehler && <div className="alert alert-error" role="alert">✗ {fehler}</div>}
      {code && <CodeAnzeige code={code} onZu={() => setCode(null)} />}

      <Panel title="Neues Gerät">
        <div className="ui-panel-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, alignItems: 'end' }}>
          <label style={lab}>Kennung (2–5 Zeichen)
            <input className="form-input" placeholder="z. B. T2 oder L1" maxLength={5} value={neu.kennung}
              onChange={(e) => setNeu((n) => ({ ...n, kennung: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }))} />
          </label>
          <label style={lab}>Rolle
            <select className="form-select" value={neu.rolle} onChange={(e) => setNeu((n) => ({ ...n, rolle: e.target.value, employeeId: '' }))}>
              {ROLLEN.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label style={lab}>Bezeichnung (optional)
            <input className="form-input" placeholder={neu.rolle === 'lager' ? 'z. B. Lager Seeon' : 'z. B. RO-DR 101'} value={neu.bezeichnung} onChange={(e) => setNeu((n) => ({ ...n, bezeichnung: e.target.value }))} />
          </label>
          {neu.rolle === 'notfall' && (
            <label style={lab}>Fahrer
              <select className="form-select" value={neu.employeeId} onChange={(e) => setNeu((n) => ({ ...n, employeeId: e.target.value }))}>
                <option value="">wählen …</option>
                {fahrer.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </label>
          )}
          <button className="btn btn-primary" disabled={!kennungOk || (neu.rolle === 'notfall' && !neu.employeeId)} onClick={anlegen}>Anlegen und Code zeigen</button>
          <div style={{ gridColumn: '1 / -1', fontSize: 14, color: 'var(--text3)' }}>{rolle?.hilfe}</div>
        </div>
      </Panel>

      <Panel>
        <div style={{ overflowX: 'auto' }}>
          <table className="ui-table">
            <thead><tr><th>Kennung</th><th>Rolle</th><th>Bezeichnung</th><th>Status</th><th>Anmeldung</th><th>Zuletzt gesehen</th><th>Belege</th><th /></tr></thead>
            <tbody>
              {liste.map((g) => (bearbeite?.id === g.id ? (
                <tr key={g.id}>
                  <td style={{ fontWeight: 700 }}>{g.kennung}</td>
                  <td>{rollenName(g.rolle)}</td>
                  <td colSpan={4}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <input className="form-input" aria-label="Bezeichnung" style={{ maxWidth: 260 }} value={bearbeite.bezeichnung} onChange={(e) => setBearbeite((x) => ({ ...x, bezeichnung: e.target.value }))} />
                      {g.rolle === 'notfall' && (
                        <select className="form-select" aria-label="Fahrer" style={{ maxWidth: 220 }} value={bearbeite.employeeId} onChange={(e) => setBearbeite((x) => ({ ...x, employeeId: e.target.value }))}>
                          <option value="">kein Fahrer</option>
                          {fahrer.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                      )}
                    </div>
                  </td>
                  <td />
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-primary btn-sm" onClick={speichern}>Speichern</button>{' '}
                    <button className="btn btn-secondary btn-sm" onClick={() => setBearbeite(null)}>Abbrechen</button>
                  </td>
                </tr>
              ) : (
                <tr key={g.id} style={{ opacity: g.gesperrtAm ? 0.7 : 1 }}>
                  <td style={{ fontWeight: 700, fontFamily: 'DM Mono, ui-monospace, monospace' }}>{g.kennung}</td>
                  <td>{rollenName(g.rolle)}</td>
                  <td>{g.bezeichnung || '–'}{g.rolle === 'notfall' && <div className="ui-table-sub">{g.fahrerName ? `Fahrer: ${g.fahrerName}` : 'kein Fahrer zugeordnet'}</div>}</td>
                  <td><Status g={g} />{g.gesperrtAm && <div className="ui-table-sub">seit {zeit(g.gesperrtAm)}</div>}</td>
                  <td>{g.angemeldet || '–'}</td>
                  <td>{zeit(g.zuletztGesehen)}</td>
                  <td style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>LS {g.lsStand}{g.rolle === 'lager' && <> · BV {g.bvStand}</>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {!g.gesperrtAm && <><button className="btn btn-secondary btn-sm" onClick={() => neuerCode(g)}>{g.gekoppelt ? 'Neu koppeln' : 'Code'}</button>{' '}</>}
                    <button className="btn btn-secondary btn-sm" onClick={() => setBearbeite({ id: g.id, rolle: g.rolle, bezeichnung: g.bezeichnung || '', employeeId: g.employeeId ?? '' })}>Ändern</button>{' '}
                    {g.gesperrtAm
                      ? <button className="btn btn-secondary btn-sm" onClick={() => entsperren(g)}>Entsperren</button>
                      : <button className="btn btn-danger btn-sm" onClick={() => sperren(g)}>Sperren</button>}
                  </td>
                </tr>
              )))}
              {!liste.length && <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text3)', padding: 24 }}>Noch kein Gerät angelegt.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

const lab = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14, color: 'var(--text2)' };
