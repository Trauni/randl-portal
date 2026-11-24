import { useState, useEffect } from 'react';
import { Tag } from '../../ui';

// #516 Beleg der Fahrer-App als Popup, dazu eine kurze Belegliste für Kunden- und Bestellansicht.
// Gemeinsam genutzt von Belege, Kunden und Bestellungen. Recht fahrer.geraete: ohne Recht bleibt die Liste leer.

const api = async (url) => {
  const r = await fetch(url);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(d.error || 'Fehler'); e.status = r.status; throw e; }
  return d;
};

export const zeit = (iso, mitDatum = true) => (iso ? new Date(iso).toLocaleString('de-DE', { ...(mitDatum ? { day: '2-digit', month: '2-digit' } : {}), hour: '2-digit', minute: '2-digit' }) : '–');
const datum = (iso) => (iso ? new Date(iso).toLocaleDateString('de-DE') : '–');
export const euro = (c) => (c == null ? '–' : `${(Number(c) / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);
export const zahl = (v) => (v == null ? '' : Number(v).toLocaleString('de-DE', { maximumFractionDigits: 2 }));

export const TYPEN = {
  'tour.gestartet': 'Tour gestartet', 'tour.beendet': 'Tour beendet', 'stopp.nicht_angetroffen': 'Nicht ausgeliefert',
  'beleg.erstellt': 'Beleg erstellt', 'beleg.storniert': 'Barverkauf storniert',
};
export const MARKIERUNG = {
  nach_buero_ende: 'nach Büro-Ende', nach_uebergabe: 'nach Übergabe', tour_storniert: 'Tour storniert',
  tour_unbekannt: 'Tour unbekannt', fremde_tour: 'fremde Tour', ohne_tour: 'ohne Tour',
};

export function Markierung({ b }) {
  if (!b.markierung || (b.markierung === 'ohne_tour' && b.geraetRolle === 'lager')) return null;
  return <Tag tone="warn">{MARKIERUNG[b.markierung] || b.markierung}</Tag>;
}

function BelegInhalt({ nummer, onZu }) {
  const [b, setB] = useState(null);
  const [fehler, setFehler] = useState('');
  useEffect(() => { setB(null); api(`/api/fahrer-belege/${encodeURIComponent(nummer)}`).then(setB).catch((e) => setFehler(e.message)); }, [nummer]);
  if (!b) return <div style={{ color: 'var(--text3)', padding: 8 }}>{fehler || 'Lade …'}</div>;
  const bv = b.belegart === 'BV';
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontWeight: 600, fontSize: 17, color: 'var(--text1)', paddingRight: 40 }}>{bv ? 'Barverkauf' : 'Lieferschein'} {b.nummer}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 14, color: 'var(--text2)' }}>
          <span>{zeit(b.erstelltAm)} · Gerät {b.geraet}{b.verkaeufer ? ` · Verkäufer ${b.verkaeufer}` : b.fahrer ? ` · Fahrer ${b.fahrer}` : ''}{b.tour ? ` · Tour ${b.tour.name}` : ''}{b.bestellung ? ` · Bestellung ${b.bestellung.ref || `#${String(b.bestellung.id).slice(-8).toUpperCase()}`}` : ''}</span>
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
    </>
  );
}

/** Beleg im Popup: bleibt an der Stelle, an der man in der Liste ist. Esc oder Klick daneben schließt. */
export function BelegPopup({ nummer, onZu }) {
  useEffect(() => {
    const taste = (e) => { if (e.key === 'Escape') onZu(); };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [onZu]);
  if (!nummer) return null;
  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onZu(); }} role="dialog" aria-modal="true"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'relative', background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 10, padding: '1.25rem 1.5rem', width: '100%', maxWidth: 900, maxHeight: '90vh', overflowY: 'auto' }}>
        <button onClick={onZu} aria-label="Schließen" style={{ position: 'absolute', top: 12, right: 12, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text2)', cursor: 'pointer', padding: '.2rem .55rem', fontSize: '.8rem' }}>✕</button>
        <BelegInhalt nummer={nummer} onZu={onZu} />
      </div>
    </div>
  );
}

/**
 * Kurze Belegliste zu Kunden (kundenNr: Lexware- und SER-Nummer) oder Bestellungen (bestellIds). Klick öffnet das Popup.
 * Ohne Recht fahrer.geraete (403) wird nichts angezeigt.
 */
export function BelegeZu({ kundenNr = [], bestellIds = [], titel = 'Belege der Fahrer-App', max = 20 }) {
  const kn = kundenNr.filter(Boolean).join(','), bi = bestellIds.filter(Boolean).join(',');
  const [belege, setBelege] = useState(null);
  const [verboten, setVerboten] = useState(false);
  const [offen, setOffen] = useState(null);
  useEffect(() => {
    if (!kn && !bi) { setBelege([]); return; }
    let aktiv = true;
    const q = new URLSearchParams({ ...(kn ? { kunde: kn } : {}), ...(bi ? { bestellung: bi } : {}) });
    api(`/api/fahrer-belege/zu?${q}`).then((d) => aktiv && setBelege(d.belege || []))
      .catch((e) => { if (!aktiv) return; if (e.status === 403 || e.status === 401) setVerboten(true); setBelege([]); });
    return () => { aktiv = false; };
  }, [kn, bi]);
  if (verboten) return null;
  return (
    <div style={{ marginTop: '1rem' }}>
      <div style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--text1)', marginBottom: '.5rem' }}>{titel}{belege ? ` (${belege.length})` : ''}</div>
      {!belege ? <div style={{ color: 'var(--text3)', fontSize: '.8rem' }}>Lade …</div>
        : !belege.length ? <div style={{ color: 'var(--text3)', fontSize: '.8rem' }}>Keine Belege.</div> : (
          <div style={{ background: 'var(--bg2)', borderRadius: 8, overflow: 'hidden' }}>
            {belege.slice(0, max).map((b) => (
              <div key={b.nummer} onClick={() => setOffen(b.nummer)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setOffen(b.nummer); }}
                style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', padding: '.45rem .75rem', borderBottom: '1px solid rgba(255,255,255,.04)', alignItems: 'center', cursor: 'pointer' }}>
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '.72rem', color: 'var(--text1)' }}>{b.nummer}</span>
                  <span style={{ fontSize: '.78rem', color: 'var(--text2)', marginLeft: '.5rem' }}>{datum(b.erstelltAm)} · {b.belegart === 'BV' ? 'Barverkauf' : 'Lieferschein'}{b.tour ? ` · ${b.tour.name}` : ''}</span>
                </div>
                <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center', whiteSpace: 'nowrap', fontSize: '.78rem', color: 'var(--text2)' }}>
                  <span>{zahl(b.menge)} / {zahl(b.leergut)} leer</span>
                  {b.belegart === 'BV' && <span style={{ textDecoration: b.storniertAm ? 'line-through' : undefined }}>{euro(b.bruttoCent)}</span>}
                  {b.storniertAm && <Tag tone="err">storniert</Tag>}
                </div>
              </div>
            ))}
            {belege.length > max && <div style={{ padding: '.4rem .75rem', fontSize: '.75rem', color: 'var(--text3)' }}>… und {belege.length - max} weitere unter Gashandel → Belege</div>}
          </div>
        )}
      {offen && <BelegPopup nummer={offen} onZu={() => setOffen(null)} />}
    </div>
  );
}
