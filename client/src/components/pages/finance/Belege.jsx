import { useState, useEffect, useCallback } from 'react';
import { Panel, Tabs, Tag } from '../../ui';

// #516 Belege der Fahrer-App im Büro: alle Lieferscheine und Barverkäufe (Tour und Lager) mit Positionen, Unterschrift,
// Storno und Verlauf, dazu das Protokoll aller Vorgänge der Geräte. Recht fahrer.geraete wie Disposition und Einstellungen.

const api = async (url) => {
  const r = await fetch(url);
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Fehler');
  return d;
};

const heute = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date());
const zeit = (iso, mitDatum = true) => (iso ? new Date(iso).toLocaleString('de-DE', { ...(mitDatum ? { day: '2-digit', month: '2-digit' } : {}), hour: '2-digit', minute: '2-digit' }) : '–');
const euro = (c) => (c == null ? '–' : `${(Number(c) / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);
const zahl = (v) => (v == null ? '' : Number(v).toLocaleString('de-DE', { maximumFractionDigits: 2 }));

const TYPEN = {
  'tour.gestartet': 'Tour gestartet', 'tour.beendet': 'Tour beendet', 'stopp.nicht_angetroffen': 'Nicht ausgeliefert',
  'beleg.erstellt': 'Beleg erstellt', 'beleg.storniert': 'Barverkauf storniert',
};
const MARKIERUNG = {
  nach_buero_ende: 'nach Büro-Ende', nach_uebergabe: 'nach Übergabe', tour_storniert: 'Tour storniert',
  tour_unbekannt: 'Tour unbekannt', fremde_tour: 'fremde Tour', ohne_tour: 'ohne Tour',
};
const TABS = [{ id: 'belege', label: 'Belege' }, { id: 'vorgaenge', label: 'Vorgänge' }];

function Markierung({ b }) {
  if (!b.markierung || (b.markierung === 'ohne_tour' && b.geraetRolle === 'lager')) return null;
  return <Tag tone="warn">{MARKIERUNG[b.markierung] || b.markierung}</Tag>;
}

function Detail({ nummer, onZu }) {
  const [b, setB] = useState(null);
  const [fehler, setFehler] = useState('');
  useEffect(() => { setB(null); api(`/api/fahrer-belege/${encodeURIComponent(nummer)}`).then(setB).catch((e) => setFehler(e.message)); }, [nummer]);
  if (!b) return <Panel title={nummer}><div className="ui-panel-body" style={{ color: 'var(--text3)' }}>{fehler || 'Lade …'}</div></Panel>;
  const bv = b.belegart === 'BV';
  return (
    <Panel title={`${bv ? 'Barverkauf' : 'Lieferschein'} ${b.nummer}`}>
      <div className="ui-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 14, color: 'var(--text2)' }}>
          <span>{zeit(b.erstelltAm)} · Gerät {b.geraet}{b.verkaeufer ? ` · Verkäufer ${b.verkaeufer}` : b.fahrer ? ` · Fahrer ${b.fahrer}` : ''}{b.tour ? ` · Tour ${b.tour.name}` : ''}</span>
          {b.storniertAm && <Tag tone="err">storniert</Tag>}<Markierung b={b} />
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <a className="btn btn-secondary btn-sm" href={`/api/fahrer-belege/${encodeURIComponent(b.nummer)}/pdf`} target="_blank" rel="noreferrer">PDF</a>
            <button className="btn btn-secondary btn-sm" onClick={onZu}>Schließen</button>
          </span>
        </div>
        <div style={{ fontSize: 15 }}>Kunde: <b>{b.kunde || (b.kundeNr ? `Kunde ${b.kundeNr}` : bv ? 'ohne Kunde' : '–')}</b>{b.kundeNr && b.kunde ? ` (${b.kundeNr})` : ''}</div>
        {b.storniertAm && (
          <div className="alert alert-error">Storniert am {zeit(b.storniertAm)}{b.stornoVerkaeufer ? ` von ${b.stornoVerkaeufer}` : ''}: {b.stornoGrund || '–'}</div>
        )}
        <div style={{ overflowX: 'auto' }}>
          <table className="ui-table">
            <thead><tr><th>Artikel</th>{!bv && <th style={{ textAlign: 'right' }}>Bestellt</th>}<th style={{ textAlign: 'right' }}>{bv ? 'Menge' : 'Geliefert'}</th><th style={{ textAlign: 'right' }}>Leer</th>
              {bv && <><th style={{ textAlign: 'right' }}>Einzel netto</th><th style={{ textAlign: 'right' }}>Gesamt netto</th></>}</tr></thead>
            <tbody>
              {b.positionen.map((p, i) => (
                <tr key={i}>
                  <td>{p.bezeichnung}<div className="ui-table-sub">{p.artikelNr}</div></td>
                  {!bv && <td style={{ textAlign: 'right' }}>{zahl(p.soll)}</td>}
                  <td style={{ textAlign: 'right' }}>{zahl(p.geliefert)}</td><td style={{ textAlign: 'right' }}>{zahl(p.leergut)}</td>
                  {bv && <><td style={{ textAlign: 'right' }}>{euro(p.preisNettoCent)}</td><td style={{ textAlign: 'right' }}>{p.preisNettoCent == null ? '–' : euro(Math.round(p.geliefert * p.preisNettoCent))}</td></>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {bv && b.summen && (
          <div style={{ alignSelf: 'flex-end', minWidth: 240, fontSize: 14, display: 'grid', gridTemplateColumns: '1fr auto', gap: '2px 16px' }}>
            <span>Summe netto</span><span style={{ textAlign: 'right' }}>{euro(b.summen.nettoCent)}</span>
            {b.summen.saetze.map((x) => [<span key={`l${x.satz}`}>MwSt. {x.satz} %</span>, <span key={`w${x.satz}`} style={{ textAlign: 'right' }}>{euro(x.mwstCent)}</span>])}
            <b>{b.storniertAm ? 'Betrag (storniert)' : 'Bar bezahlt'}</b><b style={{ textAlign: 'right' }}>{euro(b.summen.bruttoCent)}</b>
          </div>
        )}
        {(b.unterschriftPng || b.unterzeichner) && (
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end' }}>
            {b.unterschriftPng && <img alt="Unterschrift" src={`data:image/png;base64,${b.unterschriftPng}`} style={{ maxWidth: 260, maxHeight: 90, background: '#fff', borderRadius: 6, padding: 4 }} />}
            <span style={{ fontSize: 14, color: 'var(--text2)' }}>Unterschrift: {b.unterzeichner || '–'}</span>
          </div>
        )}
        <div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Verlauf</div>
          <table className="ui-table">
            <thead><tr><th>Eingang</th><th>Gerätezeit</th><th>Vorgang</th><th>Gerät</th><th>Ergebnis</th></tr></thead>
            <tbody>
              {b.verlauf.map((v) => (
                <tr key={v.id}>
                  <td>{zeit(v.eingegangenAm)}</td><td>{zeit(v.geraetZeit)}</td><td>{TYPEN[v.typ] || v.typ}</td><td>{v.geraet}</td>
                  <td>{v.status === 'ok' ? <Tag tone="ok">angenommen</Tag> : <><Tag tone="err">abgelehnt</Tag> <span className="ui-table-sub">{v.fehlerText || v.fehlerCode}</span></>}</td>
                </tr>
              ))}
              {!b.verlauf.length && <tr><td colSpan={5} style={{ color: 'var(--text3)' }}>Kein Vorgang gespeichert.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </Panel>
  );
}

function BelegeListe({ geraete }) {
  const [f, setF] = useState({ von: heute(), bis: heute(), geraet: '', art: '', storniert: '', q: '' });
  const [daten, setDaten] = useState(null);
  const [fehler, setFehler] = useState('');
  const [offen, setOffen] = useState(null);
  const query = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const laden = useCallback(async () => {
    setFehler('');
    try { setDaten(await api(`/api/fahrer-belege?${query}`)); } catch (e) { setFehler(e.message); setDaten(null); }
  }, [query]);
  useEffect(() => { const t = setTimeout(laden, 250); return () => clearTimeout(t); }, [laden]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const belege = daten?.belege || [];
  const bar = belege.filter((b) => b.belegart === 'BV' && !b.storniertAm).reduce((s, b) => s + (b.bruttoCent || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, alignItems: 'end' }}>
        <label style={lab}>Von<input className="form-input" type="date" value={f.von} onChange={set('von')} /></label>
        <label style={lab}>Bis<input className="form-input" type="date" value={f.bis} onChange={set('bis')} /></label>
        <label style={lab}>Gerät<select className="form-select" value={f.geraet} onChange={set('geraet')}><option value="">alle</option>{geraete.map((g) => <option key={g.id} value={g.id}>{g.kennung}{g.rolle === 'lager' ? ' (Lager)' : ''}</option>)}</select></label>
        <label style={lab}>Art<select className="form-select" value={f.art} onChange={set('art')}><option value="">alle</option><option value="LS">Lieferschein</option><option value="BV">Barverkauf</option></select></label>
        <label style={lab}>Storno<select className="form-select" value={f.storniert} onChange={set('storniert')}><option value="">alle</option><option value="ja">nur stornierte</option><option value="nein">ohne stornierte</option></select></label>
        <label style={lab}>Suche<input className="form-input" placeholder="Nummer, Kunde, Name" value={f.q} onChange={set('q')} /></label>
        <a className="btn btn-secondary" href={`/api/fahrer-belege/pdf?${query}`} target="_blank" rel="noreferrer">Als PDF</a>
      </div>
      {fehler && <div className="alert alert-error" role="alert">✗ {fehler}</div>}
      {daten && (
        <div style={{ fontSize: 14, color: 'var(--text2)' }}>
          {belege.length} Beleg{belege.length === 1 ? '' : 'e'}{belege.length >= 500 ? ' (nur die neuesten 500, bitte Zeitraum eingrenzen)' : ''}
          {belege.some((b) => b.belegart === 'BV') && <> · Barverkäufe ohne Stornos: <b>{euro(bar)}</b></>}
        </div>
      )}
      {offen && <Detail nummer={offen} onZu={() => setOffen(null)} />}
      <div style={{ overflowX: 'auto' }}>
        <table className="ui-table">
          <thead><tr><th>Zeit</th><th>Nummer</th><th>Gerät</th><th>Fahrer / Verkäufer</th><th>Kunde</th><th>Tour</th><th style={{ textAlign: 'right' }}>Menge / Leer</th><th style={{ textAlign: 'right' }}>Betrag</th><th>Status</th></tr></thead>
          <tbody>
            {belege.map((b) => (
              <tr key={b.nummer} onClick={() => setOffen(b.nummer)} style={{ cursor: 'pointer', background: offen === b.nummer ? 'var(--bg3, rgba(0,0,0,.04))' : undefined }}>
                <td style={{ whiteSpace: 'nowrap' }}>{zeit(b.erstelltAm)}</td>
                <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{b.nummer}<div className="ui-table-sub">{b.belegart === 'BV' ? 'Barverkauf' : 'Lieferschein'}</div></td>
                <td>{b.geraet}</td>
                <td>{b.verkaeufer || b.fahrer || '–'}</td>
                <td>{b.kunde || (b.kundeNr ? `Kunde ${b.kundeNr}` : b.belegart === 'BV' ? 'ohne Kunde' : '–')}{b.unterzeichner && <div className="ui-table-sub">unterschrieben: {b.unterzeichner}</div>}</td>
                <td>{b.tour ? b.tour.name : '–'}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{zahl(b.menge)} / {zahl(b.leergut)}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap', textDecoration: b.storniertAm ? 'line-through' : undefined }}>{b.belegart === 'BV' ? euro(b.bruttoCent) : '–'}</td>
                <td>{b.storniertAm ? <Tag tone="err">storniert</Tag> : <Tag tone="ok">gültig</Tag>} <Markierung b={b} /></td>
              </tr>
            ))}
            {daten && !belege.length && <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text3)', padding: 24 }}>Keine Belege in diesem Zeitraum.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Vorgaenge({ geraete }) {
  const [f, setF] = useState({ von: heute(), bis: heute(), geraet: '', typ: '', status: '' });
  const [daten, setDaten] = useState(null);
  const [fehler, setFehler] = useState('');
  const query = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  useEffect(() => {
    const t = setTimeout(() => { setFehler(''); api(`/api/fahrer-belege/vorgaenge?${query}`).then(setDaten).catch((e) => { setFehler(e.message); setDaten(null); }); }, 250);
    return () => clearTimeout(t);
  }, [query]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const liste = daten?.vorgaenge || [];
  // „ohne Tour“ ist am Lager der Normalfall und wird dort nicht markiert (wie in der Belegliste).
  const lager = new Set(geraete.filter((g) => g.rolle === 'lager').map((g) => g.kennung));
  const zeigeMarke = (v) => v.markierung && !(v.markierung === 'ohne_tour' && lager.has(v.geraet));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--text2)' }}>Alles, was die Geräte ans Portal geschickt haben, auch abgelehnte Vorgänge. Zeit = Eingang im Portal.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, alignItems: 'end' }}>
        <label style={lab}>Von<input className="form-input" type="date" value={f.von} onChange={set('von')} /></label>
        <label style={lab}>Bis<input className="form-input" type="date" value={f.bis} onChange={set('bis')} /></label>
        <label style={lab}>Gerät<select className="form-select" value={f.geraet} onChange={set('geraet')}><option value="">alle</option>{geraete.map((g) => <option key={g.id} value={g.id}>{g.kennung}</option>)}</select></label>
        <label style={lab}>Vorgang<select className="form-select" value={f.typ} onChange={set('typ')}><option value="">alle</option>{Object.entries(TYPEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label style={lab}>Ergebnis<select className="form-select" value={f.status} onChange={set('status')}><option value="">alle</option><option value="ok">angenommen</option><option value="fehler">abgelehnt</option></select></label>
      </div>
      {fehler && <div className="alert alert-error" role="alert">✗ {fehler}</div>}
      <div style={{ overflowX: 'auto' }}>
        <table className="ui-table">
          <thead><tr><th>Eingang</th><th>Gerätezeit</th><th>Gerät</th><th style={{ textAlign: 'right' }}>Nr.</th><th>Vorgang</th><th>Beleg / Tour</th><th>Fahrer / Verkäufer</th><th>Ergebnis</th></tr></thead>
          <tbody>
            {liste.map((v) => (
              <tr key={v.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{zeit(v.eingegangenAm)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{zeit(v.geraetZeit)}</td>
                <td>{v.geraet}</td>
                <td style={{ textAlign: 'right' }}>{v.lfd}</td>
                <td>{TYPEN[v.typ] || v.typ}</td>
                <td>{v.nummer || (v.tourId ? `Tour ${v.tourId}${v.stoppId ? `, Stopp ${v.stoppId}` : ''}` : '–')}</td>
                <td>{v.verkaeufer || v.fahrer || '–'}</td>
                <td>{v.status === 'ok' ? <Tag tone="ok">angenommen</Tag> : <><Tag tone="err">abgelehnt</Tag><div className="ui-table-sub">{v.fehlerText || v.fehlerCode}</div></>}
                  {zeigeMarke(v) && <> <Tag tone="warn">{MARKIERUNG[v.markierung] || v.markierung}</Tag></>}</td>
              </tr>
            ))}
            {daten && !liste.length && <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text3)', padding: 24 }}>Keine Vorgänge in diesem Zeitraum.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Belege() {
  const [tab, setTab] = useState('belege');
  const [geraete, setGeraete] = useState([]);
  useEffect(() => { api('/api/fahrer-belege/geraete').then(setGeraete).catch(() => setGeraete([])); }, []);
  return (
    <div style={{ maxWidth: 1300, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 className="page-title">Belege</h1>
        <p className="page-subtitle" style={{ fontSize: 15, color: 'var(--text2)' }}>Lieferscheine und Barverkäufe aus der Fahrer-App, von der Tour und vom Lager, mit allen Vorgängen.</p>
      </div>
      <Panel>
        <Tabs items={TABS} value={tab} onChange={setTab} label="Belege" />
        <div style={{ padding: 18 }}>
          {tab === 'belege' ? <BelegeListe geraete={geraete} /> : <Vorgaenge geraete={geraete} />}
        </div>
      </Panel>
    </div>
  );
}

const lab = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14, color: 'var(--text2)' };
