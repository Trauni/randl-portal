import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';

// ── Formatierung (deutsch, netto) ───────────────────────────────────────
const zahl = (n, d = 0) => (n == null ? '–' : Number(n).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }));
const eur = (n, d = 0) => (n == null ? '–' : `${zahl(n, d)} €`);
const pct = (n, d = 1) => (n == null ? '–' : `${zahl(n * 100, d)} %`);
const MON = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const monatName = (m) => MON[parseInt(m.slice(5), 10) - 1];
const tab = { fontVariantNumeric: 'tabular-nums' };

const card = { background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 10, padding: '1rem' };
const h2 = { fontSize: '.95rem', color: 'var(--text1)', margin: '1.5rem 0 .6rem' };
const th = { textAlign: 'left', padding: '.4rem .6rem', fontSize: '.68rem', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', cursor: 'default' };
const td = { padding: '.4rem .6rem', fontSize: '.85rem', color: 'var(--text1)', ...tab };
const num = { textAlign: 'right' };
const inp = { background: 'var(--bg0)', border: '1px solid var(--border)', borderRadius: 6, padding: '.35rem .6rem', color: 'var(--text1)', fontSize: '.85rem', boxSizing: 'border-box' };

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

function Kachel({ titel, wert, sub }) {
  return (
    <div style={{ ...card, padding: '.8rem 1rem' }}>
      <div style={{ fontSize: '.68rem', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{titel}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text1)', ...tab }}>{wert}</div>
      {sub && <div style={{ fontSize: '.72rem', color: 'var(--text2)' }}>{sub}</div>}
    </div>
  );
}
const Kacheln = ({ children }) => <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: '.75rem' }}>{children}</div>;

// Einfaches Balkendiagramm (gestapelt möglich). reihen: [{name, farbe, werte:[…]}]
function Balken({ labels, reihen, format = zahl, hoehe = 180 }) {
  const stapel = labels.map((_, i) => reihen.reduce((s, r) => s + (r.werte[i] || 0), 0));
  const max = Math.max(1, ...stapel);
  const b = 100 / labels.length;
  return (
    <div>
      <svg viewBox={`0 0 100 ${hoehe / 4}`} preserveAspectRatio="none" style={{ width: '100%', height: hoehe, display: 'block' }}>
        {labels.map((l, i) => {
          let y = hoehe / 4;
          return reihen.map((r) => {
            const h = ((r.werte[i] || 0) / max) * (hoehe / 4 - 2);
            y -= h;
            return <rect key={r.name + i} x={i * b + b * 0.15} y={y} width={b * 0.7} height={h} fill={r.farbe}><title>{`${l} · ${r.name}: ${format(r.werte[i])}`}</title></rect>;
          });
        })}
      </svg>
      <div style={{ display: 'flex' }}>{labels.map((l) => <div key={l} style={{ flex: 1, textAlign: 'center', fontSize: '.65rem', color: 'var(--text3)' }}>{l}</div>)}</div>
      {reihen.length > 1 && (
        <div style={{ display: 'flex', gap: '1rem', fontSize: '.72rem', color: 'var(--text2)', marginTop: '.3rem' }}>
          {reihen.map((r) => <span key={r.name}><span style={{ color: r.farbe }}>■</span> {r.name}</span>)}
        </div>
      )}
    </div>
  );
}
const ROT = '#cc0000'; const BLAU = '#2b4a7a'; const GRUEN = '#1d7a4c'; const GRAU = '#8a8a86';

