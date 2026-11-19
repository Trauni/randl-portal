import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Panel, Tabs, GasCylinder } from '../../ui';

// Gas-Auswertung (#460), im neuen Look (#608). Rechnung und Daten unverändert, Verkaufspreise und Artikel kommen aus dem Artikelstamm (#604).

// ── Formatierung (deutsch, netto) ───────────────────────────────────────
const zahl = (n, d = 0) => (n == null ? '–' : Number(n).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }));
const eur = (n, d = 0) => (n == null ? '–' : `${zahl(n, d)} €`);
const pct = (n, d = 1) => (n == null ? '–' : `${zahl(n * 100, d)} %`);
const MON = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const monatName = (m) => MON[parseInt(m.slice(5), 10) - 1];

const ROT = 'var(--chart-1)'; const BLAU = 'var(--chart-2)'; const GRUEN = 'var(--chart-3)';
const num = { textAlign: 'right' };

async function api(url, opts) {
  const r = await fetch(url, opts);
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Fehler');
  return d;
}
const useApi = (url) => {
  const [daten, setDaten] = useState(null);
  const [fehler, setFehler] = useState('');
  useEffect(() => { api(url).then(setDaten).catch((e) => setFehler(e.message)); }, [url]);
  return { daten, fehler };
};

const Meldung = ({ fehler }) => <div className="alert alert-error" role="alert">✗ {fehler}</div>;
const Laedt = () => <div style={{ color: 'var(--text3)', padding: 20 }}>Lade …</div>;
const Abschnitt = ({ titel, children, hinweis }) => (
  <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <h2 className="ui-panel-title" style={{ fontSize: 22 }}>{titel}</h2>
    {hinweis && <p className="ui-table-sub" style={{ margin: 0 }}>{hinweis}</p>}
    {children}
  </section>
);

// Kennzahlenleiste: Kacheln in einem Panel (wie im Mockup)
const Kacheln = ({ children }) => <Panel><div className="ui-kz-leiste">{children}</div></Panel>;
function Kachel({ titel, wert, sub }) {
  return (
    <div className="ui-kz"><span>{titel}</span><b>{wert}</b>{sub && <span>{sub}</span>}</div>
  );
}

// Einfaches Balkendiagramm (gestapelt möglich). reihen: [{name, farbe, werte:[…]}]
function Balken({ labels, reihen, format = zahl, hoehe = 180 }) {
  const stapel = labels.map((_, i) => reihen.reduce((s, r) => s + (r.werte[i] || 0), 0));
  const max = Math.max(1, ...stapel);
  const b = 100 / labels.length;
  return (
    <div>
      <svg viewBox={`0 0 100 ${hoehe / 4}`} preserveAspectRatio="none" role="img" aria-label={reihen.map((r) => r.name).join(' und ')} style={{ width: '100%', height: hoehe, display: 'block' }}>
        {labels.map((l, i) => {
          let y = hoehe / 4;
          return reihen.map((r) => {
            const h = ((r.werte[i] || 0) / max) * (hoehe / 4 - 2);
            y -= h;
            return <rect key={r.name + i} x={i * b + b * 0.15} y={y} width={b * 0.7} height={h} style={{ fill: r.farbe }}><title>{`${l} · ${r.name}: ${format(r.werte[i])}`}</title></rect>;
          });
        })}
      </svg>
      <div style={{ display: 'flex', borderTop: '1px solid var(--border)', marginTop: 2 }}>{labels.map((l, i) => <div key={l + i} style={{ flex: 1, textAlign: 'center', fontSize: 13, color: 'var(--text2)' }}>{l}</div>)}</div>
      {reihen.length > 1 && (
        <div style={{ display: 'flex', gap: 18, fontSize: 14, marginTop: 8 }}>
          {reihen.map((r) => <span key={r.name}><span aria-hidden="true" style={{ display: 'inline-block', width: 12, height: 12, background: r.farbe, borderRadius: 2, marginRight: 6, verticalAlign: -1 }} />{r.name}</span>)}
        </div>
      )}
    </div>
  );
}
const Diagramm = ({ children }) => <Panel><div style={{ padding: '16px 18px 18px' }}>{children}</div></Panel>;

