import { useState, useMemo } from 'react';
import { GASARTEN, EK_GRUPPEN } from './artikelFelder';

const aktivText = { 1: 'aktiv', 0: 'inaktiv' };

// Startwert eines Feldes als Text für das Formular
const startwert = (artikel, feld) => {
  if (feld === 'aktiv') return artikel.aktiv ? '1' : '0';
  if (feld === 'ggvs_faktor') return artikel.ggvs_faktor != null ? String(artikel.ggvs_faktor) : '';
  const v = artikel[feld];
  return v == null ? '' : String(v);
};

/**
 * Formular für einige Felder eines Artikels. Gespeichert werden nur geänderte Felder (POST /artikelstamm/aendern).
 * Leeres Feld = Wert löschen. felder: Einträge aus artikelFelder.js. alle: komplette Liste (für Pfand und Kaufflasche).
 */
export default function FeldFormular({ artikel, felder, alle, canEdit, onGespeichert }) {
  const start = useMemo(() => Object.fromEntries(felder.map(([f]) => [f, startwert(artikel, f)])), [artikel, felder]);
  const [eingabe, setEingabe] = useState(start);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState('');
  const [meldung, setMeldung] = useState('');

  const geaendert = felder.filter(([f]) => eingabe[f] !== start[f]).map(([f]) => f);
  const pfandListe = useMemo(() => alle.filter((a) => a.typ === 'P' && a.aktiv), [alle]);
  const kaufListe = useMemo(() => alle.filter((a) => a.typ === 'S' && a.aktiv), [alle]);

  const speichern = async () => {
    const werte = Object.fromEntries(geaendert.map((f) => [f, eingabe[f]]));
    setBusy(true); setFehler(''); setMeldung('');
    try {
      const r = await fetch('/api/finance/artikelstamm/aendern', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nummern: [artikel.artikel_nr], werte }) });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Fehler ' + r.status);
      setMeldung('Gespeichert.');
      onGespeichert();
    } catch (e) { setFehler(e.message); }
    finally { setBusy(false); }
  };

  const feld = ([f, label, typ, hinweis]) => {
    const wert = eingabe[f];
    const set = (v) => setEingabe((e) => ({ ...e, [f]: v }));
    const fehltWert = wert === '' && ['un_nr', 'gefahrklasse', 'ggvs_faktor', 'fuellgewicht_kg', 'pfand_artikel_nr'].includes(f);
    const cls = `form-select${fehltWert ? ' ui-miss' : ''}`;
    let eingabeFeld;
    if (!canEdit) eingabeFeld = <b>{wert === '' ? '–' : (f === 'aktiv' ? aktivText[wert] : wert)}</b>;
    else if (typ === 'pfand' || typ === 'kauf') {
      eingabeFeld = (
        <select id={`f-${f}`} className={cls} value={wert} onChange={(e) => set(e.target.value)}>
          <option value="">– keiner –</option>
          {(typ === 'kauf' ? kaufListe : pfandListe).map((p) => <option key={p.artikel_nr} value={p.artikel_nr}>{p.artikel_nr} {p.bezeichnung}</option>)}
        </select>
      );
    } else if (typ === 'gasart') {
      eingabeFeld = (
        <select id={`f-${f}`} className={cls} value={wert} onChange={(e) => set(e.target.value)}>
          <option value="">– nicht gesetzt –</option>
          {GASARTEN.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      );
    } else if (typ === 'ekgruppe') {
      eingabeFeld = (
        <select id={`f-${f}`} className={cls} value={wert} onChange={(e) => set(e.target.value)}>
          <option value="">keine</option>
          {Object.entries(EK_GRUPPEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      );
    } else if (typ.startsWith('select:')) {
      eingabeFeld = (
        <select id={`f-${f}`} className={cls} value={wert} onChange={(e) => set(e.target.value)}>
          <option value="">{f === 'aktiv' ? '' : '–'}</option>
          {typ.slice(7).split(',').map((v) => <option key={v} value={v}>{f === 'aktiv' ? aktivText[v] : f === 'ggvs_faktor' ? `${{ 50: 1, 3: 2, 1: 3 }[v]} (Faktor ${v})` : v}</option>)}
        </select>
      );
    } else {
      eingabeFeld = <input id={`f-${f}`} className={`form-input${fehltWert ? ' ui-miss' : ''}`} value={wert} onChange={(e) => set(e.target.value)} />;
    }
    return (
      <div className="ui-feld" key={f}>
        <label htmlFor={`f-${f}`}>{label}</label>
        <div>{eingabeFeld}</div>
        <span className="ui-table-sub">{fehltWert ? 'fehlt' : hinweis}</span>
      </div>
    );
  };

  return (
    <div>
      {felder.map(feld)}
      {canEdit && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 14 }}>
          <button className="btn btn-primary" disabled={busy || !geaendert.length} onClick={speichern}>{busy ? 'Speichere…' : 'Speichern'}</button>
          {geaendert.length > 0 && <span className="ui-table-sub">{geaendert.length} {geaendert.length === 1 ? 'Änderung' : 'Änderungen'}</span>}
          {fehler && <span style={{ color: 'var(--err-fg)' }}>✗ {fehler}</span>}
          {meldung && !geaendert.length && <span style={{ color: 'var(--ok-fg)' }}>✓ {meldung}</span>}
        </div>
      )}
    </div>
  );
}