function Tabelle({ kopf, zeilen, rechts = [] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{kopf.map((k, i) => <th key={k} style={{ ...th, ...(rechts.includes(i) ? num : {}) }}>{k}</th>)}</tr></thead>
        <tbody>{zeilen.map((z, r) => <tr key={r} style={{ borderTop: '1px solid var(--border)' }}>{z.map((c, i) => <td key={i} style={{ ...td, ...(rechts.includes(i) ? num : {}) }}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

// ── Überblick ───────────────────────────────────────────────────────────
function Ueberblick() {
  const { daten: d, fehler } = useApi('/api/finance/gas-auswertung/uebersicht');
  if (fehler) return <div style={{ color: ROT }}>{fehler}</div>;
  if (!d) return <div style={{ color: 'var(--text2)' }}>Lade …</div>;
  const k = d.kacheln; const L = d.monate.map((m) => monatName(m.monat));
  const rm = d.rohertrag_monat;
  return (
    <>
      <p style={{ color: 'var(--text2)', fontSize: '.8rem' }}>Belege {d.stand.von?.split('-').reverse().join('.')} bis {d.stand.bis?.split('-').reverse().join('.')}. Beträge netto, Listenpreis am Belegtag.</p>
      <Kacheln>
        <Kachel titel="Umsatz alle Gase" wert={eur(k.umsatz)} />
        <Kachel titel="Touren" wert={zahl(k.touren)} />
        <Kachel titel="Stopps" wert={zahl(k.stopps)} />
        <Kachel titel="Lieferkosten" wert={eur(k.lieferkosten)} sub="Modell, alle Gase" />
        <Kachel titel="Flaschen alle Gase" wert={zahl(k.flaschen)} />
        <Kachel titel="Rohertrag Propan" wert={eur(rm.rohertrag)} sub={`${pct(rm.marge)} Marge, Jan.–Okt.`} />
      </Kacheln>

      <h2 style={h2}>Umsatz je Monat</h2>
      <div style={card}><Balken labels={L} format={eur} reihen={[{ name: 'Tour', farbe: ROT, werte: d.monate.map((m) => m.umsatz_tour) }, { name: 'Lager/Sonstige', farbe: BLAU, werte: d.monate.map((m) => m.umsatz_lager) }]} /></div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: '1rem' }}>
        <div><h2 style={h2}>Touren je Monat</h2><div style={card}><Balken labels={L} reihen={[{ name: 'Touren', farbe: ROT, werte: d.monate.map((m) => m.touren) }]} /></div></div>
        <div><h2 style={h2}>Stopps je Monat</h2><div style={card}><Balken labels={L} reihen={[{ name: 'Stopps', farbe: BLAU, werte: d.monate.map((m) => m.stopps) }]} /></div></div>
      </div>

      <h2 style={h2}>Rohertrag Propan je Monat (Einkauf je Gültigkeitsperiode)</h2>
      <div style={card}>
        <Balken labels={rm.monate.map((m) => monatName(m.monat))} format={eur} reihen={[{ name: 'Rohertrag', farbe: GRUEN, werte: rm.monate.map((m) => m.rohertrag) }]} />
      </div>
      <Tabelle kopf={['Monat', 'Flaschen', 'Umsatz', 'Einkauf', 'Rohertrag', 'Marge']} rechts={[1, 2, 3, 4, 5]}
        zeilen={rm.monate.map((m) => [m.monat, zahl(m.flaschen), eur(m.umsatz), eur(m.ek), eur(m.rohertrag), pct(m.marge)])} />

      <h2 style={h2}>Umsatz nach Produktgruppe</h2>
      <Tabelle kopf={['Gruppe', 'Flaschen', 'Umsatz']} rechts={[1, 2]} zeilen={d.produktgruppen.map((g) => [g.gruppe, zahl(g.flaschen), eur(g.umsatz)])} />

      <h2 style={h2}>Propan-Stopps nach kg-Klasse (Einkauf heute)</h2>
      <Tabelle kopf={['Klasse', 'Stopps', 'Rohertrag je Stopp', 'Lieferkosten je Stopp', 'Übrig je Stopp']} rechts={[1, 2, 3, 4]}
        zeilen={Object.entries(d.kg_klassen).map(([n, v]) => {
          const s = Math.max(v.stopps, 1);
          return [n, zahl(v.stopps), eur(v.rohertrag / s, 2), eur(v.lieferkosten / s, 2), eur((v.rohertrag - v.lieferkosten) / s, 2)];
        })} />
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
  if (fehler) return <div style={{ color: ROT }}>{fehler}</div>;
  if (!d) return <div style={{ color: 'var(--text2)' }}>Lade …</div>;
  const k = d.kennzahlen; const g = d.gasarten.find((x) => x.gasart === verlauf) || d.gasarten[0];
  const sum = (f) => zeilen.reduce((s, a) => s + (a[f] || 0), 0);
  const kopf = (label, key) => <th style={{ ...th, cursor: 'pointer', ...(key === 'bezeichnung' || key === 'gasart' ? {} : num) }} onClick={() => setSort((s) => ({ k: key, r: s.k === key ? -s.r : -1 }))}>{label}{sort.k === key ? (sort.r < 0 ? ' ↓' : ' ↑') : ''}</th>;
  return (
    <>
      <Kacheln>
        <Kachel titel="Flaschen (voll)" wert={zahl(k.voll)} sub={`${zahl(k.leer)} leer zurück`} />
        <Kachel titel="Ø je Woche" wert={zahl(k.woche_avg, 1)} />
        <Kachel titel="90 %-Woche" wert={zahl(k.woche_p90, 1)} sub="in 9 von 10 Wochen reicht das" />
        <Kachel titel="Ø je Monat" wert={zahl(k.monat_avg, 1)} />
      </Kacheln>

      <h2 style={h2}>Je Gasart</h2>
      <Tabelle kopf={['Gasart', 'Voll', 'Leer', 'Ø Woche', '90 %-Woche', 'Max Woche', 'Ø Monat']} rechts={[1, 2, 3, 4, 5, 6]}
        zeilen={d.gasarten.map((a) => [a.gasart, zahl(a.voll), zahl(a.leer), zahl(a.woche_avg, 1), zahl(a.woche_p90, 1), zahl(a.woche_max), zahl(a.monat_avg, 1)])} />

      <h2 style={h2}>Verlauf</h2>
      <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.5rem' }}>
        <select style={inp} value={g.gasart} onChange={(e) => setVerlauf(e.target.value)}>{d.gasarten.map((a) => <option key={a.gasart}>{a.gasart}</option>)}</select>
        <select style={inp} value={ansicht} onChange={(e) => setAnsicht(e.target.value)}><option value="wochen">je Woche</option><option value="monate">je Monat</option></select>
      </div>
      <div style={card}>
        {ansicht === 'wochen'
          ? <Balken labels={g.wochen.map((w, i) => (i % 4 === 0 ? w.montag.slice(5).split('-').reverse().join('.') : ''))} reihen={[{ name: 'Flaschen', farbe: ROT, werte: g.wochen.map((w) => w.voll) }]} />
          : <Balken labels={g.monate.map((m) => monatName(m.monat))} reihen={[{ name: 'Flaschen', farbe: ROT, werte: g.monate.map((m) => m.voll) }]} />}
      </div>

      <h2 style={h2}>Je Artikel</h2>
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '.5rem' }}>
        <select style={inp} value={kat} onChange={(e) => setKat(e.target.value)}><option value="alle">Alle Kategorien</option><option value="propan">Propan</option><option value="technisch">Technisch und sonstige</option></select>
        <select style={inp} value={gasart} onChange={(e) => setGasart(e.target.value)}><option value="">Alle Gasarten</option>{d.gasarten.map((a) => <option key={a.gasart}>{a.gasart}</option>)}</select>
        <input style={inp} placeholder="Suche" value={suche} onChange={(e) => setSuche(e.target.value)} />
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{kopf('Artikel', 'bezeichnung')}{kopf('Gasart', 'gasart')}{kopf('Voll', 'voll')}{kopf('Leer', 'leer')}{kopf('kg', 'kg')}{kopf('Tour-Anteil', 'anteil_tour')}{kopf('Ø Woche', 'woche_avg')}{kopf('90 %-Woche', 'woche_p90')}{kopf('Max Woche', 'woche_max')}{kopf('Ø Monat', 'monat_avg')}</tr></thead>
          <tbody>
            {zeilen.map((a) => (
              <tr key={a.artikel} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={td}>{a.bezeichnung} <span style={{ color: 'var(--text3)' }}>{a.artikel}</span></td><td style={td}>{a.gasart}</td>
                <td style={{ ...td, ...num }}>{zahl(a.voll)}</td><td style={{ ...td, ...num }}>{zahl(a.leer)}</td><td style={{ ...td, ...num }}>{zahl(a.kg)}</td>
                <td style={{ ...td, ...num }}>{pct(a.anteil_tour, 0)}</td><td style={{ ...td, ...num }}>{zahl(a.woche_avg, 1)}</td><td style={{ ...td, ...num }}>{zahl(a.woche_p90, 1)}</td>
                <td style={{ ...td, ...num }}>{zahl(a.woche_max)}</td><td style={{ ...td, ...num }}>{zahl(a.monat_avg, 1)}</td>
              </tr>
            ))}
            <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
              <td style={td}>Summe ({zeilen.length})</td><td style={td} /><td style={{ ...td, ...num }}>{zahl(sum('voll'))}</td><td style={{ ...td, ...num }}>{zahl(sum('leer'))}</td>
              <td style={{ ...td, ...num }}>{zahl(sum('kg'))}</td><td style={td} /><td style={{ ...td, ...num }}>{zahl(sum('woche_avg'), 1)}</td><td style={td} /><td style={td} /><td style={{ ...td, ...num }}>{zahl(sum('monat_avg'), 1)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Preismodell ─────────────────────────────────────────────────────────
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
  if (fehler) return <div style={{ color: ROT }}>{fehler}</div>;
  if (!d) return <div style={{ color: 'var(--text2)' }}>Lade …</div>;
  const s = d.simulator;
  return (
    <>
      <p style={{ color: 'var(--text2)', fontSize: '.8rem' }}>
        Rechnet mit den Einkaufspreisen, die am {d.stichtag.split('-').reverse().join('.')} gelten (<Link to="/gashandel/einkaufspreise" style={{ color: ROT }}>Einkaufspreise pflegen</Link>).
        Verkaufspreise Stand Oktober 2026, Basis 01.01.–03.11.2026.
      </p>
      <h2 style={{ ...h2, marginTop: '.5rem' }}>Varianten</h2>
      <Tabelle kopf={['Variante', 'Rohertrag', 'Δ zum Vergleichsstand', 'Pauschalen', 'Kunden günstiger', 'Kunden teurer', 'über +10 %']} rechts={[1, 2, 3, 4, 5, 6]}
        zeilen={d.varianten.map((v) => [v.name, eur(v.rohertrag_neu), eur(v.rohertrag_neu - v.rohertrag_vergleich), eur(v.pauschalen), zahl(v.kunden_guenstiger), zahl(v.kunden_teurer), zahl(v.kunden_ueber_10)])} />

      <h2 style={h2}>Simulator</h2>
      <div style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '1rem' }}>
        <div>
          <label style={{ fontSize: '.68rem', color: 'var(--text3)', textTransform: 'uppercase' }}>Gaspreisänderung: {senkung > 0 ? `−${senkung}` : senkung < 0 ? `+${-senkung}` : '0'} %</label>
          <input type="range" min={-10} max={10} step={0.5} value={senkung} onChange={(e) => setSenkung(Number(e.target.value))} style={{ width: '100%' }} />
          <div style={{ fontSize: '.7rem', color: 'var(--text3)' }}>rechts = Senkung, links = Erhöhung</div>
        </div>
        <div>
          <label style={{ fontSize: '.68rem', color: 'var(--text3)', textTransform: 'uppercase' }}>Pauschale je Stufe</label>
          <select style={{ ...inp, width: '100%' }} value={staffel} onChange={(e) => setStaffel(e.target.value)}><option value="ohne">ohne</option><option value="S">Staffel S</option><option value="S+">Staffel S+</option><option value="eigene">eigene Beträge</option></select>
          {staffel === 'eigene' && (
            <div style={{ display: 'flex', gap: '.3rem', marginTop: '.4rem' }}>
              {['bis 11', '33', '66', '99', 'ab 100'].map((l, i) => <input key={l} title={`${l} kg`} style={{ ...inp, width: '100%', minWidth: 0 }} value={betraege[i]} onChange={(e) => setBetraege((b) => b.map((x, j) => (j === i ? e.target.value : x)))} />)}
            </div>
          )}
        </div>
        <div>
          <label style={{ fontSize: '.68rem', color: 'var(--text3)', textTransform: 'uppercase' }}>Vergleichsstand Einkauf</label>
          <input type="date" style={{ ...inp, width: '100%' }} value={vergleich} onChange={(e) => setVergleich(e.target.value)} />
        </div>
      </div>
      <div style={{ marginTop: '.75rem' }}>
        <Kacheln>
          <Kachel titel="Rohertrag" wert={eur(s.rohertrag_neu)} sub={`Heute ${eur(s.rohertrag_ist)}`} />
          <Kachel titel="Δ zum Vergleichsstand" wert={eur(s.rohertrag_neu - s.rohertrag_vergleich)} sub={`Vergleich ${eur(s.rohertrag_vergleich)}`} />
          <Kachel titel="Pauschalen" wert={eur(s.pauschalen)} />
          <Kachel titel="Nötige Gaspreisänderung" wert={pct(s.noetige_aenderung, 2)} sub="gleicht EK-Anstieg nach Pauschalen aus" />
          <Kachel titel="Kunden über +10 %" wert={zahl(s.kunden_ueber_10)} sub={`${zahl(s.kunden_teurer)} teurer, ${zahl(s.kunden_guenstiger)} günstiger`} />
        </Kacheln>
      </div>
      <h2 style={h2}>Preistabelle</h2>
      <Tabelle kopf={['Artikel', 'Preis heute', 'Preis neu']} rechts={[1, 2]}
        zeilen={Object.entries(s.preise).map(([a, p]) => [a, eur(VK[a], 2), eur(p, 2)])} />
      <h2 style={h2}>Wirkung je kg-Klasse</h2>
      <Tabelle kopf={['Klasse', 'Stopps', 'Pauschale je Stopp', 'Lieferkosten je Stopp']} rechts={[1, 2, 3]}
        zeilen={Object.entries(s.klassen).map(([n, v]) => [n, zahl(v.stopps), eur(v.pauschale / Math.max(v.stopps, 1), 2), eur(v.lieferkosten / Math.max(v.stopps, 1), 2)])} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: '1rem' }}>
        <div><h2 style={h2}>Größte Gewinner</h2><Tabelle kopf={['Kunde', 'Δ', 'Δ %']} rechts={[1, 2]} zeilen={s.gewinner.map((k) => [k.kunde_nr, eur(k.delta), `${zahl(k.delta_pct, 1)} %`])} /></div>
        <div><h2 style={h2}>Größte Verlierer</h2><Tabelle kopf={['Kunde', 'Δ', 'Δ %']} rechts={[1, 2]} zeilen={s.verlierer.map((k) => [k.kunde_nr, eur(k.delta), `${zahl(k.delta_pct, 1)} %`])} /></div>
      </div>
    </>
  );
}
const VK = { 7801000: 14.97, 7801800: 14.97, 7801050: 18.48, 7801100: 30.80, 7801200: 30.80, 7801250: 30.80, 7801300: 98.30, 7802000: 35.13, 7802010: 37.22 };

// ── Methodik ────────────────────────────────────────────────────────────
function Methodik() {
  const p = { color: 'var(--text2)', fontSize: '.85rem', lineHeight: 1.55, margin: '.3rem 0' };
  return (
    <div style={{ maxWidth: 760 }}>
      <h2 style={{ ...h2, marginTop: 0 }}>Datenquellen</h2>
      <p style={p}>Belege aus der Komplettstatistik des Versorger-Portals (PDF je Terminal 6441–6444) und die Tourliste. Einkaufspreise kommen aus der Pflegemaske, Verkaufspreise sind Listenpreise am Belegtag.</p>
      <h2 style={h2}>Regeln</h2>
      <p style={p}><b>Tour:</b> Terminal und Datum passen zu einer Tour. Ohne Belege am Tourtag wird ±3 Tage gesucht. <b>Lager:</b> Lager-Kunden oder Terminal 6444. Der Rest ist „Tablet ohne Tour“.</p>
      <p style={p}><b>Stopp:</b> Terminal + Datum + Kunde auf einer Tour, nur mit Ware. <b>Flaschen:</b> volle Flaschen, ohne Paletten und Kappen. Wochen sind volle ISO-Kalenderwochen (05.01.–01.11.), die 90 %-Woche ist das Quantil 0,9.</p>
      <p style={p}><b>Lieferkosten je Stopp</b> = km × €/km + (Fahrzeit + Standzeit + Minuten je Flasche × Flaschen) / 60 × €/h. Die Werte stehen in <code>gas_parameter</code>.</p>
      <p style={p}><b>Preismodell:</b> Umsatz neu = Σ Preis × (1 − Senkung) + Σ Pauschale je Stopp. Rohertrag = Umsatz − Einkauf. Einkauf je Flasche = Preis mit dem größten „gültig ab“ vor dem Stichtag, bei Preisbasis kg mal Füllmenge.</p>
      <h2 style={h2}>Grenzen</h2>
      <p style={p}>Kosten je km sind eine Annahme (0,40 €). Die Verkaufspreise vor Oktober sind teils aus Barbelegen abgeleitet. Sonderpreise gibt es nur für bekannte Barkunden. Einkaufspreise für CO2, Biergas und technische Gase fehlen noch.</p>
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
    <div style={{ maxWidth: 640, display: 'grid', gap: '1rem' }}>
      <div style={card}>
        <b style={{ color: 'var(--text1)' }}>Komplettstatistik (PDF je Terminal)</b>
        <p style={{ color: 'var(--text2)', fontSize: '.8rem' }}>Mehrere Dateien möglich. Ein erneuter Import überschreibt dieselben Belege, doppelt wird nichts.</p>
        <input type="file" accept="application/pdf" multiple disabled={busy} onChange={(e) => { senden('/api/finance/gas-auswertung/import/komplettstatistik', 'dateien', e.target.files, true); e.target.value = ''; }} />
      </div>
      <div style={card}>
        <b style={{ color: 'var(--text1)' }}>Touren (CSV)</b>
        <p style={{ color: 'var(--text2)', fontSize: '.8rem' }}>Spalten: datum;tourende;bezeichnung;terminal;plan_kg_brutto;plan_bestellungen</p>
        <input type="file" accept=".csv,text/csv" disabled={busy} onChange={(e) => { senden('/api/finance/gas-auswertung/import/touren', 'datei', e.target.files, false); e.target.value = ''; }} />
      </div>
      {msg?.ok && <div style={{ color: GRUEN, fontSize: '.85rem' }}>{msg.ok}</div>}
      {msg?.fehler && <div style={{ color: ROT, fontSize: '.85rem' }}>{msg.fehler}</div>}
    </div>
  );
}

const TABS = [['ueberblick', 'Überblick', Ueberblick], ['flaschen', 'Flaschen', Flaschen], ['preismodell', 'Preismodell', Preismodell], ['methodik', 'Methodik', Methodik], ['import', 'Daten-Import', Import]];

export default function GasAuswertung() {
  const [aktiv, setAktiv] = useState('ueberblick');
  const Seite = TABS.find((t) => t[0] === aktiv)[2];
  return (
    <div style={{ padding: '1.5rem', maxWidth: 1100 }}>
      <h1 style={{ fontSize: '1.2rem', color: 'var(--text1)', marginBottom: '.75rem' }}>Gas-Auswertung</h1>
      <div style={{ display: 'flex', gap: '.25rem', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', marginBottom: '1rem' }}>
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setAktiv(k)} style={{ background: 'none', border: 'none', borderBottom: aktiv === k ? `2px solid ${ROT}` : '2px solid transparent', color: aktiv === k ? 'var(--text1)' : 'var(--text2)', padding: '.5rem .9rem', cursor: 'pointer', fontWeight: aktiv === k ? 600 : 400 }}>{l}</button>
        ))}
        <Link to="/gashandel/einkaufspreise" style={{ marginLeft: 'auto', alignSelf: 'center', color: ROT, fontSize: '.85rem' }}>Einkaufspreise →</Link>
      </div>
      <Seite />
    </div>
  );
}
