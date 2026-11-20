import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { Panel, Tabs, Tag, GasCylinder } from '../../ui';
import FeldFormular from './artikel/FeldFormular';
import PreisTab from './artikel/PreisTab';
import LexwareAnlegen from './artikel/LexwareAnlegen';
import EinkaufTab from './artikel/EinkaufTab';
import VerlaufTab from './artikel/VerlaufTab';
import { FELD } from './artikel/artikelFelder';

// #606 Artikel (Detail): alle Angaben eines Artikels in Reitern. Teil 3 von 4.
// Stammdaten, Flaschen, ADR und Gewicht, Preis (mit Preisprotokoll), Einkauf (nur gashandel.auswertung), Verlauf.

const TYPEN = { F: 'Füllung', P: 'Pfand / Leergut', S: 'Kaufflasche (Steuer/Nutzung)', V: 'Provision', Z: 'Zubehör', D: 'Dienstleistung / Versand' };

// Gasart gibt es nur bei Füllungen (eine Kappe hat keine)
const felderStamm = (typ) => [FELD.bezeichnung, FELD.typ, ...(typ === 'F' ? [FELD.gasart] : []), FELD.mwst_satz, FELD.shop_sichtbar, FELD.aktiv];
const FELDER_FLASCHEN = [FELD.pfand_artikel_nr, FELD.kaufflasche_artikel_nr];
const FELDER_ADR = [FELD.un_nr, FELD.gefahrklasse, FELD.bezadr, FELD.ggvs_faktor, FELD.fuellgewicht_kg, FELD.fuellmenge, FELD.fuellmenge_einheit];

