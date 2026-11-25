import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Panel, Tag, AdrPlate, GasCylinder } from '../../ui';

// #607 Disposition (früher Tourplanung #518): Tour anlegen, offene Bestellungen zuordnen, Stopps sortieren, freigeben.
// Die Pflege der Tourvorlagen und die Ladebasen liegen seit #608 unter Einstellungen.
// Neu: Ladeliste je Tour mit Punkten nach ADR 1.1.3.6 und erwartetem Leergut (Artikelstamm).
// #639: Abschnitt „Zugeladen“ zeigt, was der Fahrer unterwegs nachgeladen hat (Ereignis tour.zugeladen der App).
// #639: Büro-Check an der beendeten Tour: Fahrzeug abgeladen, Tour erledigt, Bestand gilt als 0.
// #639: „Fahrzeugbestand“ ab dem Start: geladen samt Zuladung, geliefert, voll und Leergut an Bord, ADR-Punkte dazu.

const STATUS = {
  entwurf: { label: 'Entwurf', ton: 'mute' },
  freigegeben: { label: 'Freigegeben', ton: 'ok' },
  unterwegs: { label: 'Unterwegs', ton: 'warn' },
  beendet: { label: 'Beendet', ton: 'mute' },
  storniert: { label: 'Storniert', ton: 'err' },
};
const SCHRITTE = ['entwurf', 'freigegeben', 'unterwegs', 'beendet'];
const heute = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date());
const datumDe = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
const zahl = (v) => Number(v).toLocaleString('de-DE', { maximumFractionDigits: 1 });
const uhrzeit = (iso) => (iso ? new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'ohne Zeit');
const MARKIERUNG = { nach_buero_ende: 'nach Büro-Ende', nach_uebergabe: 'nach Übergabe', tour_storniert: 'Tour storniert' };

const api = async (url, methode = 'GET', body) => {
  const r = await fetch(url, { method: methode, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Fehler');
  return d;
};

const Feld = ({ label, children }) => (
  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 150, fontSize: 14, color: 'var(--text2)' }}>{label}{children}</label>
);

function Schritte({ status, erledigt }) {
  if (status === 'storniert') return <Tag tone="err">Storniert</Tag>;
  // Der fünfte Schritt ist der Büro-Check (#639): kein eigener Status, sondern ein Vermerk an der beendeten Tour.
  const aktuell = erledigt ? 'erledigt' : status;
  return (
    <ol aria-label="Status" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 0, fontSize: 14 }}>
      {[...SCHRITTE, 'erledigt'].map((s) => (
        <li key={s} aria-current={s === aktuell ? 'step' : undefined}
          style={{ borderTop: `4px solid ${s === aktuell ? 'var(--r)' : 'var(--border)'}`, paddingTop: 6, fontWeight: s === aktuell ? 700 : 400, color: s === aktuell ? 'var(--text1)' : 'var(--text2)' }}>
          {s === 'erledigt' ? 'Erledigt' : STATUS[s].label}
        </li>
      ))}
    </ol>
  );
}

