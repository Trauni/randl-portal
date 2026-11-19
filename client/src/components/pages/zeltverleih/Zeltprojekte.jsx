// client/src/components/pages/zeltverleih/Zeltprojekte.jsx
// Zeltprojekte aus Rentman mit Zeitraumfilter und aufklappbarer Materialliste (#461).
// Nur lesend. Zeitraum-Filter wirkt auf den Planzeitraum inkl. Auf-/Abbau.

import React, { useEffect, useState, useCallback } from 'react';

const heute = () => new Date().toISOString().slice(0, 10);
const plusTage = (iso, n) => {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const dat = (iso) => iso ? new Date(iso).toLocaleDateString('de-DE',
  { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';

const karte = {
  background: 'var(--bg1)', border: '1px solid var(--border)',
  borderRadius: '9px', padding: '16px 18px',
};
const ueberschrift = {
  fontSize: '11px', fontWeight: 700, color: 'var(--text3)',
  textTransform: 'uppercase', letterSpacing: '0.08em',
};
const eingabe = {
  background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '6px',
  color: 'var(--text1)', padding: '6px 8px', fontSize: '13px',
};
const knopf = (aktiv) => ({
  background: aktiv ? 'var(--r)' : 'var(--bg2)', color: aktiv ? '#fff' : 'var(--text2)',
  border: '1px solid ' + (aktiv ? 'var(--r)' : 'var(--border)'), borderRadius: '14px',
  padding: '4px 11px', fontSize: '12px', cursor: 'pointer',
});

const BELEGUNG = {
  fest:       { text: 'fest',      farbe: 'var(--green)' },
  vorlaeufig: { text: 'vorläufig', farbe: 'var(--amber)' },
  annulliert: { text: 'annulliert', farbe: 'var(--text3)' },
};

const SCHNELLWAHL = [
  { label: 'Ab heute',   von: () => heute(), bis: () => '' },
  { label: '30 Tage',    von: () => heute(), bis: () => plusTage(heute(), 30) },
  { label: '90 Tage',    von: () => heute(), bis: () => plusTage(heute(), 90) },
  { label: 'Alle',       von: () => '',      bis: () => '' },
];

const tag10 = (iso) => (iso ? String(iso).slice(0, 10) : '');
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August',
  'September', 'Oktober', 'November', 'Dezember'];
const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

// Sortierbare Spalten. Mietbeginn = 1. Tag des Mietzeitraums (ohne Aufbau).
const SORT_SPALTEN = [
  { key: 'miete', label: 'Mietbeginn', wert: (p) => tag10(p.von) || tag10(p.planVon) },
  { key: 'plan',  label: 'Aufbau ab',  wert: (p) => tag10(p.planVon) || tag10(p.von) },
  { key: 'name',  label: 'Name',       wert: (p) => (p.projektName || p.name || '').toLowerCase() },
  { key: 'typ',   label: 'Typ',        wert: (p) => (p.typ || '').toLowerCase() },
  { key: 'status', label: 'Status',    wert: (p) => (p.status || '').toLowerCase() },
  { key: 'pos',   label: 'Positionen', wert: (p) => p.materialAnzahl || 0 },
];

function sortiere(liste, { key, richtung }) {
  const spalte = SORT_SPALTEN.find((c) => c.key === key) || SORT_SPALTEN[0];
  const f = richtung === 'ab' ? -1 : 1;
  return [...liste].sort((a, b) => {
    const wa = spalte.wert(a), wb = spalte.wert(b);
    // Eintraege ohne Wert immer ans Ende, egal in welche Richtung
    if (wa === '' && wb !== '') return 1;
    if (wb === '' && wa !== '') return -1;
    if (wa < wb) return -1 * f;
    if (wa > wb) return 1 * f;
    return tag10(a.von).localeCompare(tag10(b.von)) || (a.id - b.id);
  });
}

// Monatskalender: zeigt pro Tag, wie viele der geladenen Projekte laufen
// (Aufbau bis Abbau). Klick auf einen Tag filtert die Liste auf diesen Tag.
function Kalender({ projekte, monat, setMonat, tag, setTag, von, bis }) {
  const [jahr, m] = monat;
  const erster = new Date(jahr, m, 1);
  const versatz = (erster.getDay() + 6) % 7;            // Montag = 0
  const tageImMonat = new Date(jahr, m + 1, 0).getDate();
  const iso = (d) => `${jahr}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const hSchritt = (n) => { const d = new Date(jahr, m + n, 1); setMonat([d.getFullYear(), d.getMonth()]); };
  const jetzt = heute();

  const proTag = (tagIso) => projekte.filter((p) => {
    const a = tag10(p.planVon) || tag10(p.von);
    const e = tag10(p.planBis) || tag10(p.bis) || a;
    return a && a <= tagIso && tagIso <= e;
  });

  const zellen = [];
  for (let i = 0; i < versatz; i++) zellen.push(null);
  for (let d = 1; d <= tageImMonat; d++) zellen.push(d);

  return (
    <div style={{ width: '252px', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        <button type="button" style={knopf(false)} onClick={() => hSchritt(-1)} aria-label="Vormonat">‹</button>
        <button type="button" onClick={() => setMonat([new Date().getFullYear(), new Date().getMonth()])}
          style={{ background: 'none', border: 'none', color: 'var(--text1)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
          title="Zum aktuellen Monat">{MONATE[m]} {jahr}</button>
        <button type="button" style={knopf(false)} onClick={() => hSchritt(1)} aria-label="Folgemonat">›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', textAlign: 'center' }}>
        {WOCHENTAGE.map((w) => (
          <div key={w} style={{ fontSize: '10px', color: 'var(--text3)', padding: '2px 0' }}>{w}</div>
        ))}
        {zellen.map((d, i) => {
          if (!d) return <div key={'l' + i} />;
          const t = iso(d);
          const liste = proTag(t);
          const gewaehlt = tag === t;
          const imZeitraum = (!von || t >= von) && (!bis || t <= bis);
          return (
            <button key={t} type="button" onClick={() => setTag(gewaehlt ? null : t)}
              title={liste.length ? liste.map((p) => p.projektName || p.name).join('\n') : undefined}
              style={{
                position: 'relative', height: '32px', fontSize: '12px', cursor: 'pointer',
                borderRadius: '5px', padding: 0, fontVariantNumeric: 'tabular-nums',
                background: gewaehlt ? 'var(--r)' : liste.length ? 'var(--bg3, var(--bg2))' : 'transparent',
                color: gewaehlt ? '#fff' : imZeitraum ? 'var(--text1)' : 'var(--text3)',
                opacity: imZeitraum ? 1 : 0.55,
                border: '1px solid ' + (t === jetzt ? 'var(--r)' : 'transparent'),
              }}>
              {d}
              {liste.length > 0 && (
                <span style={{
                  position: 'absolute', right: '2px', bottom: '1px', fontSize: '9px', fontWeight: 700,
                  color: gewaehlt ? '#fff' : 'var(--amber)',
                }}>{liste.length}</span>
              )}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: '10.5px', color: 'var(--text3)', marginTop: '6px' }}>
        Zahl = laufende Projekte inkl. Auf-/Abbau. Tag anklicken zum Filtern.
        {tag && <> <button type="button" onClick={() => setTag(null)}
          style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', fontSize: '10.5px', padding: 0 }}>Tagesfilter aufheben</button></>}
      </div>
    </div>
  );
}

function Materialliste({ projektId }) {
  const [daten, setDaten] = useState(null);
  const [fehler, setFehler] = useState(null);

  useEffect(() => {
    let ab = false;
    fetch(`/api/zeltverleih/projekte/${projektId}/material`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); return j; })
      .then((j) => { if (!ab) setDaten(j.material); })
      .catch((e) => { if (!ab) setFehler(e.message); });
    return () => { ab = true; };
  }, [projektId]);

  if (fehler) return <div style={{ fontSize: '12.5px', color: 'var(--red2)', padding: '8px 0' }}>{fehler}</div>;
  if (!daten) return <div style={{ fontSize: '12.5px', color: 'var(--text3)', padding: '8px 0' }}>Material lädt…</div>;
  if (daten.length === 0) return <div style={{ fontSize: '12.5px', color: 'var(--text3)', padding: '8px 0' }}>Kein Material eingeplant.</div>;

  // Nach Gruppe buendeln, Reihenfolge aus dem Backend beibehalten
  const gruppen = [];
  for (const z of daten) {
    let g = gruppen.find((x) => x.name === z.gruppe);
    if (!g) { g = { name: z.gruppe, zeilen: [] }; gruppen.push(g); }
    g.zeilen.push(z);
  }

  return (
    <div style={{ padding: '6px 0 4px 18px' }}>
      {gruppen.map((g) => (
        <div key={g.name} style={{ marginBottom: '8px' }}>
          <div style={{ ...ueberschrift, fontSize: '10.5px', margin: '6px 0 4px' }}>{g.name || 'Ohne Gruppe'}</div>
          {g.zeilen.map((z) => (
            <div key={z.id} style={{
              display: 'flex', gap: '10px', alignItems: 'baseline', fontSize: '12.5px',
              padding: '2px 0', paddingLeft: z.parentId ? '16px' : 0,
              color: z.parentId ? 'var(--text2)' : 'var(--text1)',
            }}>
              <span style={{ width: '42px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', flexShrink: 0, fontWeight: 600 }}>
                {z.anzahl}×
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                {z.name}
                {z.option && <span style={{ marginLeft: '6px', fontSize: '10.5px', color: 'var(--amber)' }}>Option</span>}
              </span>
              {z.ordner && <span style={{ fontSize: '11px', color: 'var(--text3)', whiteSpace: 'nowrap' }}>{z.ordner}</span>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function Zeltprojekte() {
  const [von, setVon] = useState(heute());
  const [bis, setBis] = useState('');
  const [typen, setTypen] = useState([]);          // alle Projekttypen aus Rentman
  const [gewaehlt, setGewaehlt] = useState(null);  // gewaehlte Typ-IDs, null = Standard (Zelttypen)
  const [vorlaeufige, setVorlaeufige] = useState(true);
  const [annullierte, setAnnullierte] = useState(false);
  const [daten, setDaten] = useState(null);
  const [fehler, setFehler] = useState(null);
  const [offen, setOffen] = useState(() => new Set());
  const [sort, setSort] = useState({ key: 'miete', richtung: 'auf' });
  const [tag, setTag] = useState(null);                  // Tagesfilter aus dem Kalender
  const [monat, setMonat] = useState(() => {
    const d = new Date(heute() + 'T12:00:00');
    return [d.getFullYear(), d.getMonth()];
  });

  useEffect(() => {
    fetch('/api/zeltverleih/projekte/typen')
      .then((r) => r.ok ? r.json() : { typen: [] })
      .then((j) => {
        setTypen(j.typen || []);
        setGewaehlt((g) => g ?? (j.typen || []).filter((t) => t.zelt).map((t) => t.id));
      })
      .catch(() => {});
  }, []);

  const laden = useCallback(() => {
    if (von && bis && von > bis) { setFehler('„Von“ liegt nach „Bis“.'); return; }
    const q = new URLSearchParams();
    if (von) q.set('von', von);
    if (bis) q.set('bis', bis);
    if (gewaehlt && gewaehlt.length) q.set('typen', gewaehlt.join(','));
    if (annullierte) q.set('annulliert', '1');
    setFehler(null);
    setDaten(null);
    fetch('/api/zeltverleih/projekte?' + q)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); return j; })
      .then(setDaten)
      .catch((e) => setFehler(e.message));
  }, [von, bis, gewaehlt, annullierte]);

  useEffect(() => { laden(); }, [laden]);

  const umschalten = (id) => setOffen((s) => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const typUmschalten = (id) => setGewaehlt((g) => {
    const liste = g || [];
    const neu = liste.includes(id) ? liste.filter((x) => x !== id) : [...liste, id];
    return neu.length ? neu : liste;   // mindestens ein Typ bleibt gewaehlt
  });

  const sortWechsel = (key) => setSort((s0) => ({
    key, richtung: s0.key === key && s0.richtung === 'auf' ? 'ab' : 'auf',
  }));

  const sichtbar = (daten?.projekte || []).filter((p) => vorlaeufige || p.belegung !== 'vorlaeufig');
  const imTag = (p) => {
    const a = tag10(p.planVon) || tag10(p.von);
    const e = tag10(p.planBis) || tag10(p.bis) || a;
    return a && a <= tag && tag <= e;
  };
  const projekte = sortiere(tag ? sichtbar.filter(imTag) : sichtbar, sort);
  const anzahlFest = projekte.filter((p) => p.belegung === 'fest').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '1100px' }}>
      <div>
        <h1 style={{ fontSize: '20px', margin: 0, color: 'var(--text1)' }}>Zeltprojekte</h1>
        <div style={{ fontSize: '12.5px', color: 'var(--text3)', marginTop: '4px' }}>
          Aus Rentman, nur lesend. Der Zeitraum gilt inklusive Auf- und Abbau. Daten bis zu 10 Minuten alt.
        </div>
      </div>

      <div style={{ ...karte, display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'flex-start', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: '1 1 380px', minWidth: 0 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: 'var(--text3)' }}>
            Von
            <input type="date" value={von} onChange={(e) => setVon(e.target.value)} style={eingabe} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: 'var(--text3)' }}>
            Bis
            <input type="date" value={bis} onChange={(e) => setBis(e.target.value)} style={eingabe} />
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {SCHNELLWAHL.map((s) => {
              const aktiv = von === s.von() && bis === s.bis();
              return <button key={s.label} type="button" style={knopf(aktiv)}
                onClick={() => { setVon(s.von()); setBis(s.bis()); }}>{s.label}</button>;
            })}
          </div>
        </div>

        {typen.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--text3)', marginRight: '4px' }}>Projekttyp</span>
            {typen.map((t) => (
              <button key={t.id} type="button" style={knopf((gewaehlt || []).includes(t.id))}
                onClick={() => typUmschalten(t.id)}>{t.name}</button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '12.5px', color: 'var(--text2)' }}>
          <label style={{ display: 'flex', gap: '6px', alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={vorlaeufige} onChange={(e) => setVorlaeufige(e.target.checked)} />
            Vorläufige zeigen (Option, Anfrage, Konzept)
          </label>
          <label style={{ display: 'flex', gap: '6px', alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={annullierte} onChange={(e) => setAnnullierte(e.target.checked)} />
            Annullierte zeigen
          </label>
        </div>
      </div>
      <Kalender projekte={sichtbar} monat={monat} setMonat={setMonat} tag={tag} setTag={setTag} von={von} bis={bis} />
      </div>

      <div style={karte}>
        <div style={{ ...ueberschrift, marginBottom: '10px' }}>
          {daten ? `${projekte.length} Projekte · ${anzahlFest} fest` : 'Projekte'}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text3)', marginRight: '4px' }}>Sortieren</span>
          {SORT_SPALTEN.map((c) => {
            const aktiv = sort.key === c.key;
            return (
              <button key={c.key} type="button" style={knopf(aktiv)} onClick={() => sortWechsel(c.key)}
                aria-sort={aktiv ? (sort.richtung === 'auf' ? 'ascending' : 'descending') : 'none'}>
                {c.label}{aktiv ? (sort.richtung === 'auf' ? ' ▲' : ' ▼') : ''}
              </button>
            );
          })}
          {tag && <span style={{ fontSize: '12px', color: 'var(--amber)', marginLeft: '6px' }}>Nur Tag {dat(tag)}</span>}
        </div>
        {fehler && <div style={{ fontSize: '13px', color: 'var(--red2)' }}>{fehler}</div>}
        {!daten && !fehler && <div style={{ fontSize: '13px', color: 'var(--text3)' }}>lädt…</div>}
        {daten && projekte.length === 0 && (
          <div style={{ fontSize: '13px', color: 'var(--text3)' }}>Keine Projekte im gewählten Zeitraum und mit den gewählten Filtern.</div>
        )}

        {projekte.map((p) => {
          const b = BELEGUNG[p.belegung] || BELEGUNG.vorlaeufig;
          const istOffen = offen.has(p.id);
          const aufbauAnders = p.planVon && p.von && (p.planVon !== p.von || p.planBis !== p.bis);
          return (
            <div key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <div onClick={() => umschalten(p.id)} style={{
                display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 12px',
                padding: '9px 4px', cursor: 'pointer',
              }}>
                <span style={{ width: '12px', color: 'var(--text3)', fontSize: '11px' }}>{istOffen ? '▾' : '▸'}</span>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: p.farbe || 'var(--r)', flexShrink: 0 }} />
                <span style={{ flex: '1 1 260px', minWidth: 0, fontSize: '13px', color: 'var(--text1)' }}>
                  {p.projektName || p.name}
                  {p.nummer && <span style={{ color: 'var(--text3)', fontSize: '11.5px', marginLeft: '6px' }}>Nr. {p.nummer}</span>}
                  {p.name && p.projektName && p.name !== p.projektName && (
                    <span style={{ display: 'block', color: 'var(--text3)', fontSize: '11.5px' }}>{p.name}</span>
                  )}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text2)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
                  title={aufbauAnders ? `Miete ${dat(p.von)} – ${dat(p.bis)}` : undefined}>
                  {dat(p.planVon || p.von)} – {dat(p.planBis || p.bis)}
                  {aufbauAnders && <span style={{ color: 'var(--text3)', fontSize: '11px' }}> (Miete {dat(p.von)} – {dat(p.bis)})</span>}
                </span>
                {p.typ && <span style={{ fontSize: '11px', color: 'var(--text3)', whiteSpace: 'nowrap' }}>{p.typ}</span>}
                <span title={p.status || ''} style={{
                  fontSize: '10.5px', padding: '2px 8px', borderRadius: '9px', whiteSpace: 'nowrap',
                  border: '1px solid ' + b.farbe, color: b.farbe,
                }}>{p.status || b.text}</span>
                <span style={{ fontSize: '11px', color: 'var(--text3)', whiteSpace: 'nowrap' }}>{p.materialAnzahl} Pos.</span>
                {p.link && (
                  <a href={p.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                    style={{ fontSize: '11.5px', color: 'var(--blue)', whiteSpace: 'nowrap' }}>Rentman ↗</a>
                )}
              </div>
              {istOffen && <Materialliste projektId={p.id} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