const Haken = ({ ok }) => (ok === 'ok'
  ? <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10.5l4 4 8-9" fill="none" stroke="var(--ok-fg)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
  : <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7" fill="none" stroke="var(--warn-fg)" strokeWidth="2.2" /><path d="M10 6.5v4" stroke="var(--warn-fg)" strokeWidth="2.2" strokeLinecap="round" /><circle cx="10" cy="13.5" r="1.2" fill="var(--warn-fg)" /></svg>);

export default function ArtikelDetail() {
  const { nr } = useParams();
  const { hasArea } = useAuth();
  const canEdit = hasArea('gashandel.preise');
  const zeigeEinkauf = hasArea('gashandel.auswertung');

  const [daten, setDaten] = useState(null);
  const [fehler, setFehler] = useState('');
  const [params] = useSearchParams();
  const [tab, setTab] = useState(() => (['stamm', 'flaschen', 'adr', 'preis', 'einkauf', 'verlauf'].includes(params.get('reiter')) ? params.get('reiter') : 'stamm'));
  const [zeigeAnlegen, setZeigeAnlegen] = useState(false);
  const [stand, setStand] = useState(0);   // zählt hoch, wenn etwas gespeichert wurde (Verlauf neu laden)

  const laden = useCallback(async () => {
    try {
      const r = await fetch('/api/finance/artikelliste');
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Fehler ' + r.status);
      setDaten(d); setStand((s) => s + 1);
    } catch (e) { setFehler(e.message); }
  }, []);
  useEffect(() => { laden(); }, [laden]);

  const artikel = daten?.artikel.find((a) => a.artikel_nr === nr);
  const stammRecht = !!daten?.rechte.stamm;

  const aktivieren = async () => {
    try {
      const r = await fetch('/api/finance/artikelstamm/aendern', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nummern: [nr], werte: { aktiv: 1 } }) });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Fehler ' + r.status);
      laden();
    } catch (e) { setFehler(e.message); }
  };

  if (fehler && !daten) return <div className="alert alert-error">✗ {fehler}</div>;
  if (!daten) return <div style={{ color: 'var(--text3)', padding: 24 }}>Lade Artikel…</div>;
  if (!artikel) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Link to="/gashandel/artikel/liste">Zurück zur Artikelliste</Link>
      <div className="alert alert-error">Artikel {nr} gibt es weder im Stamm noch in Lexware.</div>
    </div>
  );

  const imStamm = artikel.im_stamm;
  const tabs = [
    { id: 'stamm', label: 'Stammdaten' }, { id: 'flaschen', label: 'Flaschen' }, { id: 'adr', label: 'ADR und Gewicht' },
    { id: 'preis', label: 'Preis' }, ...(zeigeEinkauf && stammRecht ? [{ id: 'einkauf', label: 'Einkauf' }] : []),
    ...(stammRecht ? [{ id: 'verlauf', label: 'Verlauf' }] : []),
  ];
  // Ein Reiter aus dem Link, den es für dieses Konto nicht gibt (z. B. Einkauf ohne Auswertungs-Recht), fällt auf Stammdaten zurück
  if (!tabs.some((t) => t.id === tab)) setTab('stamm');
  const formular = (felder, key) => (
    <FeldFormular key={`${key}-${stand}`} artikel={artikel} felder={felder} alle={daten.artikel} canEdit={canEdit && imStamm} onGespeichert={laden} />
  );
  const kannAktivieren = canEdit && imStamm && !artikel.aktiv;
  const kannInLexwareAnlegen = canEdit && stammRecht && imStamm && !artikel.lexware;

  return (
    <div style={{ maxWidth: 1400, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Link to="/gashandel/artikel/liste" style={{ alignSelf: 'flex-start', fontSize: 15, color: 'var(--link)' }}>Zurück zur Artikelliste</Link>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginRight: 'auto' }}>
          <GasCylinder gasart={artikel.gasart} typ={artikel.typ} size="gross" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <h1 className="page-title" style={{ fontSize: 52, lineHeight: 0.9 }}>{artikel.artikel_nr}</h1>
            <span style={{ fontSize: 16, color: 'var(--text2)' }}>{artikel.bezeichnung} {artikel.typ && <Tag>{TYPEN[artikel.typ]}</Tag>} {artikel.aktiv === false && <Tag tone="warn">inaktiv</Tag>}</span>
          </div>
        </div>
        {stammRecht && imStamm && <button className="btn btn-secondary" onClick={() => setTab('verlauf')}>Änderungsverlauf</button>}
        {kannInLexwareAnlegen && <button className="btn btn-secondary" onClick={() => setZeigeAnlegen((v) => !v)} title="Legt diesen Artikel in Lexware an">In Lexware anlegen</button>}
        {kannAktivieren && (
          <button className="btn btn-primary" disabled={artikel.luecken.length > 0} onClick={aktivieren}
            title={artikel.luecken.length ? `Erst ergänzen: ${artikel.luecken.join(', ')}` : 'Artikel geht an die Fahrer-App'}>Für Fahrer-App aktivieren</button>
        )}
      </div>

      {fehler && <div className="alert alert-error">✗ {fehler}</div>}
      {zeigeAnlegen && kannInLexwareAnlegen && <LexwareAnlegen nummern={[artikel.artikel_nr]} onClose={() => setZeigeAnlegen(false)} onFertig={laden} />}
      {!stammRecht && <div className="alert alert-info">Stammdaten, SER und Fahrer-App sehen nur Personen mit dem Recht „Preise“. Hier steht, was Lexware zum Artikel weiß.</div>}
      {stammRecht && !imStamm && <div className="alert alert-info">Dieser Artikel steht nur in Lexware, noch nicht im Artikelstamm. In der Artikelliste über „Neuer Artikel“ mit der Nummer {nr} anlegen, danach lässt er sich hier bearbeiten.</div>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        <Panel className="" style={{ flex: '999 1 560px' }}>
          <Tabs items={tabs} value={tab} onChange={setTab} label="Artikel" />
          <div style={{ padding: '6px 20px 20px' }}>
            {tab === 'stamm' && (
              <>
                <div className="ui-feld"><span>Artikelnummer</span><b style={{ fontSize: 17 }}>{artikel.artikel_nr}</b><span className="ui-table-sub">Schlüssel, entspricht SER, ohne Präfix</span></div>
                <div className="ui-feld"><span>Lexware-Kennzeichen</span><span>{artikel.lexware ? <><Tag tone={artikel.lexware.shop === 'sichtbar' ? 'ok' : 'mute'}>{artikel.lexware.nummer.split('-')[0]}-</Tag>{artikel.shop_abweichend && <> <Tag tone="warn">weicht vom Portal ab</Tag></>}</> : '–'}</span><span className="ui-table-sub">Der Shop folgt heute noch diesem Präfix, nicht dem Schalter unten.</span></div>
                <div className="ui-feld"><span>Sparte</span><b>{artikel.sparte || '–'}</b><span className="ui-table-sub">aus dem Lexware-Präfix (RG, PFAND, GZ = Gashandel)</span></div>
                <div className="ui-feld"><span>Einheit</span><b>{artikel.einheit || '–'}</b><span className="ui-table-sub">wie in Lexware</span></div>
                {imStamm ? formular(felderStamm(artikel.typ), 'stamm-' + artikel.typ) : <div className="ui-feld"><span>Bezeichnung</span><span>{artikel.bezeichnung}</span><span className="ui-table-sub">aus Lexware</span></div>}
              </>
            )}
            {tab === 'flaschen' && (
              <>
                <p className="ui-table-sub" style={{ margin: '14px 0' }}>Eine Füllung hat <b>entweder</b> eine Pfandflasche (das Leergut kommt zurück) <b>oder</b> eine Kaufflasche (die Flasche wird mitverkauft), nie beides. Aus dem Bezug weiß die Fahrer-App, welches Leergut zurückkommt, und der Shop blendet Pfand aus.</p>
                {!imStamm ? <p>Nur für Artikel im Stamm.</p>
                  : artikel.typ !== 'F' ? <p style={{ margin: '14px 0' }}>Pfand- und Kaufflaschen gibt es nur bei Füllungen. Dieser Artikel ist keine Füllung (Typ ändern im Reiter Stammdaten).</p>
                  : formular(FELDER_FLASCHEN, 'flaschen')}
              </>
            )}
            {tab === 'adr' && (imStamm ? formular(FELDER_ADR, 'adr') : <p style={{ margin: '14px 0' }}>Nur für Artikel im Stamm.</p>)}
            {tab === 'preis' && <PreisTab artikel={artikel} canEdit={canEdit} onGeaendert={laden} />}
            {tab === 'einkauf' && zeigeEinkauf && <EinkaufTab artikel={artikel} alle={daten.artikel} canEditArtikel={canEdit && imStamm} onGeaendert={laden} />}
            {tab === 'verlauf' && stammRecht && <VerlaufTab nr={nr} aktualisiert={stand} />}
          </div>
        </Panel>

        <aside style={{ flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Panel>
            <div style={{ padding: 18 }}>
              <h2 className="ui-panel-title" style={{ marginBottom: 12 }}>Wo {artikel.artikel_nr} schon läuft</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {artikel.laeuft.map((p) => (
                  <div key={p.stelle} style={{ display: 'grid', gridTemplateColumns: '22px minmax(0, 1fr)', gap: 8, alignItems: 'start', fontSize: 15 }}>
                    <Haken ok={p.ok} /><span><b>{p.stelle}:</b> {p.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </Panel>
          {artikel.luecken.length > 0 && (
            <Panel>
              <div style={{ padding: 18 }}>
                <h2 className="ui-panel-title" style={{ marginBottom: 10 }}>Vor dem Aktivieren</h2>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 15, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {artikel.luecken.map((l) => <li key={l}>{l}</li>)}
                </ul>
                <p className="ui-table-sub" style={{ margin: '12px 0 0' }}>Für SER und Bestellungen ist davon nichts nötig.</p>
              </div>
            </Panel>
          )}
        </aside>
      </div>
    </div>
  );
}