function NeueTour({ fahrer, basen, onAngelegt, onFehler, onClose }) {
  const [f, setF] = useState({ datum: heute(), bezeichnung: '', employeeId: '', fahrzeug: '', ladebasisId: '' });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const anlegen = async () => {
    try {
      const t = await api('/api/fahrer-touren', 'POST', { ...f, employeeId: Number(f.employeeId), ladebasisId: f.ladebasisId ? Number(f.ladebasisId) : null });
      setF((x) => ({ ...x, bezeichnung: '' }));
      onAngelegt(t);
    } catch (e) { onFehler(e.message); }
  };
  return (
    <Panel title="Tour anlegen" actions={<button className="btn btn-secondary btn-sm" onClick={onClose}>Schließen</button>}>
      <div className="ui-panel-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <Feld label="Datum"><input className="form-input" type="date" value={f.datum} onChange={set('datum')} /></Feld>
        <Feld label="Bezeichnung"><input className="form-input" placeholder="z. B. Montag Rosenheim" value={f.bezeichnung} onChange={set('bezeichnung')} /></Feld>
        <Feld label="Fahrer"><select className="form-select" value={f.employeeId} onChange={set('employeeId')}><option value="">wählen …</option>{fahrer.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Feld>
        <Feld label="Fahrzeug"><input className="form-input" placeholder="RO-DR 101" value={f.fahrzeug} onChange={set('fahrzeug')} /></Feld>
        <Feld label="Ladebasis"><select className="form-select" value={f.ladebasisId} onChange={set('ladebasisId')}><option value="">keine</option>{basen.filter((b) => b.aktiv).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Feld>
        <button className="btn btn-primary" disabled={!f.bezeichnung.trim() || !f.employeeId || !f.datum} onClick={anlegen}>Tour anlegen</button>
      </div>
    </Panel>
  );
}

function AusVorlage({ vorlagen, onAngelegt, onFehler, onClose }) {
  const [vid, setVid] = useState('');
  const [datum, setDatum] = useState(heute());
  const [ergebnis, setErgebnis] = useState(null);
  const los = async () => {
    try {
      const r = await api('/api/fahrer-touren/aus-vorlage', 'POST', { vorlageId: Number(vid), datum });
      setErgebnis(r);
      onAngelegt(r.tour);
    } catch (e) { onFehler(e.message); }
  };
  return (
    <Panel title="Tour aus Vorlage" actions={<button className="btn btn-secondary btn-sm" onClick={onClose}>Schließen</button>}>
      <div className="ui-panel-body">
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Feld label="Vorlage"><select className="form-select" value={vid} onChange={(e) => setVid(e.target.value)}><option value="">Vorlage wählen …</option>{vorlagen.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.kunden.length} Kunden)</option>)}</select></Feld>
          <Feld label="Datum"><input className="form-input" type="date" value={datum} onChange={(e) => setDatum(e.target.value)} /></Feld>
          <button className="btn btn-primary" disabled={!vid || !datum} onClick={los}>Tour anlegen</button>
        </div>
        {ergebnis && (
          <div className="ui-table-sub" style={{ marginTop: 10, lineHeight: 1.5 }}>
            <div style={{ color: 'var(--text2)' }}>{ergebnis.uebernommen} Bestellung(en) übernommen.</div>
            {ergebnis.ohneBestellung.length > 0 && <div>Keine offene Bestellung: {ergebnis.ohneBestellung.map((k) => k.kundeName).join(', ')}</div>}
            {ergebnis.fehler.map((f) => <div key={f.bestellId} style={{ color: 'var(--err-fg)' }}>Nicht übernommen (Kunde {f.kundeNr}): {f.grund}</div>)}
          </div>
        )}
      </div>
    </Panel>
  );
}

function Stopp({ s, index, anzahl, gesperrt, namen, onHoch, onRunter, onEntfernen, onSpeichern }) {
  const [edit, setEdit] = useState(null);
  return (
    <li style={{ display: 'grid', gridTemplateColumns: '36px minmax(0, 1fr) auto', gap: 12, alignItems: 'start', padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 30, lineHeight: 1, color: 'var(--r)', textAlign: 'center' }}>{index + 1}</span>
      <div>
        <b>{s.kundeName}</b> <span className="ui-table-sub">#{s.kundeNr} · {s.auftragRef}</span>
        <div className="ui-table-sub">{s.adresse || 'Adresse fehlt'}</div>
        <div style={{ fontSize: 14, marginTop: 2 }}>{s.positionen.map((p) => (p.soll === 0 && p.leergut > 0 ? `nur ${p.leergut} Leergut ${namen[p.artikelNr] || p.artikelNr}` : `${p.soll} ${namen[p.artikelNr] || p.artikelNr}`)).join(', ')}</div>
        {edit ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 8, marginTop: 6 }}>
            <input className="form-input" placeholder="Lieferzeit" aria-label="Lieferzeit" value={edit.lieferzeit} onChange={(e) => setEdit((x) => ({ ...x, lieferzeit: e.target.value }))} />
            <input className="form-input" placeholder="Hinweise" aria-label="Hinweise" value={edit.hinweise} onChange={(e) => setEdit((x) => ({ ...x, hinweise: e.target.value }))} />
            <button className="btn btn-primary btn-sm" onClick={async () => { await onSpeichern(s, edit); setEdit(null); }}>OK</button>
          </div>
        ) : (
          <div className="ui-table-sub">{s.lieferzeit || 'keine Lieferzeit'}{s.hinweise ? ` · ${s.hinweise}` : ''}</div>
        )}
      </div>
      {!gesperrt && !edit && (
        <div style={{ display: 'flex', gap: 4, alignItems: 'start', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" disabled={index === 0} onClick={() => onHoch(s)} title="nach oben" aria-label="nach oben">↑</button>
          <button className="btn btn-secondary btn-sm" disabled={index === anzahl - 1} onClick={() => onRunter(s)} title="nach unten" aria-label="nach unten">↓</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setEdit({ lieferzeit: s.lieferzeit || '', hinweise: s.hinweise || '' })}>Ändern</button>
          <button className="btn btn-secondary btn-sm" onClick={() => onEntfernen(s)} title="Bestellung wird wieder frei">Entfernen</button>
        </div>
      )}
    </li>
  );
}