// kopf: Spaltenüberschriften, zeilen: Zellen (Text oder Element), rechts: Spalten rechtsbündig
function Tabelle({ kopf, zeilen, rechts = [] }) {
  return (
    <Panel>
      <div style={{ overflowX: 'auto' }}>
        <table className="ui-table">
          <thead><tr>{kopf.map((k, i) => <th key={k} className={rechts.includes(i) ? 'r' : undefined}>{k}</th>)}</tr></thead>
          <tbody>{zeilen.map((z, r) => <tr key={r}>{z.map((c, i) => <td key={i} className={rechts.includes(i) ? 'r' : undefined}>{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </Panel>
  );
}
// Gasart mit Flaschensymbol in der Schulterfarbe (DIN EN 1089-3)
const GasName = ({ gasart, children }) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}><GasCylinder gasart={gasart} />{children ?? gasart}</span>;

// ── Überblick ───────────────────────────────────────────────────────────
function Ueberblick() {
  const { daten: d, fehler } = useApi('/api/finance/gas-auswertung/uebersicht');
  if (fehler) return <Meldung fehler={fehler} />;
  if (!d) return <Laedt />;
  const k = d.kacheln; const L = d.monate.map((m) => monatName(m.monat));
  const rm = d.rohertrag_monat;
  return (
    <>
      <p className="ui-table-sub" style={{ margin: 0 }}>Belege {d.stand.von?.split('-').reverse().join('.')} bis {d.stand.bis?.split('-').reverse().join('.')}. Beträge netto, Listenpreis am Belegtag.</p>
      <Kacheln>
        <Kachel titel="Umsatz alle Gase" wert={eur(k.umsatz)} />
        <Kachel titel="Rohertrag Propan" wert={eur(rm.rohertrag)} sub={`${pct(rm.marge)} Marge, Jan.–Okt.`} />
        <Kachel titel="Touren" wert={zahl(k.touren)} />
        <Kachel titel="Stopps" wert={zahl(k.stopps)} />
        <Kachel titel="Flaschen alle Gase" wert={zahl(k.flaschen)} />
        <Kachel titel="Lieferkosten" wert={eur(k.lieferkosten)} sub="Modell, alle Gase" />
      </Kacheln>

      <Abschnitt titel="Umsatz je Monat">
        <Diagramm><Balken labels={L} format={eur} reihen={[{ name: 'Tour', farbe: ROT, werte: d.monate.map((m) => m.umsatz_tour) }, { name: 'Lager und Sonstige', farbe: BLAU, werte: d.monate.map((m) => m.umsatz_lager) }]} /></Diagramm>
      </Abschnitt>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16 }}>
        <Abschnitt titel="Touren je Monat"><Diagramm><Balken labels={L} reihen={[{ name: 'Touren', farbe: ROT, werte: d.monate.map((m) => m.touren) }]} /></Diagramm></Abschnitt>
        <Abschnitt titel="Stopps je Monat"><Diagramm><Balken labels={L} reihen={[{ name: 'Stopps', farbe: BLAU, werte: d.monate.map((m) => m.stopps) }]} /></Diagramm></Abschnitt>
      </div>

      <Abschnitt titel="Rohertrag Propan je Monat" hinweis="Einkauf je Gültigkeitsperiode.">
        <Diagramm><Balken labels={rm.monate.map((m) => monatName(m.monat))} format={eur} reihen={[{ name: 'Rohertrag', farbe: GRUEN, werte: rm.monate.map((m) => m.rohertrag) }]} /></Diagramm>
        <Tabelle kopf={['Monat', 'Flaschen', 'Umsatz', 'Einkauf', 'Rohertrag', 'Marge']} rechts={[1, 2, 3, 4, 5]}
          zeilen={rm.monate.map((m) => [m.monat, zahl(m.flaschen), eur(m.umsatz), eur(m.ek), eur(m.rohertrag), pct(m.marge)])} />
      </Abschnitt>

      <Abschnitt titel="Umsatz nach Produktgruppe">
        <Tabelle kopf={['Gruppe', 'Flaschen', 'Umsatz']} rechts={[1, 2]} zeilen={d.produktgruppen.map((g) => [g.gruppe, zahl(g.flaschen), eur(g.umsatz)])} />
      </Abschnitt>

      <Abschnitt titel="Propan-Stopps nach kg-Klasse" hinweis="Einkauf heute.">
        <Tabelle kopf={['Klasse', 'Stopps', 'Rohertrag je Stopp', 'Lieferkosten je Stopp', 'Übrig je Stopp']} rechts={[1, 2, 3, 4]}
          zeilen={Object.entries(d.kg_klassen).map(([n, v]) => {
            const s = Math.max(v.stopps, 1);
            return [n, zahl(v.stopps), eur(v.rohertrag / s, 2), eur(v.lieferkosten / s, 2), eur((v.rohertrag - v.lieferkosten) / s, 2)];
          })} />
      </Abschnitt>
    </>
  );
}

// ── Flaschen ────────────────────────────────────────────────────────────
function Flaschen() {
  const { daten: d, fehler } = useApi('/api/finance/gas-auswertung/flaschen');
  const [kat, setKat] = useState('alle'); const [gasart, setGasart] = useState(''); const [suche, setSuche] = useState('');
  const [sort, setSort] = useState({ k: 'voll', r: -1 }); const [verlauf, setVerlauf] = useState('Propan'); const [ansicht, setAnsicht] = useState('wochen');
  const zeilen = useMemo(() => {
    if (!d) return [];
    const istProp = (a) => a.gasart === 'Propan' || a.gasart === 'Propan Treibgas';
    return d.artikel
      .filter((a) => (kat === 'alle' || (kat === 'propan') === istProp(a)) && (!gasart || a.gasart === gasart) && (!suche || `${a.bezeichnung} ${a.artikel}`.toLowerCase().includes(suche.toLowerCase())))
      .sort((a, b) => ((a[sort.k] ?? -1) > (b[sort.k] ?? -1) ? 1 : -1) * sort.r);
  }, [d, kat, gasart, suche, sort]);
  if (fehler) return <Meldung fehler={fehler} />;
  if (!d) return <Laedt />;
  const k = d.kennzahlen; const g = d.gasarten.find((x) => x.gasart === verlauf) || d.gasarten[0];
  const sum = (f) => zeilen.reduce((s, a) => s + (a[f] || 0), 0);
  const kopf = (label, key) => (
    <th className={key === 'bezeichnung' || key === 'gasart' ? undefined : 'r'} aria-sort={sort.k === key ? (sort.r < 0 ? 'descending' : 'ascending') : 'none'}>
      <button type="button" onClick={() => setSort((s) => ({ k: key, r: s.k === key ? -s.r : -1 }))} style={{ all: 'inherit', cursor: 'pointer', padding: 0 }}>{label}{sort.k === key ? (sort.r < 0 ? ' ↓' : ' ↑') : ''}</button>
    </th>
  );
  return (
    <>
      <Kacheln>
        <Kachel titel="Flaschen (voll)" wert={zahl(k.voll)} sub={`${zahl(k.leer)} leer zurück`} />
        <Kachel titel="Ø je Woche" wert={zahl(k.woche_avg, 1)} />
        <Kachel titel="90 %-Woche" wert={zahl(k.woche_p90, 1)} sub="in 9 von 10 Wochen reicht das" />
        <Kachel titel="Ø je Monat" wert={zahl(k.monat_avg, 1)} />
      </Kacheln>

      <Abschnitt titel="Je Gasart">
        <Tabelle kopf={['Gasart', 'Voll', 'Leer', 'Ø Woche', '90 %-Woche', 'Max. Woche', 'Ø Monat']} rechts={[1, 2, 3, 4, 5, 6]}
          zeilen={d.gasarten.map((a) => [<GasName key={a.gasart} gasart={a.gasart} />, zahl(a.voll), zahl(a.leer), zahl(a.woche_avg, 1), zahl(a.woche_p90, 1), zahl(a.woche_max), zahl(a.monat_avg, 1)])} />
      </Abschnitt>

      <Abschnitt titel="Verlauf">
        <div style={{ display: 'flex', gap: 8 }}>
          <select className="form-select" style={{ width: 'auto' }} aria-label="Gasart" value={g.gasart} onChange={(e) => setVerlauf(e.target.value)}>{d.gasarten.map((a) => <option key={a.gasart}>{a.gasart}</option>)}</select>
          <select className="form-select" style={{ width: 'auto' }} aria-label="Zeitraum" value={ansicht} onChange={(e) => setAnsicht(e.target.value)}><option value="wochen">je Woche</option><option value="monate">je Monat</option></select>
        </div>
        <Diagramm>
          {ansicht === 'wochen'
            ? <Balken labels={g.wochen.map((w, i) => (i % 4 === 0 ? w.montag.slice(5).split('-').reverse().join('.') : ''))} reihen={[{ name: 'Flaschen', farbe: ROT, werte: g.wochen.map((w) => w.voll) }]} />
            : <Balken labels={g.monate.map((m) => monatName(m.monat))} reihen={[{ name: 'Flaschen', farbe: ROT, werte: g.monate.map((m) => m.voll) }]} />}
        </Diagramm>
      </Abschnitt>

      <Abschnitt titel="Je Artikel">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select className="form-select" style={{ width: 'auto' }} aria-label="Kategorie" value={kat} onChange={(e) => setKat(e.target.value)}><option value="alle">Alle Kategorien</option><option value="propan">Propan</option><option value="technisch">Technisch und sonstige</option></select>
          <select className="form-select" style={{ width: 'auto' }} aria-label="Gasart" value={gasart} onChange={(e) => setGasart(e.target.value)}><option value="">Alle Gasarten</option>{d.gasarten.map((a) => <option key={a.gasart}>{a.gasart}</option>)}</select>
          <input type="search" className="form-input" style={{ width: 220 }} placeholder="Suche" aria-label="Suche" value={suche} onChange={(e) => setSuche(e.target.value)} />
        </div>
        <Panel>
          <div style={{ overflowX: 'auto' }}>
            <table className="ui-table">
              <thead><tr>{kopf('Artikel', 'bezeichnung')}{kopf('Gasart', 'gasart')}{kopf('Voll', 'voll')}{kopf('Leer', 'leer')}{kopf('kg', 'kg')}{kopf('Tour-Anteil', 'anteil_tour')}{kopf('Ø Woche', 'woche_avg')}{kopf('90 %-Woche', 'woche_p90')}{kopf('Max. Woche', 'woche_max')}{kopf('Ø Monat', 'monat_avg')}</tr></thead>
              <tbody>
                {zeilen.map((a) => (
                  <tr key={a.artikel}>
                    <td><GasName gasart={a.gasart}>{a.bezeichnung} <span className="ui-table-sub">{a.artikel}</span></GasName></td><td>{a.gasart}</td>
                    <td className="r">{zahl(a.voll)}</td><td className="r">{zahl(a.leer)}</td><td className="r">{zahl(a.kg)}</td>
                    <td className="r">{pct(a.anteil_tour, 0)}</td><td className="r">{zahl(a.woche_avg, 1)}</td><td className="r">{zahl(a.woche_p90, 1)}</td>
                    <td className="r">{zahl(a.woche_max)}</td><td className="r">{zahl(a.monat_avg, 1)}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 700 }}>
                  <td>Summe ({zeilen.length})</td><td /><td className="r">{zahl(sum('voll'))}</td><td className="r">{zahl(sum('leer'))}</td>
                  <td className="r">{zahl(sum('kg'))}</td><td /><td className="r">{zahl(sum('woche_avg'), 1)}</td><td /><td /><td className="r">{zahl(sum('monat_avg'), 1)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>
      </Abschnitt>
    </>
  );
}

// ── Preismodell ─────────────────────────────────────────────────────────
const KLASSEN_KOPF = ['bis 11 kg', 'bis 33 kg', 'bis 66 kg', 'bis 99 kg', 'ab 100 kg'];

function Preismodell() {
  const [senkung, setSenkung] = useState(4);
  const [staffel, setStaffel] = useState('S');
  const [betraege, setBetraege] = useState(['19,90', '14,90', '9,90', '4,90', '0,00']);
  const [vergleich, setVergleich] = useState('2026-10-15');
  const [d, setD] = useState(null); const [fehler, setFehler] = useState('');
  useEffect(() => {
    const t = setTimeout(() => {
      const st = staffel === 'eigene' ? betraege.map((b) => parseFloat(b.replace(',', '.')) || 0) : staffel;
      api('/api/finance/gas-auswertung/preismodell', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ senkung: senkung / 100, staffel: st, vergleichStichtag: vergleich }) })
        .then((x) => { setD(x); setFehler(''); }).catch((e) => setFehler(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [senkung, staffel, betraege, vergleich]);
  if (fehler) return <Meldung fehler={fehler} />;
  if (!d) return <Laedt />;
  const s = d.simulator;
  const labelStil = { fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: 16, color: 'var(--text2)', display: 'block', marginBottom: 4 };
  return (
    <>
      <p className="ui-table-sub" style={{ margin: 0 }}>
        Rechnet mit den Einkaufspreisen, die am {d.stichtag.split('-').reverse().join('.')} gelten (<Link to="/gashandel/einkaufspreise" style={{ color: 'var(--link)' }}>Einkaufspreise pflegen</Link>)
        und den aktuellen Listenpreisen aus dem Artikelstamm. Basis: alle importierten Belege.
      </p>
      <Abschnitt titel="Pauschale je Stopp (Staffeln)" hinweis="Die Pauschale wird je Stopp einmal berechnet, nach den Propan-kg, die an diesem Stopp geliefert werden. Netto. Abholer im Lager zahlen keine.">
        <Tabelle kopf={['Staffel', ...KLASSEN_KOPF]} rechts={[1, 2, 3, 4, 5]}
          zeilen={[['ohne Pauschale', ...d.staffeln.ohne.map((b) => eur(b, 2))], ['Staffel S', ...d.staffeln.S.map((b) => eur(b, 2))], ['Staffel S+', ...d.staffeln['S+'].map((b) => eur(b, 2))],
            ['Simulator (aktuell eingestellt)', ...d.simulator_staffel.map((b) => eur(b, 2))]]} />
      </Abschnitt>

      <Abschnitt titel="Varianten">
        <Tabelle kopf={['Variante', 'Gaspreis', 'Pauschale (bis 11 / 33 / 66 / 99 / ab 100 kg)', 'Rohertrag', 'Δ zum Vergleichsstand', 'Pauschalen gesamt', 'Kunden günstiger', 'Kunden teurer', 'über +10 %']} rechts={[1, 3, 4, 5, 6, 7, 8]}
          zeilen={d.varianten.map((v) => [v.name, v.senkung ? `−${zahl(v.senkung * 100, 0)} %` : '±0', v.staffel.every((b) => b === 0) ? 'keine' : v.staffel.map((b) => zahl(b, 2)).join(' / ') + ' €', eur(v.rohertrag_neu), eur(v.rohertrag_neu - v.rohertrag_vergleich), eur(v.pauschalen), zahl(v.kunden_guenstiger), zahl(v.kunden_teurer), zahl(v.kunden_ueber_10)])} />
      </Abschnitt>

      <Abschnitt titel="Simulator">
        <Panel>
          <div className="ui-panel-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 20 }}>
            <div>
              <label style={labelStil} htmlFor="sim-senkung">Gaspreisänderung: {senkung > 0 ? `−${senkung}` : senkung < 0 ? `+${-senkung}` : '0'} %</label>
              <input id="sim-senkung" type="range" min={-10} max={10} step={0.5} value={senkung} onChange={(e) => setSenkung(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--r)' }} />
              <div className="ui-table-sub">rechts = Senkung, links = Erhöhung</div>
            </div>
            <div>
              <label style={labelStil} htmlFor="sim-staffel">Pauschale je Stufe</label>
              <select id="sim-staffel" className="form-select" value={staffel} onChange={(e) => { const v = e.target.value; if (v === 'eigene' && d) setBetraege(d.simulator_staffel.map((b) => zahl(b, 2))); setStaffel(v); }}><option value="ohne">ohne</option><option value="S">Staffel S</option><option value="S+">Staffel S+</option><option value="eigene">eigene Beträge</option></select>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6, marginTop: 8 }}>
                {KLASSEN_KOPF.map((l, i) => (
                  <div key={l}>
                    <div className="ui-table-sub">{l}</div>
                    {staffel === 'eigene'
                      ? <input className="form-input" style={{ minWidth: 0, padding: '5px 6px' }} aria-label={`Pauschale ${l}`} value={betraege[i]} onChange={(e) => setBetraege((b) => b.map((x, j) => (j === i ? e.target.value : x)))} />
                      : <div className="form-input" style={{ opacity: 0.8, fontVariantNumeric: 'tabular-nums', padding: '5px 6px' }}>{zahl(d.simulator_staffel[i], 2)}</div>}
                  </div>
                ))}
              </div>
              {staffel !== 'eigene' && <div className="ui-table-sub" style={{ marginTop: 4 }}>Für eigene Beträge „eigene Beträge“ wählen.</div>}
            </div>
            <div>
              <label style={labelStil} htmlFor="sim-vergleich">Vergleichsstand Einkauf</label>
              <input id="sim-vergleich" type="date" className="form-input" value={vergleich} onChange={(e) => setVergleich(e.target.value)} />
            </div>
          </div>
        </Panel>
        <Kacheln>
          <Kachel titel="Rohertrag" wert={eur(s.rohertrag_neu)} sub={`Heute ${eur(s.rohertrag_ist)}`} />
          <Kachel titel="Δ zum Vergleichsstand" wert={eur(s.rohertrag_neu - s.rohertrag_vergleich)} sub={`Vergleich ${eur(s.rohertrag_vergleich)}`} />
          <Kachel titel="Pauschalen" wert={eur(s.pauschalen)} />
          <Kachel titel="Nötige Gaspreisänderung" wert={pct(s.noetige_aenderung, 2)} sub="gleicht EK-Anstieg nach Pauschalen aus" />
          <Kachel titel="Kunden über +10 %" wert={zahl(s.kunden_ueber_10)} sub={`${zahl(s.kunden_teurer)} teurer, ${zahl(s.kunden_guenstiger)} günstiger`} />
        </Kacheln>
      </Abschnitt>

      <Abschnitt titel="Preistabelle" hinweis="Preis heute = aktueller Listenpreis netto aus dem Artikelstamm.">
        <Tabelle kopf={['Produkt', 'Artikelnr.', 'Preis heute', 'Preis neu']} rechts={[2, 3]}
          zeilen={Object.entries(s.preise).map(([a, p]) => [d.artikel[a], a, eur(s.preise_heute?.[a], 2), eur(p, 2)])} />
      </Abschnitt>
      <Abschnitt titel="Wirkung je kg-Klasse">
        <Tabelle kopf={['Klasse', 'Stopps', 'Pauschale je Stopp', 'Lieferkosten je Stopp']} rechts={[1, 2, 3]}
          zeilen={Object.entries(s.klassen).map(([n, v]) => [n, zahl(v.stopps), eur(v.pauschale / Math.max(v.stopps, 1), 2), eur(v.lieferkosten / Math.max(v.stopps, 1), 2)])} />
      </Abschnitt>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16 }}>
        <Abschnitt titel="Größte Gewinner"><Tabelle kopf={['Kunde', 'Nr.', 'Δ', 'Δ %']} rechts={[2, 3]} zeilen={s.gewinner.map((k) => [k.name || 'Name nicht gefunden', `${k.nummer}${k.nummer_quelle === 'SER' ? ' (SER)' : ''}`, eur(k.delta), `${zahl(k.delta_pct, 1)} %`])} /></Abschnitt>
        <Abschnitt titel="Größte Verlierer"><Tabelle kopf={['Kunde', 'Nr.', 'Δ', 'Δ %']} rechts={[2, 3]} zeilen={s.verlierer.map((k) => [k.name || 'Name nicht gefunden', `${k.nummer}${k.nummer_quelle === 'SER' ? ' (SER)' : ''}`, eur(k.delta), `${zahl(k.delta_pct, 1)} %`])} /></Abschnitt>
      </div>
    </>
  );
}

// ── Methodik ────────────────────────────────────────────────────────────
function Methodik() {
  const p = { color: 'var(--text2)', fontSize: 15, lineHeight: 1.55, margin: '4px 0' };
  return (
    <div style={{ maxWidth: 780, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Abschnitt titel="Datenquellen">
        <p style={p}>Belege aus der Komplettstatistik des Versorger-Portals (PDF je Terminal 6441–6444) und die Tourliste. Artikel, Gasart, kg und <b>Verkaufspreise</b> kommen aus dem Artikelstamm und dem Preisprotokoll des Preis-Tools (Listenpreis am Belegtag). <b>Einkaufspreise</b> pflegst du am Artikel (Reiter Einkauf).</p>
      </Abschnitt>
      <Abschnitt titel="Regeln">
        <p style={p}><b>Tour:</b> Terminal und Datum passen zu einer Tour. Ohne Belege am Tourtag wird ±3 Tage gesucht. <b>Lager:</b> Lager-Kunden oder Terminal 6444. Der Rest ist „Tablet ohne Tour“.</p>
        <p style={p}><b>Stopp:</b> Terminal + Datum + Kunde auf einer Tour, nur mit Ware. <b>Flaschen:</b> volle Flaschen, ohne Paletten und Kappen. Wochen sind volle ISO-Kalenderwochen (05.01.–01.11.), die 90 %-Woche ist das Quantil 0,9.</p>
        <p style={p}><b>Lieferkosten je Stopp</b> = km × €/km + (Fahrzeit + Standzeit + Minuten je Flasche × Flaschen) / 60 × €/h. Die Werte stehen in <code>gas_parameter</code>.</p>
        <p style={p}><b>Preismodell:</b> Umsatz neu = Σ Preis × (1 − Senkung) + Σ Pauschale je Stopp. Rohertrag = Umsatz − Einkauf. Einkauf je Flasche = Preis mit dem größten „gültig ab“ vor dem Stichtag, bei Preisbasis kg mal Füllmenge.</p>
      </Abschnitt>
      <Abschnitt titel="Grenzen">
        <p style={p}>Kosten je km sind eine Annahme (0,40 €). Die Verkaufspreise vor Oktober sind teils aus Barbelegen abgeleitet. Sonderpreise gibt es nur für bekannte Barkunden. Einkaufspreise für CO2, Biergas und technische Gase fehlen noch.</p>
      </Abschnitt>
    </div>
  );
}

// ── Import ──────────────────────────────────────────────────────────────
function Import() {
  const [msg, setMsg] = useState(null); const [busy, setBusy] = useState(false);
  const senden = async (url, feld, files, multi) => {
    if (!files.length) return;
    setBusy(true); setMsg(null);
    try {
      const fd = new FormData();
      [...files].forEach((f) => fd.append(feld, f));
      const d = await api(url, { method: 'POST', body: fd });
      setMsg({ ok: multi ? d.ergebnis.map((e) => `${e.datei}: Terminal ${e.terminal}, ${e.positionen} Positionen`).join(' · ') : `${d.touren} Touren importiert` });
    } catch (e) { setMsg({ fehler: e.message }); } finally { setBusy(false); }
  };
  return (
    <div style={{ maxWidth: 680, display: 'grid', gap: 16 }}>
      <Panel title="Komplettstatistik (PDF je Terminal)">
        <div className="ui-panel-body">
          <p className="ui-table-sub" style={{ margin: '0 0 8px' }}>Mehrere Dateien möglich. Ein erneuter Import überschreibt dieselben Belege, doppelt wird nichts.</p>
          <input type="file" accept="application/pdf" multiple disabled={busy} aria-label="Komplettstatistik wählen" onChange={(e) => { senden('/api/finance/gas-auswertung/import/komplettstatistik', 'dateien', e.target.files, true); e.target.value = ''; }} />
        </div>
      </Panel>
      <Panel title="Touren (CSV)">
        <div className="ui-panel-body">
          <p className="ui-table-sub" style={{ margin: '0 0 8px' }}>Spalten: datum;tourende;bezeichnung;terminal;plan_kg_brutto;plan_bestellungen</p>
          <input type="file" accept=".csv,text/csv" disabled={busy} aria-label="Touren-CSV wählen" onChange={(e) => { senden('/api/finance/gas-auswertung/import/touren', 'datei', e.target.files, false); e.target.value = ''; }} />
        </div>
      </Panel>
      {msg?.ok && <div className="alert alert-success" role="status">{msg.ok}</div>}
      {msg?.fehler && <Meldung fehler={msg.fehler} />}
    </div>
  );
}

const TABS = [['ueberblick', 'Überblick', Ueberblick], ['flaschen', 'Flaschen', Flaschen], ['preismodell', 'Preismodell', Preismodell], ['methodik', 'Methodik', Methodik], ['import', 'Daten-Import', Import]];
const TAB_ITEMS = TABS.map(([id, label]) => ({ id, label }));

export default function GasAuswertung() {
  const [aktiv, setAktiv] = useState('ueberblick');
  const Seite = TABS.find((t) => t[0] === aktiv)[2];
  return (
    <div style={{ maxWidth: 1400, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
        <div style={{ marginRight: 'auto' }}>
          <h1 className="page-title">Auswertung</h1>
          <p className="page-subtitle" style={{ fontSize: 15, color: 'var(--text2)' }}>Gasverkäufe, Flaschen, Rohertrag und Preismodell. Nur mit Auswertungs-Recht.</p>
        </div>
        <Link to="/gashandel/einkaufspreise" style={{ color: 'var(--link)', fontSize: 15 }}>Einkaufspreise pflegen</Link>
      </div>
      <Tabs items={TAB_ITEMS} value={aktiv} onChange={setAktiv} label="Auswertung" />
      <Seite />
    </div>
  );
}
