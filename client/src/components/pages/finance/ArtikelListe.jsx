import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { Panel, Tag, SelectionBar, GasCylinder } from '../../ui';
import { filtereArtikel, LUECKEN } from '../../../utils/artikelFilter';
import PricePreview from './PricePreview';
import SerPush from './SerPush';
import InhaltZelle from './artikel/InhaltZelle';
import ArtikelNeu from './artikel/ArtikelNeu';
import ArtikelBearbeiten from './artikel/ArtikelBearbeiten';
import SerAbgleich from './artikel/SerAbgleich';
import PreiseAusLexware from './artikel/PreiseAusLexware';

// #606 Artikel (Liste): ein Blick auf Stamm, Lexware, SER und Fahrer-App je Artikel.
// Teil 2 von 4: alle Funktionen der Seiten Produkte und Artikelstamm. Die alten Seiten bleiben bis zur Umleitung (Teil 4).

const TYPEN = { F: 'Füllung', P: 'Pfand', S: 'Kaufflasche', V: 'Provision' };
const TYP_AUSWAHL = { F: 'Füllung', P: 'Pfand', S: 'Steuer/Nutzung (Kaufflasche)', V: 'Provision' };
const eur = (c) => (c == null ? '–' : (c / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €');
const zahl = (v) => (v == null ? '–' : Number(v).toLocaleString('de-DE', { maximumFractionDigits: 3 }));

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

export default function ArtikelListe() {
  const { hasArea } = useAuth();
  const canEdit = hasArea('gashandel.preise');

  const [daten, setDaten] = useState(null);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState('');
  const [hinweis, setHinweis] = useState('');
  const [kurz, setKurz] = useState('alle');
  const [suche, setSuche] = useState('');
  const [typ, setTyp] = useState('');
  const [einheit, setEinheit] = useState('');
  const [sparte, setSparte] = useState('');
  const [fehlt, setFehlt] = useState('');
  const [tags, setTags] = useState([]);
  const [nurAktiv, setNurAktiv] = useState(true);
  const [mehrSpalten, setMehrSpalten] = useState(false);
  const [auswahl, setAuswahl] = useState(() => new Set());
  const [dialog, setDialog] = useState('');           // '' | preis | serpush | bearbeiten
  const [zeigeNeu, setZeigeNeu] = useState(false);
  const [zeigeSer, setZeigeSer] = useState(false);
  const [zeigeLexPreise, setZeigeLexPreise] = useState(false);
  const [fuelle, setFuelle] = useState(false);

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
  useEffect(() => { setAuswahl(new Set()); setDialog(''); }, [kurz, suche, typ, einheit, sparte, fehlt, tags, nurAktiv]);

  const artikel = daten?.artikel || [];
  const zus = daten?.zusammenfassung;
  const stammRecht = !!daten?.rechte?.stamm;
  const alleTags = useMemo(() => [...new Set(artikel.flatMap((a) => a.lexware?.tags || []))].sort(), [artikel]);
  const sichtbar = useMemo(() => filtereArtikel(artikel, { kurz, suche, typ, einheit, sparte, fehlt, tags, nurAktiv }), [artikel, kurz, suche, typ, einheit, sparte, fehlt, tags, nurAktiv]);
  const alleSparten = useMemo(() => [...new Set(artikel.map((a) => a.sparte).filter(Boolean))].sort(), [artikel]);

  const alleSichtbarGewaehlt = sichtbar.length > 0 && sichtbar.every((a) => auswahl.has(a.artikel_nr));
  const umschalten = (nr) => setAuswahl((s) => { const n = new Set(s); n.has(nr) ? n.delete(nr) : n.add(nr); return n; });
  const alleUmschalten = () => setAuswahl((s) => {
    const n = new Set(s);
    sichtbar.forEach((a) => (alleSichtbarGewaehlt ? n.delete(a.artikel_nr) : n.add(a.artikel_nr)));
    return n;
  });
  const toggleTag = (t) => setTags((f) => (f.includes(t) ? f.filter((x) => x !== t) : [...f, t]));
  const filterZuruecksetzen = () => { setKurz('alle'); setSuche(''); setTyp(''); setEinheit(''); setSparte(''); setFehlt(''); setTags([]); };
  const filterAktiv = kurz !== 'alle' || suche || typ || einheit || sparte || fehlt || tags.length > 0;

  // Preis-Tool und Push SER arbeiten mit Lexware-Artikeln, Felder bearbeiten mit Artikeln aus dem Stamm
  const gewaehlt = artikel.filter((a) => auswahl.has(a.artikel_nr));
  const lexwareIds = gewaehlt.filter((a) => a.lexware).map((a) => a.lexware.id);
  const ohneLexware = gewaehlt.length - lexwareIds.length;
  const ohneStamm = gewaehlt.filter((a) => !a.im_stamm).length;
  const schluessel = [...lexwareIds].sort().join(',');
  const stand = daten?.cachedAt ? new Date(daten.cachedAt).toLocaleString('de-DE') : null;
  const ohneInhalt = daten?.ohneInhalt || 0;

  const inhaltGespeichert = (lexId, inhalt) => setDaten((d) => {
    const artikelNeu = d.artikel.map((a) => (a.lexware?.id === lexId ? { ...a, lexware: { ...a.lexware, inhalt } } : a));
    return { ...d, artikel: artikelNeu, ohneInhalt: artikelNeu.filter((a) => a.lexware && !a.lexware.inhalt).length };
  });

  const vorbefuellen = async () => {
    setFuelle(true); setFehler(''); setHinweis('');
    try {
      const r = await fetch('/api/finance/article-content/prefill', { method: 'POST' });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Fehler ' + r.status);
      const rest = d.unrecognized.length ? ` Nicht erkannt (bitte nachpflegen): ${d.unrecognized.map((u) => u.articleNumber).join(', ')}.` : '';
      setHinweis(`${d.filled.length} Artikel aus dem Titel vorbefüllt.${rest}`);
      await laden();
    } catch (e) { setFehler(e.message); }
    finally { setFuelle(false); }
  };

  // #610: Shop-Kennzeichen für mehrere Artikel setzen oder aus dem Lexware-Präfix übernehmen
  const shopSetzen = async (wert) => {
    setFehler(''); setHinweis('');
    try {
      const r = await fetch('/api/finance/artikelstamm/aendern', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nummern: [...auswahl], werte: { shop_sichtbar: wert } }) });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Fehler ' + r.status);
      setHinweis(`Shop-Kennzeichen: ${d.geaendert} Artikel geändert, ${d.unveraendert} unverändert.`);
      await laden();
    } catch (e) { setFehler(e.message); }
  };
  const shopAusLexware = async () => {
    setFehler(''); setHinweis('');
    try {
      const r = await fetch('/api/finance/artikelliste/shop-aus-lexware', { method: 'POST' });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Fehler ' + r.status);
      setHinweis(`Shop-Kennzeichen aus Lexware übernommen: ${d.sichtbar} sichtbar, ${d.ausgeblendet} ausgeblendet. ${d.ohneLexware} Artikel ohne Lexware-Gegenstück bleiben ohne Wert.`);
      await laden();
    } catch (e) { setFehler(e.message); }
  };

  const nachBearbeiten = async (bleibenGewaehlt) => {
    await laden();
    if (bleibenGewaehlt) setAuswahl(new Set(bleibenGewaehlt));
  };

  const spalten = 4 + (canEdit ? 1 : 0) + (stammRecht ? 5 : 0) + (mehrSpalten ? 8 : 0) + 8;

  return (
    <div style={{ maxWidth: 1500, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
        <div style={{ marginRight: 'auto', maxWidth: 680 }}>
          <h1 className="page-title">Artikel</h1>
          <p className="page-subtitle" style={{ fontSize: 15, color: 'var(--text2)' }}>
            Die Wahrheit über jeden Artikel. Lexware, Shop und, solange es ihn noch gibt, SER bekommen ihre Daten von hier.
          </p>
        </div>
        {canEdit && ohneInhalt > 0 && (
          <button className="btn btn-secondary" onClick={vorbefuellen} disabled={fuelle}
            title="Füllt nur Artikel ohne Inhalt aus dem Titel; vorhandene Werte bleiben unverändert">
            {fuelle ? 'Fülle…' : `Inhalt aus Titel vorbefüllen (${ohneInhalt} ohne)`}
          </button>
        )}
        <button className="btn btn-secondary" onClick={laden} disabled={laedt}>↻ Neu laden</button>
        {canEdit && stammRecht && <button className="btn btn-secondary" onClick={() => setZeigeLexPreise((v) => !v)}>Preise aus Lexware</button>}
        {canEdit && stammRecht && <button className="btn btn-secondary" onClick={() => setZeigeSer((v) => !v)}>SER-Export</button>}
        {canEdit && stammRecht && <button className="btn btn-primary" onClick={() => setZeigeNeu((v) => !v)}>Neuer Artikel</button>}
      </div>
      {stand && <div className="ui-table-sub" style={{ marginTop: -8 }}>Lexware-Stand: {stand}{ohneInhalt > 0 && <> · <span style={{ color: 'var(--err-fg)' }}>{ohneInhalt} ohne Inhalt</span></>}</div>}

      {fehler && <div className="alert alert-error">✗ {fehler}</div>}
      {hinweis && <div className="alert alert-info">{hinweis}</div>}
      {daten?.lexwareFehler && (
        <div className="alert alert-error">Lexware ist gerade nicht erreichbar ({daten.lexwareFehler}). Die Spalten Lexware, Shop und Preise aus Lexware fehlen, bis die Verbindung wieder da ist.</div>
      )}

      {canEdit && stammRecht && zeigeLexPreise && <PreiseAusLexware onUebernommen={laden} onClose={() => setZeigeLexPreise(false)} />}
      {canEdit && stammRecht && zeigeSer && <SerAbgleich onUebernommen={laden} />}
      {canEdit && stammRecht && zeigeNeu && <ArtikelNeu onClose={() => setZeigeNeu(false)} onAngelegt={(nr) => { setZeigeNeu(false); setHinweis(`Artikel ${nr} angelegt.`); setSuche(nr); laden(); }} />}

      {zus && (zus.unvollstaendig.length > 0 || zus.abweichungen.length > 0 || zus.shop_abweichungen?.length > 0 || (canEdit && zus.shop_ungesetzt?.length > 0)) && (
        <div role="status" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', alignItems: 'center', fontSize: 15, padding: '12px 16px', background: 'var(--warn-bg)', color: 'var(--warn-fg)', borderRadius: 8 }}>
          <b>Zu erledigen</b>
          {zus.unvollstaendig.length > 0 && (
            <button type="button" onClick={() => setKurz('luecke')} style={linkBtn}>
              {zus.unvollstaendig.length === 1 ? `${zus.unvollstaendig[0]} ist für die Fahrer-App noch unvollständig` : `${zus.unvollstaendig.length} Füllungen sind für die Fahrer-App noch unvollständig`}
            </button>
          )}
          {zus.abweichungen.length > 0 && (
            <button type="button" onClick={() => setKurz('abw')} style={linkBtn}>
              {zus.abweichungen.length} {zus.abweichungen.length === 1 ? 'Artikel weicht' : 'Artikel weichen'} von Lexware oder SER ab
            </button>
          )}
          {zus.shop_abweichungen?.length > 0 && (
            <button type="button" onClick={() => setKurz('abw')} style={linkBtn}>
              {zus.shop_abweichungen.length === 1 ? '1 Artikel hat ein anderes Shop-Kennzeichen' : `${zus.shop_abweichungen.length} Artikel haben ein anderes Shop-Kennzeichen`} als in Lexware (der Shop folgt noch dem Präfix)
            </button>
          )}
          {canEdit && zus.shop_ungesetzt?.length > 0 && (
            <button type="button" onClick={shopAusLexware} style={linkBtn} title="Setzt nur Artikel ohne Wert: RG- = sichtbar, NRG- = ausgeblendet. Schreibt nichts nach Lexware oder in den Shop.">
              Shop-Kennzeichen für {zus.shop_ungesetzt.length} Füllungen aus Lexware übernehmen
            </button>
          )}
        </div>
      )}

      <Panel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
          {stammRecht && (
            <div role="group" aria-label="Filter" style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              {FILTER.map(([k, label], i) => (
                <button key={k} type="button" aria-pressed={kurz === k} onClick={() => setKurz(k)}
                  style={{ border: 0, borderLeft: i ? '1px solid var(--border)' : 0, background: kurz === k ? 'var(--text1)' : 'var(--bg1)', color: kurz === k ? 'var(--bg1)' : 'var(--text1)', padding: '9px 14px', font: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer', minHeight: 40 }}>
                  {label}
                </button>
              ))}
            </div>
          )}
          <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text2)' }}>Suchen
            <input type="search" className="form-input" style={{ minWidth: 260, width: 'auto' }} value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Nummer, Name oder UN-Nummer" />
          </label>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 14px', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 14, color: 'var(--text2)' }}>
          {stammRecht && (
            <select className="form-select" style={{ width: 'auto' }} value={typ} onChange={(e) => setTyp(e.target.value)} aria-label="Typ">
              <option value="">Alle Typen</option>
              {Object.entries(TYP_AUSWAHL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          )}
          {stammRecht && (
            <select className="form-select" style={{ width: 'auto' }} value={sparte} onChange={(e) => setSparte(e.target.value)} aria-label="Sparte">
              <option value="">Alle Sparten</option>
              {alleSparten.map((n) => <option key={n} value={n}>{n}</option>)}
              <option value="(ohne)">ohne Sparte</option>
            </select>
          )}
          {stammRecht && (
            <select className="form-select" style={{ width: 'auto' }} value={fehlt} onChange={(e) => setFehlt(e.target.value)} aria-label="Prüffilter">
              <option value="">Prüffilter: keiner</option>
              {LUECKEN.map((l) => <option key={l} value={l}>Füllung ohne {l}</option>)}
            </select>
          )}
          <select className="form-select" style={{ width: 'auto' }} value={einheit} onChange={(e) => setEinheit(e.target.value)} aria-label="Einheit des Inhalts">
            <option value="">Inhalt: alle</option><option value="kg">Inhalt kg</option><option value="L">Inhalt L</option><option value="fehlt">Inhalt fehlt</option>
          </select>
          {alleTags.length > 0 && (
            <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>Tags:
              {alleTags.map((t) => <button key={t} type="button" aria-pressed={tags.includes(t)} onClick={() => toggleTag(t)} style={chip(tags.includes(t))}>{t}</button>)}
            </span>
          )}
          {stammRecht && <label><input type="checkbox" checked={nurAktiv} onChange={(e) => setNurAktiv(e.target.checked)} style={{ accentColor: 'var(--r)' }} /> nur aktive</label>}
          {stammRecht && <label><input type="checkbox" checked={mehrSpalten} onChange={(e) => setMehrSpalten(e.target.checked)} style={{ accentColor: 'var(--r)' }} /> alle Stammspalten</label>}
          {filterAktiv && <button type="button" className="btn btn-secondary btn-sm" onClick={filterZuruecksetzen}>✕ Filter</button>}
          <span className="ui-table-sub" style={{ marginLeft: 'auto' }}>{daten ? `${sichtbar.length} von ${artikel.length}` : ''}</span>
        </div>

        {canEdit && (
          <SelectionBar count={auswahl.size} onClear={() => { setAuswahl(new Set()); setDialog(''); }}>
            <button className="btn" disabled={!lexwareIds.length} onClick={() => setDialog('preis')}>Preise anpassen</button>
            <button className="btn" disabled={!lexwareIds.length} onClick={() => setDialog((d) => (d === 'serpush' ? '' : 'serpush'))}
              title="Lexware-Preise der ausgewählten RG-Artikel per STMUPD an SER senden">Push SER</button>
            {stammRecht && <button className="btn" disabled={ohneStamm > 0 || auswahl.size > 500} onClick={() => shopSetzen(1)} title="Setzt „im Shop sichtbar“ im Artikelstamm">Im Shop zeigen</button>}
            {stammRecht && <button className="btn" disabled={ohneStamm > 0 || auswahl.size > 500} onClick={() => shopSetzen(0)} title="Setzt „im Shop sichtbar“ im Artikelstamm auf nein">Im Shop ausblenden</button>}
            {stammRecht && <button className="btn" disabled={ohneStamm > 0 || auswahl.size > 500} onClick={() => setDialog('bearbeiten')}
              title={ohneStamm > 0 ? 'Artikel nur in Lexware sind nicht im Stamm' : auswahl.size > 500 ? 'Höchstens 500 Artikel gleichzeitig' : undefined}>Felder bearbeiten</button>}
            {ohneLexware > 0 && <span style={{ fontSize: 13, color: '#e8e2d8' }}>{ohneLexware} ohne Lexware-Artikel (kein Preis/Push)</span>}
            {ohneStamm > 0 && <span style={{ fontSize: 13, color: '#e8e2d8' }}>{ohneStamm} nicht im Stamm (kein Bearbeiten)</span>}
          </SelectionBar>
        )}

        {canEdit && dialog === 'preis' && lexwareIds.length > 0 && (
          <div style={{ padding: 14, borderBottom: '1px solid var(--border)' }}>
            <PricePreview key={schluessel} articleIds={lexwareIds} onClose={() => setDialog('')} onApplied={laden} />
          </div>
        )}
        {canEdit && dialog === 'serpush' && lexwareIds.length > 0 && (
          <div style={{ padding: 14, borderBottom: '1px solid var(--border)' }}>
            <SerPush key={schluessel} articleIds={lexwareIds} onClose={() => setDialog('')} />
          </div>
        )}
        {canEdit && stammRecht && dialog === 'bearbeiten' && gewaehlt.length > 0 && ohneStamm === 0 && (
          <div style={{ padding: 14, borderBottom: '1px solid var(--border)' }}>
            <ArtikelBearbeiten key={gewaehlt.map((a) => a.artikel_nr).join(',')} gewaehlt={gewaehlt} alle={artikel} onClose={() => setDialog('')} onFertig={nachBearbeiten} />
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table className="ui-table">
            <thead>
              <tr>
                {canEdit && <th style={{ width: 36 }}><input type="checkbox" aria-label="Alle sichtbaren auswählen" checked={alleSichtbarGewaehlt} onChange={alleUmschalten} style={cb} /></th>}
                <th>Nr.</th><th>Bezeichnung</th><th>Typ</th>{stammRecht && <><th>Sparte</th><th>Einheit</th></>}<th>ADR</th>
                <th className="r">Preis netto</th><th>Inhalt</th><th className="r">je kg/L</th>
                {mehrSpalten && <><th>Tags</th><th>ADR-Benennung</th><th>Kat.</th><th className="r">kg</th><th className="r">Menge</th><th className="r">MwSt.</th><th>Pfand</th><th>Kaufflasche</th></>}
                <th>Shop</th><th>Lexware</th>{stammRecht && <><th>SER</th><th>Fahrer-App</th></>}
              </tr>
            </thead>
            <tbody>
              {sichtbar.map((a) => {
                const inhalt = a.lexware?.inhalt;
                const jeEinheit = inhalt && a.preis_netto_cent != null ? a.preis_netto_cent / inhalt.value : null;
                return (
                  <tr key={a.artikel_nr} className={auswahl.has(a.artikel_nr) ? 'is-selected' : undefined} style={{ opacity: a.aktiv === false ? 0.6 : 1 }}>
                    {canEdit && <td><input type="checkbox" aria-label={`${a.artikel_nr} auswählen`} checked={auswahl.has(a.artikel_nr)} onChange={() => umschalten(a.artikel_nr)} style={cb} /></td>}
                    <td style={{ fontWeight: 700 }}>{a.artikel_nr}{a.lexware?.nummer && <div className="ui-table-sub" title="Artikelnummer in Lexware">{a.lexware.nummer}</div>}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <GasCylinder gasart={a.gasart} typ={a.typ} />
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <Link to={`/gashandel/artikel/${encodeURIComponent(a.artikel_nr)}`} style={{ fontWeight: 600, color: 'var(--text1)', textDecoration: 'none' }}>{a.bezeichnung}{a.aktiv === false && ' (inaktiv)'}</Link>
                          <span className="ui-table-sub">
                            {a.luecken.length > 0 ? `Es fehlen: ${a.luecken.join(', ')}`
                              : a.pfand_artikel_nr ? `Pfand ${a.pfand_artikel_nr}` : (a.lexware?.tags || []).join(', ')}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>{TYPEN[a.typ] || '–'}</td>
                    {stammRecht && <><td>{a.sparte || '–'}</td><td>{a.einheit || '–'}</td></>}
                    <td className="ui-table-sub">{a.un_nr ? `UN ${a.un_nr}${a.gefahrklasse ? `, ${a.gefahrklasse}` : ''}` : (a.typ === 'F' ? 'fehlt' : '–')}</td>
                    <td className="r">{eur(a.preis_netto_cent)}</td>
                    <td><InhaltZelle lexware={a.lexware} canEdit={canEdit} onSaved={inhaltGespeichert} /></td>
                    <td className="r">{jeEinheit != null ? `${eur(jeEinheit)}/${inhalt.unit}` : '–'}</td>
                    {mehrSpalten && <>
                      <td className="ui-table-sub">{(a.lexware?.tags || []).join(', ') || '–'}</td>
                      <td className="ui-table-sub" style={{ minWidth: 200 }}>{a.bezadr || '–'}</td>
                      <td>{a.befoerderungskategorie || '–'}{a.ggvs_faktor && !a.befoerderungskategorie ? ` (×${a.ggvs_faktor})` : ''}</td>
                      <td className="r">{zahl(a.fuellgewicht_kg)}</td>
                      <td className="r">{a.fuellmenge == null ? '–' : `${zahl(a.fuellmenge)} ${a.fuellmenge_einheit || '?'}`}</td>
                      <td className="r">{a.mwst_satz == null ? '–' : `${zahl(a.mwst_satz)} %`}</td>
                      <td>{a.pfand_artikel_nr || '–'}</td>
                      <td>{a.kaufflasche_artikel_nr || '–'}</td>
                    </>}
                    <td>
                      {stammRecht && a.im_stamm
                        ? <>
                            <Tag tone={a.shop_status === 'sichtbar' ? 'ok' : a.shop_status === 'nicht gesetzt' ? 'warn' : 'mute'}>{a.shop_status}</Tag>
                            {a.shop_abweichend && <div className="ui-table-sub" title="Der Shop folgt heute noch dem Lexware-Präfix, nicht dem Schalter im Portal">Lexware: {a.lexware.shop}</div>}
                          </>
                        : (a.lexware ? <Tag tone={a.lexware.shop === 'sichtbar' ? 'ok' : 'mute'}>{a.lexware.shop}</Tag> : '–')}
                    </td>
                    <td><Status text={a.lexware_status} ton={lexTon} /></td>
                    {stammRecht && <>
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
                <tr><td colSpan={spalten} style={{ textAlign: 'center', color: 'var(--text3)', padding: 28 }}>{artikel.length ? 'Keine Artikel für diesen Filter.' : 'Keine Artikel vorhanden.'}</td></tr>
              )}
              {laedt && <tr><td colSpan={spalten} style={{ textAlign: 'center', color: 'var(--text3)', padding: 28 }}>Lade Artikel…</td></tr>}
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
const chip = (on) => ({ padding: '3px 10px', borderRadius: 999, fontSize: 13, cursor: 'pointer', border: '1px solid ' + (on ? 'var(--r)' : 'var(--border)'), background: on ? 'var(--err-bg)' : 'var(--bg1)', color: on ? 'var(--err-fg)' : 'var(--text2)', font: 'inherit' });