function OffeneBestellungen({ offen, auswahl, setAuswahl, onHinzu, aktiv }) {
  const [q, setQ] = useState('');
  const gefiltert = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? offen.filter((b) => `${b.kundeName} ${b.kundeNr} ${b.adresse}`.toLowerCase().includes(s)) : offen;
  }, [offen, q]);
  const umschalten = (id) => setAuswahl((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  return (
    <div style={{ borderTop: '6px solid var(--bg0)' }}>
      <div style={{ padding: '14px 16px 8px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h3 className="ui-panel-title" style={{ marginRight: 'auto', fontSize: 20 }}>Offene Bestellungen ({offen.length})</h3>
        <input type="search" className="form-input" style={{ width: 220 }} placeholder="Kunde, Nummer oder Ort" aria-label="Bestellungen suchen" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {!aktiv && <div className="ui-table-sub" style={{ padding: '0 16px 10px' }}>Tour im Entwurf wählen, um Bestellungen zuzuordnen.</div>}
      {gefiltert.map((b) => (
        <label key={b.id} style={{ display: 'grid', gridTemplateColumns: '24px minmax(0, 1fr) auto', gap: 12, alignItems: 'start', padding: '12px 16px', borderTop: '1px solid var(--border)', cursor: aktiv ? 'pointer' : 'default' }}>
          <input type="checkbox" disabled={!aktiv} checked={auswahl.includes(b.id)} onChange={() => umschalten(b.id)} aria-label={`${b.kundeName || 'Bestellung'} zuordnen`} style={{ width: 18, height: 18, accentColor: 'var(--r)', marginTop: 2 }} />
          <div>
            <b>{b.kundeName || '—'}</b> <span className="ui-table-sub">#{b.kundeNr || 'ohne Nr.'}</span>
            <div className="ui-table-sub">{[b.adresse, b.lieferzeit, b.hinweis].filter(Boolean).join(' · ')}</div>
            <div style={{ fontSize: 14 }}>{b.positionen.map((p) => (p.menge === 0 && p.leer > 0 ? `nur ${p.leer} Leergut ${p.artikelNr || '?'}` : `${p.menge}× ${p.artikelNr || '?'}`)).join(' · ')}</div>
          </div>
          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
            <span className="ui-table-sub">{b.herkunft === 'mobile' ? 'Mobile' : 'Shop/Portal'}</span>
            {b.serAbgelehnt && <Tag tone="err">SER abgelehnt</Tag>}
            {b.adrFehlt?.length > 0 && <span title={`ADR-Angaben fehlen für: ${b.adrFehlt.join(', ')}`}><Tag tone="warn">ADR-Daten fehlen</Tag></span>}
          </div>
        </label>
      ))}
      {!gefiltert.length && <div className="ui-table-sub" style={{ padding: '0 16px 14px' }}>Keine offenen Bestellungen.</div>}
      <div style={{ padding: '12px 16px 16px' }}>
        <button className="btn btn-secondary" disabled={!aktiv || !auswahl.length} onClick={onHinzu}>{auswahl.length ? `${auswahl.length} ausgewählte zur Tour` : 'Ausgewählte zur Tour'}</button>
      </div>
    </div>
  );
}

function Ladeliste({ l }) {
  if (!l) return <Panel title="Ladeliste"><div className="ui-panel-body ui-table-sub">Tour links wählen.</div></Panel>;
  const reichen = l.ohneStopp.filter((s) => s.reicht);
  return (
    <Panel title="Ladeliste" aria-label="Ladeliste">
      <div style={{ padding: '14px 16px 4px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <AdrPlate punkte={Math.round(l.punkte)} grenze={l.grenze} />
        {l.ueber && (
          <p style={{ margin: 0, fontSize: 15 }}>
            {l.reisstBei && <>Mit Stopp {l.reisstBei.nr}{l.reisstBei.kundeName ? ` (${l.reisstBei.kundeName})` : ''} wird die Grenze überschritten. </>}
            {reichen.length > 0
              ? <>Ohne {reichen.slice(0, 3).map((s) => `Stopp ${s.nr}`).join(' oder ')} {reichen.length === 1 ? 'sind es' : 'wären es'} {reichen.slice(0, 3).map((s) => `${Math.round(s.punkte)} Punkte`).join(' bzw. ')}.</>
              : <>Auch ohne einen einzelnen Stopp bleibt die Tour über der Grenze.</>}
          </p>
        )}
        {l.unvollstaendig.length > 0 && (
          <div className="alert alert-error" style={{ margin: 0 }}>
            Für {l.unvollstaendig.join(', ')} fehlen ADR-Angaben (Faktor oder Füllmenge) im Artikelstamm. Die Punkte sind nur eine Untergrenze.
          </div>
        )}
      </div>
      <div style={{ overflowX: 'auto', marginTop: 8 }}>
        <table className="ui-table" style={{ fontSize: 15 }}>
          <thead><tr><th>Gas</th><th className="r">Fl.</th><th className="r">Menge</th><th className="r">Punkte</th></tr></thead>
          <tbody>
            {l.zeilen.map((z) => (
              <tr key={z.artikelNr}>
                <td><span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><GasCylinder gasart={z.gasart} />{z.bezeichnung}</span></td>
                <td className="r">{z.flaschen}</td>
                <td className="r">{z.vollstaendig ? `${zahl(z.menge)} ${z.einheit === 'l' ? 'L' : 'kg'}` : '–'}</td>
                <td className="r">{z.vollstaendig ? zahl(z.punkte) : '–'}</td>
              </tr>
            ))}
            {!l.zeilen.length && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text3)', padding: 20 }}>Noch keine Stopps.</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ padding: '12px 16px 16px', fontSize: 14, color: 'var(--text2)' }}>
        <div>Kategorie und Menge kommen aus dem Artikelstamm. <b style={{ color: 'var(--text1)' }}>Erwartetes Leergut: {l.leergutGesamt} {l.leergutGesamt === 1 ? 'Flasche' : 'Flaschen'}.</b></div>
        {l.leergut.length > 0 && <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>{l.leergut.map((x) => <li key={x.artikelNr}>{x.anzahl}× {x.bezeichnung}</li>)}</ul>}
        <p className="ui-table-sub" style={{ margin: '10px 0 0' }}>Punkte = Flaschen × Füllmenge × Faktor der Beförderungskategorie (1: 50, 2: 3, 3: 1), Grenze {l.grenze}. Leergut ist in der Rechnung nicht enthalten.</p>
      </div>
    </Panel>
  );
}

function Bestand({ b, check }) {
  if (!b) return null;
  return (
    <Panel title="Fahrzeugbestand" aria-label="Fahrzeugbestand">
      <div style={{ padding: '14px 16px 4px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <AdrPlate punkte={check ? 0 : Math.round(b.punkte)} grenze={b.grenze} />
        {check && (
          <p style={{ margin: 0, fontSize: 15 }}>
            <Tag tone="ok">Abgeladen</Tag> <b>Das Fahrzeug ist leer.</b> Büro-Check am {uhrzeit(check.am)}{check.von ? ` von ${check.von}` : ''}.
          </p>
        )}
        <p style={{ margin: 0, fontSize: 15 }}>
          {check ? 'Zurück ans Lager kamen' : 'An Bord:'} <b>{b.vollGesamt} voll</b>, <b>{b.leergutGesamt} leer</b>. Geladen {b.geladenGesamt}
          {b.zugeladenGesamt > 0 && <> (davon {b.zugeladenGesamt} zugeladen)</>}, geliefert {b.geliefertGesamt}
          {b.abgeladenGesamt > 0 && <>, {b.abgeladenGesamt} Leergut abgeladen</>}.
        </p>
        {b.unvollstaendig.length > 0 && (
          <div className="alert alert-error" style={{ margin: 0 }}>
            Für {b.unvollstaendig.join(', ')} fehlen ADR-Angaben (Faktor oder Füllmenge) im Artikelstamm. Die Punkte sind nur eine Untergrenze.
          </div>
        )}
        {b.mehrGeliefert.length > 0 && (
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text2)' }}>
            Zusätzlich geliefert, ohne Ladeliste und ohne gemeldete Zuladung: {b.mehrGeliefert.map((x) => `${x.anzahl}× ${x.bezeichnung}`).join(', ')}.
          </p>
        )}
      </div>
      <div style={{ overflowX: 'auto', marginTop: 8 }}>
        <table className="ui-table" style={{ fontSize: 15 }}>
          <thead><tr><th>Gas</th><th className="r">Geladen</th><th className="r">Geliefert</th><th className="r">{check ? 'Voll zurück' : 'Voll'}</th><th className="r">{check ? 'Leer zurück' : 'Leer'}</th><th className="r">Punkte</th></tr></thead>
          <tbody>
            {b.zeilen.map((x) => (
              <tr key={x.artikelNr ?? x.bezeichnung}>
                <td>
                  <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><GasCylinder gasart={x.gasart} />{x.bezeichnung}</span>
                  {(x.zugeladen > 0 || x.abgeladen > 0) && (
                    <div className="ui-table-sub">{[x.zugeladen > 0 && `davon ${x.zugeladen} zugeladen`, x.abgeladen > 0 && `${x.abgeladen} Leergut abgeladen`].filter(Boolean).join(' · ')}</div>
                  )}
                </td>
                <td className="r">{x.geladen}</td>
                <td className="r">{x.geliefert}</td>
                <td className="r"><b>{x.voll}</b></td>
                <td className="r">{x.leergut}</td>
                <td className="r">{check ? '0' : x.punkte == null ? '–' : zahl(x.punkte)}</td>
              </tr>
            ))}
            {!b.zeilen.length && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text3)', padding: 20 }}>Nichts an Bord.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="ui-table-sub" style={{ margin: 0, padding: '10px 16px 16px' }}>
        Gerechnet wie in der Fahrer-App: geladen = Ladeliste plus Zuladung, voll = geladen minus geliefert laut Belegen. Die Punkte gelten für das, was noch voll an Bord ist. Stand beim Öffnen der Tour, Belege kommen erst an, wenn das Gerät Netz hat.
      </p>
    </Panel>
  );
}

function Zugeladen({ z }) {
  if (!z?.zuladungen.length) return null;
  return (
    <Panel title="Zugeladen" aria-label="Zugeladen">
      <div style={{ padding: '14px 16px 4px', fontSize: 15 }}>
        Der Fahrer hat {z.zuladungen.length === 1 ? 'einmal' : `${z.zuladungen.length}-mal`} nachgeladen: <b>{z.zugeladenGesamt} voll auf</b>
        {z.leergutAbGesamt > 0 && <>, <b>{z.leergutAbGesamt} leer ab</b></>}.
      </div>
      {z.zuladungen.map((e) => (
        <div key={e.id} style={{ marginTop: 10 }}>
          <div style={{ padding: '0 16px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 14, color: 'var(--text2)' }}>
            <b style={{ color: 'var(--text1)' }}>{uhrzeit(e.zeit)}</b>
            {e.geraet && <span>Gerät {e.geraet}</span>}
            {e.adrPunkte != null && <span>danach {zahl(e.adrPunkte)} ADR-Punkte an Bord (laut App)</span>}
            {e.markierung && <Tag tone="warn">{MARKIERUNG[e.markierung] || e.markierung}</Tag>}
          </div>
          <div style={{ overflowX: 'auto', marginTop: 6 }}>
            <table className="ui-table" style={{ fontSize: 15 }}>
              <thead><tr><th>Artikel</th><th className="r">Voll auf</th><th className="r">Leer ab</th></tr></thead>
              <tbody>
                {e.positionen.map((p, i) => (
                  <tr key={`${p.artikelNr}-${i}`}>
                    <td>{p.bezeichnung || p.artikelNr || '–'}{p.bezeichnung && p.artikelNr && <span className="ui-table-sub"> {p.artikelNr}</span>}</td>
                    <td className="r">{p.zugeladen || '–'}</td>
                    <td className="r">{p.leergutAb || '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <p className="ui-table-sub" style={{ margin: 0, padding: '10px 16px 16px' }}>Angaben aus der Fahrer-App. Die Ladeliste zeigt nur die Planung, im Fahrzeugbestand sind die Zuladungen eingerechnet.</p>
    </Panel>
  );
}

export default function Disposition() {
  const [von, setVon] = useState(heute());
  const [touren, setTouren] = useState(null);
  const [fahrer, setFahrer] = useState([]);
  const [basen, setBasen] = useState([]);
  const [offen, setOffen] = useState([]);
  const [vorlagen, setVorlagen] = useState([]);
  const [tour, setTour] = useState(null);
  const [ladeliste, setLadeliste] = useState(null);
  const [zugeladen, setZugeladen] = useState(null);
  const [bestand, setBestand] = useState(null);
  const [kopf, setKopf] = useState(null);
  const [auswahl, setAuswahl] = useState([]);
  const [fehler, setFehler] = useState(null);
  const [panel, setPanel] = useState('');   // '' | neu | vorlage

  const ladeTouren = useCallback(async () => { setTouren(await api(`/api/fahrer-touren?von=${von}`)); }, [von]);
  const ladeOffen = useCallback(async () => { setOffen(await api('/api/fahrer-touren/offene-bestellungen')); }, []);
  const ladeVorlagen = useCallback(async () => { setVorlagen(await api('/api/fahrer-touren/vorlagen')); }, []);
  const ladeTour = useCallback(async (id) => {
    const [t, l, z, b] = await Promise.all([api(`/api/fahrer-touren/${id}`), api(`/api/fahrer-touren/${id}/ladeliste`), api(`/api/fahrer-touren/${id}/zuladungen`), api(`/api/fahrer-touren/${id}/bestand`)]);
    setTour(t); setLadeliste(l); setZugeladen(z); setBestand(b);
    setKopf({ employeeId: t.employeeId ?? '', fahrzeug: t.fahrzeug || '', ladebasisId: t.ladebasisId ?? '' });
  }, []);

  const sicher = useCallback(async (fn) => {
    setFehler(null);
    try { await fn(); } catch (e) { setFehler(e.message); }
  }, []);
  const alles = useCallback((id) => sicher(async () => { await Promise.all([ladeTouren(), ladeOffen(), id ? ladeTour(id) : null]); }), [sicher, ladeTouren, ladeOffen, ladeTour]);

  useEffect(() => { sicher(async () => { await ladeTouren(); }); }, [sicher, ladeTouren]);
  useEffect(() => {
    sicher(async () => {
      const [f, b, o, v] = await Promise.all([api('/api/fahrer-touren/fahrer'), api('/api/fahrer-ladebasen'), api('/api/fahrer-touren/offene-bestellungen'), api('/api/fahrer-touren/vorlagen')]);
      setFahrer(f); setBasen(b); setOffen(o); setVorlagen(v);
    });
  }, [sicher]);

  const entwurf = tour?.status === 'entwurf';
  // Vor dem Start gleicht der Bestand der Ladeliste; gezeigt wird er, sobald die Tour läuft oder schon etwas gebucht ist.
  const bestandSichtbar = !!bestand && (['unterwegs', 'beendet'].includes(tour?.status) || bestand.geliefertGesamt > 0 || bestand.zugeladenGesamt > 0 || bestand.abgeladenGesamt > 0);
  const stopps = tour?.stoppListe || [];
  const namen = useMemo(() => Object.fromEntries((ladeliste?.zeilen || []).map((z) => [z.artikelNr, z.bezeichnung])), [ladeliste]);
  const flaschen = ladeliste?.flaschenGesamt ?? 0;
  const kopfGeaendert = kopf && tour && (Number(kopf.employeeId) !== tour.employeeId || (kopf.fahrzeug || '') !== (tour.fahrzeug || '') || (kopf.ladebasisId === '' ? null : Number(kopf.ladebasisId)) !== (tour.ladebasisId ?? null));

  const aktion = (name, bestaetigung) => async () => {
    if (bestaetigung && !window.confirm(bestaetigung)) return;
    await sicher(async () => { await api(`/api/fahrer-touren/${tour.id}/${name}`, 'POST'); await alles(tour.id); });
  };
  const verschiebe = (s, richtung) => sicher(async () => {
    const ids = stopps.map((x) => x.id);
    const i = ids.indexOf(s.id);
    [ids[i], ids[i + richtung]] = [ids[i + richtung], ids[i]];
    await api(`/api/fahrer-touren/${tour.id}/reihenfolge`, 'PUT', { stoppIds: ids });
    await alles(tour.id);
  });
  const hinzufuegen = () => sicher(async () => {
    await api(`/api/fahrer-touren/${tour.id}/bestellungen`, 'POST', { bestellIds: auswahl });
    setAuswahl([]);
    await alles(tour.id);
  });
  const kopfSpeichern = () => sicher(async () => {
    await api(`/api/fahrer-touren/${tour.id}`, 'PATCH', { employeeId: Number(kopf.employeeId), fahrzeug: kopf.fahrzeug, ladebasisId: kopf.ladebasisId === '' ? null : Number(kopf.ladebasisId) });
    await alles(tour.id);
  });
  const waehleTour = (id) => { setAuswahl([]); sicher(() => ladeTour(id)); };
  const nachAnlegen = (t) => { setPanel(''); return alles(t.id); };

  return (
    <div style={{ maxWidth: 1500, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
        <div style={{ marginRight: 'auto' }}>
          <h1 className="page-title">Disposition</h1>
          <p className="page-subtitle" style={{ fontSize: 15, color: 'var(--text2)' }}>Tour anlegen, Bestellungen zuordnen, Reihenfolge festlegen, Ladeliste prüfen und freigeben. Das Tablet lädt die Tour mit „Touren neu laden“.</p>
        </div>
        <Link className="btn btn-secondary" to="/gashandel/einstellungen" style={{ textDecoration: 'none' }}>Vorlagen pflegen</Link>
        <button className="btn btn-secondary" onClick={() => setPanel((p) => (p === 'vorlage' ? '' : 'vorlage'))}>Tour aus Vorlage</button>
        <button className="btn btn-primary" onClick={() => setPanel((p) => (p === 'neu' ? '' : 'neu'))}>Tour anlegen</button>
      </div>
      {fehler && <div className="alert alert-error" role="alert">✗ {fehler}</div>}

      {panel === 'neu' && <NeueTour fahrer={fahrer} basen={basen} onFehler={setFehler} onAngelegt={nachAnlegen} onClose={() => setPanel('')} />}
      {panel === 'vorlage' && <AusVorlage vorlagen={vorlagen} onFehler={setFehler} onAngelegt={nachAnlegen} onClose={() => setPanel('')} />}

      <div className="ui-dispo">
        <nav className="ui-panel" aria-label="Touren" style={{ alignSelf: 'start' }}>
          <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="ui-panel-title" style={{ fontSize: 19 }}>Touren ab</span>
            <input type="date" className="form-input" style={{ marginLeft: 'auto', width: 'auto', padding: '5px 6px', fontSize: 13 }} aria-label="Datum" value={von} onChange={(e) => setVon(e.target.value)} />
          </div>
          {(touren || []).map((t) => (
            <button key={t.id} type="button" onClick={() => waehleTour(t.id)} aria-current={tour?.id === t.id ? 'true' : undefined}
              style={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%', textAlign: 'left', padding: '12px 14px', border: 0, borderTop: '1px solid var(--border)', background: tour?.id === t.id ? 'var(--nav-active-bg)' : 'transparent', color: 'var(--text1)', font: 'inherit', cursor: 'pointer' }}>
              <b>{datumDe(t.datum)} {t.bezeichnung}</b>
              <span className="ui-table-sub">{t.fahrerName || '—'}, {t.bueroCheck ? 'erledigt' : STATUS[t.status]?.label.toLowerCase()}, {t.stopps === 0 ? 'leer' : `${t.stopps} Stopps`}</span>
            </button>
          ))}
          {touren && !touren.length && <div className="ui-table-sub" style={{ padding: '0 14px 14px' }}>Keine Touren ab diesem Datum.</div>}
        </nav>

        <section className="ui-panel" aria-label="Tour">
          {tour ? (
            <>
              <div style={{ padding: '16px 16px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '8px 14px' }}>
                  <h2 className="ui-panel-title" style={{ fontSize: 26, marginRight: 'auto' }}>{datumDe(tour.datum)} {tour.bezeichnung}</h2>
                  <span className="ui-table-sub">{flaschen} Flaschen, {stopps.length} Stopps</span>
                </div>
                <Schritte status={tour.status} erledigt={!!tour.bueroCheck} />
                {entwurf ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
                    <Feld label="Fahrer"><select className="form-select" value={kopf?.employeeId ?? ''} onChange={(e) => setKopf((k) => ({ ...k, employeeId: e.target.value }))}>{fahrer.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Feld>
                    <Feld label="Fahrzeug"><input className="form-input" value={kopf?.fahrzeug ?? ''} onChange={(e) => setKopf((k) => ({ ...k, fahrzeug: e.target.value }))} /></Feld>
                    <Feld label="Ladebasis"><select className="form-select" value={kopf?.ladebasisId ?? ''} onChange={(e) => setKopf((k) => ({ ...k, ladebasisId: e.target.value }))}><option value="">keine</option>{basen.filter((b) => b.aktiv || b.id === tour.ladebasisId).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Feld>
                    {kopfGeaendert && <button className="btn btn-primary" onClick={kopfSpeichern}>Speichern</button>}
                  </div>
                ) : (
                  <div className="ui-table-sub">{tour.fahrerName} · {tour.fahrzeug || 'kein Fahrzeug'} · Ladebasis: {tour.ladebasisName || 'keine'}{tour.status === 'freigegeben' && ' · gesperrt'}{tour.bueroCheck && ` · Büro-Check ${uhrzeit(tour.bueroCheck.am)}${tour.bueroCheck.von ? ` von ${tour.bueroCheck.von}` : ''}`}</div>
                )}
              </div>
              <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {stopps.map((s, i) => (
                  <Stopp key={s.id} s={s} index={i} anzahl={stopps.length} gesperrt={!entwurf} namen={namen}
                    onHoch={(x) => verschiebe(x, -1)} onRunter={(x) => verschiebe(x, 1)}
                    onEntfernen={(x) => sicher(async () => { await api(`/api/fahrer-touren/${tour.id}/stopps/${x.id}`, 'DELETE'); await alles(tour.id); })}
                    onSpeichern={(x, e) => sicher(async () => { await api(`/api/fahrer-touren/${tour.id}/stopps/${x.id}`, 'PATCH', e); await ladeTour(tour.id); })} />
                ))}
              </ol>
              {!stopps.length && <div className="ui-table-sub" style={{ padding: '0 16px 14px' }}>Noch keine Stopps. Unten Bestellungen auswählen.</div>}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, padding: '14px 16px', borderTop: '1px solid var(--border)' }}>
                {tour.status === 'entwurf' && <button className="btn btn-primary" onClick={aktion('freigeben')}>Freigeben</button>}
                {stopps.length > 0 && <button className="btn btn-secondary" onClick={() => { const n = window.prompt('Name der Vorlage', tour.bezeichnung); if (n && n.trim()) sicher(async () => { await api(`/api/fahrer-touren/${tour.id}/als-vorlage`, 'POST', { name: n.trim() }); await ladeVorlagen(); }); }}>Als Vorlage speichern</button>}
                {tour.status === 'freigegeben' && <button className="btn btn-secondary" onClick={aktion('zurueck', 'Tour zurück in den Entwurf? Das Tablet lädt sie dann nicht mehr.')}>Zurück in Entwurf</button>}
                {['entwurf', 'freigegeben', 'unterwegs'].includes(tour.status) && (
                  <button className="btn btn-secondary" style={{ color: 'var(--err-fg)' }} onClick={aktion('stornieren', 'Tour stornieren? Die Bestellungen werden wieder frei.')}>Stornieren</button>)}
                {tour.status === 'unterwegs' && <button className="btn btn-secondary" onClick={aktion('beenden', 'Tour im Büro beenden? Nur für den Notfall, wenn das Tablet sie nicht beenden kann.')}>Im Büro beenden</button>}
                {tour.status === 'beendet' && !tour.bueroCheck && (
                  <button className="btn btn-primary" onClick={() => {
                    const anBord = bestand && (bestand.vollGesamt > 0 || bestand.leergutGesamt > 0) ? ` Laut Portal sind noch ${bestand.vollGesamt} voll und ${bestand.leergutGesamt} leer an Bord.` : '';
                    if (window.confirm(`Büro-Check: Ist das Fahrzeug abgeladen?${anBord} Die Tour wird als erledigt markiert, der Fahrzeugbestand gilt als 0.`)) sicher(async () => { await api(`/api/fahrer-touren/${tour.id}/buero-check`, 'POST'); await alles(tour.id); });
                  }}>Büro-Check: Fahrzeug abgeladen</button>)}
                {tour.bueroCheck && (
                  <button className="btn btn-secondary" onClick={() => { if (window.confirm('Büro-Check zurücknehmen? Die Tour steht dann wieder auf „Beendet“.')) sicher(async () => { await api(`/api/fahrer-touren/${tour.id}/buero-check`, 'DELETE'); await alles(tour.id); }); }}>Büro-Check zurücknehmen</button>)}
                {(tour.status === 'storniert' || !stopps.length) && (
                  <button className="btn btn-secondary" onClick={() => { if (window.confirm('Tour entfernen?')) sicher(async () => { await api(`/api/fahrer-touren/${tour.id}`, 'DELETE'); setTour(null); setLadeliste(null); setZugeladen(null); setBestand(null); await alles(); }); }}>Entfernen</button>)}
              </div>
            </>
          ) : <div className="ui-panel-body ui-table-sub">Tour links wählen oder oben neu anlegen.</div>}
          <OffeneBestellungen offen={offen} auswahl={auswahl} setAuswahl={setAuswahl} onHinzu={hinzufuegen} aktiv={entwurf} />
        </section>

        <aside style={{ alignSelf: 'start', display: 'flex', flexDirection: 'column', gap: 16 }}><Ladeliste l={ladeliste} />{bestandSichtbar && <Bestand b={bestand} check={tour?.bueroCheck} />}<Zugeladen z={zugeladen} /></aside>
      </div>
    </div>
  );
}
