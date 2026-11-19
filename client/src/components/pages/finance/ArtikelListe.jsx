import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { Panel, Tag, SelectionBar, GasCylinder } from '../../ui';
import PricePreview from './PricePreview';
import SerPush from './SerPush';

// #606 Artikel (Liste): ein Blick auf Stamm, Lexware, SER und Fahrer-App je Artikel.
// Schritt 1 von 4: Liste mit Filtern, Hinweisen und den Aktionen Preise anpassen und Push SER.
// Die alten Seiten (Produkte, Artikelstamm, Einkaufspreise) bleiben, bis alle Funktionen hier sind.

const TYPEN = { F: 'Füllung', P: 'Pfand', S: 'Kaufflasche', V: 'Provision' };
const eur = (c) => (c == null ? '–' : (c / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €');
const zahl = (v) => Number(v).toLocaleString('de-DE', { maximumFractionDigits: 3 });

const FILTER = [
  ['alle', 'Alle'], ['fuell', 'Füllungen'], ['flasche', 'Pfand und Kaufflaschen'],
  ['abw', 'Abweichungen'], ['luecke', 'Unvollständig'],
];

const lexTon = { ok: 'ok', abweichend: 'err', fehlt: 'warn' };
const serTon = { ok: 'ok', abweichend: 'err', 'Name anders': 'warn', fehlt: 'warn' };

function Status({ text, ton }) {
  if (text === 'nicht verglichen') return <span className="ui-table-sub">–</span>;
  return <Tag tone={ton[text] || 'mute'}>{text === 'abweichend' ? 'Preis anders' : text}</Tag>;
}

const istAbweichend = (a) => a.lexware_status === 'abweichend' || a.ser_status === 'abweichend' || a.ser_status === 'Name anders';

export default function ArtikelListe() {
  const { hasArea } = useAuth();
  const canEdit = hasArea('gashandel.preise');

  const [daten, setDaten] = useState(null);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState('');
  const [filter, setFilter] = useState('alle');
  const [suche, setSuche] = useState('');
  const [auswahl, setAuswahl] = useState(() => new Set());
  const [zeigePreis, setZeigePreis] = useState(false);
  const [zeigeSerPush, setZeigeSerPush] = useState(false);

  const laden = useCallback(async () => {
    setLaedt(true); setFehler('');
    try {
      const r = await fetch('/api/finance/artikelliste');
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Fehler ' + r.status);
      setDaten(d);
    } catch (e) { setFehler(e.message); }
    finally { setLaedt(false); }
  }, []);
  useEffect(() => { laden(); }, [laden]);

  // Neue Suche oder neuer Filter leert die Auswahl, damit keine unsichtbaren Artikel markiert bleiben (Wunsch 06.10.2026)
  useEffect(() => { setAuswahl(new Set()); setZeigePreis(false); setZeigeSerPush(false); }, [filter, suche]);

  const artikel = daten?.artikel || [];
  const zus = daten?.zusammenfassung;

  const sichtbar = useMemo(() => {
    const woerter = suche.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return artikel.filter((a) => {
      if (filter === 'fuell' && a.typ !== 'F') return false;
      if (filter === 'flasche' && a.typ !== 'P' && a.typ !== 'S') return false;
      if (filter === 'abw' && !istAbweichend(a)) return false;
      if (filter === 'luecke' && a.luecken.length === 0) return false;
      const heu = `${a.artikel_nr} ${a.bezeichnung} ${a.un_nr || ''}`.toLowerCase();
      return woerter.every((w) => heu.includes(w));
    });
  }, [artikel, filter, suche]);

  const alleSichtbarGewaehlt = sichtbar.length > 0 && sichtbar.every((a) => auswahl.has(a.artikel_nr));
  const umschalten = (nr) => setAuswahl((s) => { const n = new Set(s); n.has(nr) ? n.delete(nr) : n.add(nr); return n; });
  const alleUmschalten = () => setAuswahl((s) => {
    const n = new Set(s);
    sichtbar.forEach((a) => (alleSichtbarGewaehlt ? n.delete(a.artikel_nr) : n.add(a.artikel_nr)));
    return n;
  });

  // Preis-Tool und Push SER arbeiten mit Lexware-Artikeln
  const gewaehlt = artikel.filter((a) => auswahl.has(a.artikel_nr));
  const lexwareIds = gewaehlt.filter((a) => a.lexware).map((a) => a.lexware.id);
  const ohneLexware = gewaehlt.length - lexwareIds.length;
  const schluessel = [...lexwareIds].sort().join(',');
  const stand = daten?.cachedAt ? new Date(daten.cachedAt).toLocaleString('de-DE') : null;

  return (
    <div style={{ maxWidth: 1400, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
        <div style={{ marginRight: 'auto', maxWidth: 680 }}>
          <h1 className="page-title">Artikel</h1>
          <p className="page-subtitle" style={{ fontSize: 15, color: 'var(--text2)' }}>
            Die Wahrheit über jeden Artikel. Lexware, Shop und, solange es ihn noch gibt, SER bekommen ihre Daten von hier.
          </p>
        </div>
        <button className="btn btn-secondary" onClick={laden} disabled={laedt}>↻ Neu laden</button>
      </div>
      {stand && <div className="ui-table-sub" style={{ marginTop: -8 }}>Lexware-Stand: {stand}</div>}

      {fehler && <div className="alert alert-error">✗ {fehler}</div>}
      {daten?.lexwareFehler && (
        <div className="alert alert-error">Lexware ist gerade nicht erreichbar ({daten.lexwareFehler}). Die Spalten Lexware, Shop und Preise aus Lexware fehlen, bis die Verbindung wieder da ist.</div>
      )}

      {zus && (zus.unvollstaendig.length > 0 || zus.abweichungen.length > 0) && (
        <div role="status" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', alignItems: 'center', fontSize: 15, padding: '12px 16px', background: 'var(--warn-bg)', color: 'var(--warn-fg)', borderRadius: 8 }}>
          <b>Zu erledigen</b>
          {zus.unvollstaendig.length > 0 && (
            <button type="button" onClick={() => setFilter('luecke')} style={linkBtn}>
              {zus.unvollstaendig.length === 1 ? `${zus.unvollstaendig[0]} ist für die Fahrer-App noch unvollständig` : `${zus.unvollstaendig.length} Füllungen sind für die Fahrer-App noch unvollständig`}
            </button>
          )}
          {zus.abweichungen.length > 0 && (
            <button type="button" onClick={() => setFilter('abw')} style={linkBtn}>
              {zus.abweichungen.length} {zus.abweichungen.length === 1 ? 'Artikel weicht' : 'Artikel weichen'} von Lexware oder SER ab
            </button>
          )}
        </div>
      )}

      <Panel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
          {daten?.rechte?.stamm && (
            <div role="group" aria-label="Filter" style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              {FILTER.map(([k, label], i) => (
                <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}
                  style={{ border: 0, borderLeft: i ? '1px solid var(--border)' : 0, background: filter === k ? 'var(--text1)' : 'var(--bg1)', color: filter === k ? 'var(--bg1)' : 'var(--text1)', padding: '9px 14px', font: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer', minHeight: 40 }}>
                  {label}
                </button>
              ))}
            </div>
          )}
          <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text2)' }}>Suchen
            <input type="search" className="form-input" style={{ minWidth: 260, width: 'auto' }} value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Nummer, Name oder UN-Nummer" />
          </label>
          <span className="ui-table-sub">{daten ? `${sichtbar.length} von ${artikel.length}` : ''}</span>
        </div>

        {canEdit && (
          <SelectionBar count={auswahl.size} onClear={() => { setAuswahl(new Set()); setZeigePreis(false); setZeigeSerPush(false); }}>
            <button className="btn" disabled={!lexwareIds.length} onClick={() => { setZeigePreis(true); setZeigeSerPush(false); }}>Preise anpassen</button>
            <button className="btn" disabled={!lexwareIds.length} onClick={() => { setZeigeSerPush((v) => !v); setZeigePreis(false); }}
              title="Lexware-Preise der ausgewählten RG-Artikel per STMUPD an SER senden">Push SER</button>
            {ohneLexware > 0 && <span style={{ fontSize: 13, color: '#e8e2d8' }}>{ohneLexware} ohne Lexware-Artikel, dafür gehen Preis und Push nicht</span>}
          </SelectionBar>
        )}

        {canEdit && zeigePreis && lexwareIds.length > 0 && (
          <div style={{ padding: 14, borderBottom: '1px solid var(--border)' }}>
            <PricePreview key={schluessel} articleIds={lexwareIds} onClose={() => setZeigePreis(false)} onApplied={laden} />
          </div>
        )}
        {canEdit && zeigeSerPush && lexwareIds.length > 0 && (
          <div style={{ padding: 14, borderBottom: '1px solid var(--border)' }}>
            <SerPush key={schluessel} articleIds={lexwareIds} onClose={() => setZeigeSerPush(false)} />
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table className="ui-table">
            <thead>
              <tr>
                {canEdit && <th style={{ width: 36 }}><input type="checkbox" aria-label="Alle sichtbaren auswählen" checked={alleSichtbarGewaehlt} onChange={alleUmschalten} style={cb} /></th>}
                <th>Nr.</th><th>Bezeichnung</th><th>Typ</th><th>ADR</th>
                <th className="r">Preis netto</th><th>Inhalt</th><th className="r">je kg/L</th>
                <th>Shop</th><th>Lexware</th>{daten?.rechte?.stamm && <><th>SER</th><th>Fahrer-App</th></>}
              </tr>
            </thead>
            <tbody>
              {sichtbar.map((a) => {
                const inhalt = a.lexware?.inhalt;
                const jeEinheit = inhalt && a.preis_netto_cent != null ? a.preis_netto_cent / inhalt.value : null;
                return (
                  <tr key={a.artikel_nr} className={auswahl.has(a.artikel_nr) ? 'is-selected' : undefined} style={{ opacity: a.aktiv === false ? 0.6 : 1 }}>
                    {canEdit && <td><input type="checkbox" aria-label={`${a.artikel_nr} auswählen`} checked={auswahl.has(a.artikel_nr)} onChange={() => umschalten(a.artikel_nr)} style={cb} /></td>}
                    <td style={{ fontWeight: 700 }}>{a.artikel_nr}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <GasCylinder gasart={a.gasart} typ={a.typ} />
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 600 }}>{a.bezeichnung}</span>
                          <span className="ui-table-sub">
                            {a.luecken.length > 0 ? `Es fehlen: ${a.luecken.join(', ')}`
                              : a.pfand_artikel_nr ? `Pfand ${a.pfand_artikel_nr}` : (a.lexware?.tags || []).join(', ')}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>{TYPEN[a.typ] || '–'}</td>
                    <td className="ui-table-sub">{a.un_nr ? `UN ${a.un_nr}${a.gefahrklasse ? `, ${a.gefahrklasse}` : ''}` : (a.typ === 'F' ? 'fehlt' : '–')}</td>
                    <td className="r">{eur(a.preis_netto_cent)}</td>
                    <td>{inhalt ? `${zahl(inhalt.value)} ${inhalt.unit}` : (a.lexware ? <Tag tone="warn">fehlt</Tag> : '–')}</td>
                    <td className="r">{jeEinheit != null ? `${eur(jeEinheit)}/${inhalt.unit}` : '–'}</td>
                    <td>{a.lexware ? <Tag tone={a.lexware.shop === 'sichtbar' ? 'ok' : 'mute'}>{a.lexware.shop}</Tag> : '–'}</td>
                    <td><Status text={a.lexware_status} ton={lexTon} /></td>
                    {daten?.rechte?.stamm && <>
                      <td>
                        <Status text={a.ser_status} ton={serTon} />
                        {a.ser_status === 'abweichend' && a.ser && <div className="ui-table-sub">SER {eur(a.ser.preis_cent)}</div>}
                      </td>
                      <td>{a.fahrer_app ? <Tag tone={a.fahrer_app === 'aktiv' ? 'ok' : 'warn'}>{a.fahrer_app}</Tag> : <span className="ui-table-sub">nicht im Stamm</span>}</td>
                    </>}
                  </tr>
                );
              })}
              {!laedt && sichtbar.length === 0 && (
                <tr><td colSpan={13} style={{ textAlign: 'center', color: 'var(--text3)', padding: 28 }}>{artikel.length ? 'Keine Artikel für diesen Filter.' : 'Keine Artikel vorhanden.'}</td></tr>
              )}
              {laedt && <tr><td colSpan={13} style={{ textAlign: 'center', color: 'var(--text3)', padding: 28 }}>Lade Artikel…</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="ui-table-sub" style={{ margin: 0, padding: '12px 14px' }}>
          Die Farbe am Flaschensymbol ist die Schulterfarbe nach DIN EN 1089-3. Pfand ist grau.
        </p>
      </Panel>
    </div>
  );
}

const linkBtn = { border: 0, background: 'transparent', padding: '4px 0', font: 'inherit', color: 'inherit', textDecoration: 'underline', cursor: 'pointer' };
const cb = { width: 18, height: 18, accentColor: 'var(--r)' };
