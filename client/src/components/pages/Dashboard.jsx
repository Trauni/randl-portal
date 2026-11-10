import { useState, useEffect, useCallback, cloneElement } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
                'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

const dat = (iso) => iso ? new Date(iso).toLocaleDateString('de-DE',
  { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';
const datKurz = (iso) => iso ? new Date(iso).toLocaleDateString('de-DE',
  { day: '2-digit', month: '2-digit' }) : '—';

// Sekunden als „7:45 h“
const stunden = (sek) => {
  const min = Math.floor((sek || 0) / 60);
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')} h`;
};
// Sekunden als „03:12:45“ für die Stempeluhr
const uhr = (sek) => {
  const s = Math.max(0, Math.floor(sek || 0));
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(n => String(n).padStart(2, '0')).join(':');
};

const ANTRAG_STATUS = {
  pending:   { text: 'Ausstehend', farbe: 'var(--r)' },
  approved:  { text: 'Genehmigt',  farbe: 'var(--text3)' },
  rejected:  { text: 'Abgelehnt',  farbe: 'var(--text3)' },
  cancelled: { text: 'Storniert',  farbe: 'var(--text3)' },
};

const karte = {
  background: 'var(--bg1)', border: '1px solid var(--border)',
  borderRadius: '9px', padding: '16px 18px',
};

const ueberschrift = {
  fontSize: '11px', fontWeight: 700, color: 'var(--text3)',
  textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px',
};

const ICON = {
  uhr:      'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  woche:    'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  waage:    'M12 3v18M5 7h14M5 7l-3 7a4 4 0 0 0 6 0zM19 7l-3 7a4 4 0 0 0 6 0z',
  sonne:    'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42',
  team:     'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  antrag:   'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 15l2 2 4-4',
  stempel:  'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3',
  paket:    'M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0',
  senden:   'M22 2L11 13M22 2l-7 20-4-9-9-4z',
  warten:   'M5 22h14M5 2h14M17 22v-4.17a2 2 0 0 0-.59-1.42L12 12l-4.41 4.41A2 2 0 0 0 7 17.83V22M7 2v4.17a2 2 0 0 0 .59 1.42L12 12l4.41-4.41A2 2 0 0 0 17 6.17V2',
  eingang:  'M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
  beleg:    'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  zelt:     'M3 20L12 4l9 16zM12 4v16M8.5 20L12 13l3.5 7',
  server:   'M2 17l10 5 10-5M2 12l10 5 10-5M12 2L2 7l10 5 10-5-10-5z',
};

const Icon = ({ d, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);

// Kennzahl-Kachel. ton: warn (rot ab 1), amber (gelb ab 1), ok (grün), minus (gelb bei negativ)
function Kachel({ icon, label, wert, sub, ziel, ton, nr = 0 }) {
  const zahl = typeof wert === 'number' ? wert : null;
  const akzent = (ton === 'warn' && zahl > 0) ? 'var(--r)'
               : (ton === 'amber' && zahl > 0) ? 'var(--amber)'
               : ton === 'ok' ? 'var(--green)'
               : ton === 'minus' ? 'var(--amber)'
               : null;
  const inhalt = (
    <>
      <div className="dk-kopf">
        <span className="dk-icon" style={akzent ? { color: akzent, background: `color-mix(in srgb, ${akzent} 14%, transparent)` } : undefined}>
          <Icon d={ICON[icon] || ICON.uhr} />
        </span>
        <span className="dk-label">{label}</span>
      </div>
      <div className="dk-wert" style={akzent && ton !== 'ok' ? { color: akzent } : undefined}>{wert ?? '—'}</div>
      {sub && <div className="dk-sub">{sub}</div>}
      {akzent && <span className="dk-streifen" style={{ background: akzent }} />}
    </>
  );
  const stil = { animationDelay: `${Math.min(nr, 12) * 35}ms` };
  if (!ziel) return <div className="dk dash-auftritt" style={stil}>{inhalt}</div>;
  return <Link to={ziel} className="dk dk--link dash-auftritt" style={stil}>{inhalt}</Link>;
}

/** Stempeluhr: ein-/ausstempeln und pausieren direkt vom Dashboard (nur bei Zeiterfassung im Portal). */
function Stempeluhr({ p, onGeaendert }) {
  const [basis, setBasis] = useState({ sek: p?.laufend?.sekunden || 0, ab: Date.now() });
  const [jetzt, setJetzt] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState('');
  const laufend = p?.laufend;

  useEffect(() => { setBasis({ sek: laufend?.sekunden || 0, ab: Date.now() }); }, [laufend?.id, laufend?.status, laufend?.sekunden]);
  useEffect(() => {
    if (laufend?.status !== 'laufend') return undefined;
    const t = setInterval(() => setJetzt(Date.now()), 1000);
    return () => clearInterval(t);
  }, [laufend?.status]);

  const sek = laufend?.status === 'laufend' ? basis.sek + (jetzt - basis.ab) / 1000 : basis.sek;

  const aktion = async (pfad) => {
    setBusy(true); setFehler('');
    try {
      const r = await fetch(pfad, { method: 'POST' });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || 'Aktion fehlgeschlagen');
      }
      await onGeaendert();
    } catch (e) { setFehler(e.message); }
    finally { setBusy(false); }
  };

  const zustand = !laufend ? 'aus' : laufend.status;
  const text = { aus: 'Nicht eingestempelt', laufend: `Eingestempelt seit ${laufend?.seit} Uhr`, pausiert: 'Pause' }[zustand];

  return (
    <div className="stempel">
      <div className="stempel-zeile">
        <span className={`stempel-punkt stempel-punkt--${zustand}`} />
        <span className="stempel-status">{text}</span>
      </div>
      <div className="stempel-uhr">{laufend ? uhr(sek) : stunden(p.heuteSekunden).replace(' h', '')}</div>
      <div className="stempel-sub">{laufend ? 'aktueller Eintrag' : 'heute erfasst'}</div>
      <div className="stempel-knoepfe">
        {!laufend && <button className="dbtn dbtn--primaer" disabled={busy} onClick={() => aktion('/api/zeit/start')}>Einstempeln</button>}
        {zustand === 'laufend' && <button className="dbtn" disabled={busy} onClick={() => aktion(`/api/zeit/${laufend.id}/pause`)}>Pause</button>}
        {zustand === 'pausiert' && <button className="dbtn dbtn--primaer" disabled={busy} onClick={() => aktion(`/api/zeit/${laufend.id}/fortsetzen`)}>Weiter</button>}
        {laufend && <button className="dbtn" disabled={busy} onClick={() => aktion(`/api/zeit/${laufend.id}/stop`)}>Ausstempeln</button>}
      </div>
      {fehler && <div className="stempel-fehler">{fehler}</div>}
    </div>
  );
}

/** Zeitleiste: eine Zeile je Projekt, Balken ueber die Tage des Monats. */
function Zeitleiste({ jahr, monat, projekte }) {
  const tage = new Date(jahr, monat, 0).getDate();
  const heute = new Date();
  const heuteTag = (heute.getFullYear() === jahr && heute.getMonth() + 1 === monat)
    ? heute.getDate() : null;

  if (!projekte.length) {
    return <div style={{ fontSize: '13px', color: 'var(--text3)', padding: '24px 0' }}>
      Keine Projekte in diesem Monat.
    </div>;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: '520px' }}>
        {/* Tagesleiste */}
        <div style={{
          display: 'grid', gridTemplateColumns: `140px repeat(${tage}, 1fr)`,
          gap: '1px', marginBottom: '4px',
        }}>
          <div />
          {Array.from({ length: tage }, (_, i) => (
            <div key={i} style={{
              fontSize: '9px', textAlign: 'center', color: heuteTag === i + 1 ? 'var(--r)' : 'var(--text3)',
              fontWeight: heuteTag === i + 1 ? 700 : 400,
            }}>{i + 1}</div>
          ))}
        </div>

        {projekte.map((p) => {
          const von = new Date(p.von);
          const bis = new Date(p.bis);
          const start = (von.getFullYear() === jahr && von.getMonth() + 1 === monat) ? von.getDate() : 1;
          const ende  = (bis.getFullYear() === jahr && bis.getMonth() + 1 === monat) ? bis.getDate() : tage;
          const farbe = p.farbe || 'var(--r)';
          return (
            <div key={p.id} style={{
              display: 'grid', gridTemplateColumns: `140px repeat(${tage}, 1fr)`,
              gap: '1px', alignItems: 'center', marginBottom: '3px',
            }}>
              <div style={{
                fontSize: '11.5px', color: 'var(--text2)', paddingRight: '8px',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }} title={p.name}>{p.name}</div>
              {(() => {
                const stil = {
                  gridColumn: `${start + 1} / ${ende + 2}`,
                  background: farbe, borderRadius: '3px', height: '18px',
                  display: 'flex', alignItems: 'center', paddingLeft: '5px',
                  fontSize: '10px', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden',
                  textDecoration: 'none',
                };
                const titel = `${p.name}\n${dat(p.von)} – ${dat(p.bis)}\n${p.status}`
                  + (p.link ? '\n\nKlicken öffnet das Projekt in Rentman' : '');
                const inhalt = ende - start >= 3 ? `${dat(p.von)} – ${dat(p.bis)}` : '';
                return p.link
                  ? <a href={p.link} target="_blank" rel="noreferrer"
                       style={{ ...stil, cursor: 'pointer' }} title={titel}>{inhalt}</a>
                  : <div style={stil} title={titel}>{inhalt}</div>;
              })()}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NotizenKarte() {
  const [notizen, setNotizen] = useState(null);
  const [text, setText] = useState('');
  const [speichert, setSpeichert] = useState(false);
  const laden = () => fetch('/api/notes')
    .then(r => r.ok ? r.json() : [])
    .then(d => setNotizen(Array.isArray(d) ? d : []))
    .catch(() => setNotizen({ fehler: true }));
  useEffect(() => { laden(); }, []);
  const anlegen = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSpeichert(true);
    fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.trim() }),
    }).then(() => { setText(''); laden(); }).finally(() => setSpeichert(false));
  };
  const erledigt = (n) => {
    fetch(`/api/notes/${n.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: true }),
    }).then(laden);
  };
  const offene = Array.isArray(notizen) ? notizen.filter(n => !n.done) : [];
  return (
    <div style={karte}>
      <div style={ueberschrift}>Notizen</div>
      <form onSubmit={anlegen} style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Neue Notiz…"
          style={{
            flex: 1, fontSize: '12.5px', padding: '7px 9px', borderRadius: '6px',
            border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text1)',
          }} />
        <button type="submit" disabled={speichert || !text.trim()} style={{
          fontSize: '12px', padding: '0 12px', borderRadius: '6px', border: 'none',
          background: 'var(--r)', color: '#fff', cursor: 'pointer',
        }}>+</button>
      </form>
      {!notizen && <div style={{ fontSize: '13px', color: 'var(--text3)' }}>lädt…</div>}
      {notizen?.fehler && <div style={{ fontSize: '12px', color: 'var(--text3)' }}>nicht abrufbar</div>}
      {notizen && !notizen.fehler && offene.length === 0 && (
        <div style={{ fontSize: '12.5px', color: 'var(--text3)' }}>Keine offenen Notizen.</div>
      )}
      {offene.map(n => (
        <div key={n.id} style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '6px 0', borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: '12.5px', color: 'var(--text1)', flex: 1 }}>{n.text}</span>
          <button onClick={() => erledigt(n)} style={{
            fontSize: '10.5px', padding: '2px 8px', borderRadius: '9px', whiteSpace: 'nowrap',
            background: 'var(--bg3)', color: 'var(--text3)', border: '1px solid var(--border)', cursor: 'pointer',
          }}>Erledigt</button>
        </div>
      ))}
    </div>
  );
}


// Offene Punkte aus den Kacheln — nur, was die Rolle sieht und was etwas zu tun hat
function aufgabenAus(k, p) {
  const n = (x, eins, viele) => `${x} ${x === 1 ? eins : viele}`;
  const liste = [];
  if (k.offeneAntraege > 0) liste.push({ ziel: '/hr/urlaubskalender', text: n(k.offeneAntraege, 'Urlaubsantrag wartet', 'Urlaubsanträge warten') + ' auf Freigabe', ton: 'warn' });
  if (k.bestellungenOhneSer > 0) liste.push({ ziel: '/finance/bestellungen', text: n(k.bestellungenOhneSer, 'Bestellung', 'Bestellungen') + ' nicht an SER übertragen', ton: 'warn' });
  if (k.bestellungenSerOffen > 0) liste.push({ ziel: '/finance/bestellungen', text: n(k.bestellungenSerOffen, 'Bestellung', 'Bestellungen') + ' bei SER noch offen', ton: 'amber' });
  if (k.metallEingangNeu > 0) liste.push({ ziel: '/metallarbeiten/eingang', text: n(k.metallEingangNeu, 'neue Anfrage', 'neue Anfragen') + ' im Eingang', ton: 'warn' });
  if (k.metallBelegeOffen > 0) liste.push({ ziel: '/metallarbeiten/zuordnen', text: n(k.metallBelegeOffen, 'Beleg', 'Belege') + ' zuordnen', ton: 'amber' });
  const s = k.server;
  if (s && Math.max(s.ram || 0, s.last || 0, s.disk || 0) >= 90) liste.push({ ziel: '/it/system', text: 'Server-Auslastung über 90 %', ton: 'warn' });
  const werktag = new Date().getDay() % 6 !== 0;
  if (p?.zeitQuelle === 'portal' && !p.laufend && !p.heuteSekunden && werktag && new Date().getHours() >= 7) {
    liste.push({ text: 'Heute noch nicht eingestempelt', ton: 'amber' });
  }
  return liste;
}

export default function Dashboard() {
  const { user, hasArea, hasTag } = useAuth();
  const jetzt = new Date();
  // Projekte aus Rentman sieht jeder; die Seite Zeltprojekte nur mit eigenem Bereich
  const zeltSeite = hasArea('zeltverleih.projekte') ? '/zeltverleih/projekte' : undefined;
  const darfGas = hasArea('gashandel');
  const darfZelte = hasArea('zeltverleih.projekte'); // Zeltprojekte/-kacheln nur mit eigenem Bereich

  const [daten, setDaten] = useState(null);
  const [abwesend, setAbwesend] = useState(null);
  const [kalJahr, setKalJahr] = useState(jetzt.getFullYear());
  const [kalMonat, setKalMonat] = useState(jetzt.getMonth() + 1);
  const [kalender, setKalender] = useState(null);
  const [naechste, setNaechste] = useState(null);
  const [bestellungen, setBestellungen] = useState(null);
  const [doku, setDoku] = useState(null);
  const [uhrzeit, setUhrzeit] = useState(jetzt);

  const hol = (pfad, setzen) => fetch(pfad)
    .then(r => r.ok ? r.json() : null)
    .then(d => setzen(d || { fehler: true }))
    .catch(() => setzen({ fehler: true }));

  const ladeDaten = useCallback(() => hol('/api/dashboard', setDaten), []);

  // Kennzahlen jede Minute frisch; Uhr im Kopf läuft mit
  useEffect(() => {
    ladeDaten();
    const t = setInterval(() => { if (!document.hidden) ladeDaten(); }, 60000);
    return () => clearInterval(t);
  }, [ladeDaten]);
  useEffect(() => {
    const t = setInterval(() => setUhrzeit(new Date()), 15000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { hol('/api/dashboard/abwesend', setAbwesend); }, []);
  useEffect(() => { hol('/api/dashboard/doku', setDoku); }, []);
  useEffect(() => {
    if (darfZelte) hol('/api/dashboard/projekte/naechste?limit=10', setNaechste);
  }, [darfZelte]);
  useEffect(() => {
    if (darfGas) hol('/api/dashboard/bestellungen?limit=10', setBestellungen);
  }, [darfGas]);

  const holKalender = useCallback(() => {
    if (!darfZelte) return;
    setKalender(null);
    hol(`/api/dashboard/projekte?jahr=${kalJahr}&monat=${kalMonat}`, setKalender);
  }, [kalJahr, kalMonat, darfZelte]);
  useEffect(() => { holKalender(); }, [holKalender]);

  const blaettern = (schritt) => {
    let m = kalMonat + schritt, j = kalJahr;
    if (m < 1) { m = 12; j -= 1; }
    if (m > 12) { m = 1; j += 1; }
    setKalMonat(m); setKalJahr(j);
  };

  const k = daten?.kacheln || {};
  const p = daten?.persoenlich;
  const vorname = (user?.fullName || '').split(' ')[0];
  const stunde = uhrzeit.getHours();
  const gruss = stunde < 11 ? 'Guten Morgen' : stunde < 18 ? 'Guten Tag' : 'Guten Abend';
  const aufgaben = daten ? aufgabenAus(k, p) : [];
  // wie im Backend: Geschäftsführung und Backoffice sehen alle Projekttypen, sonst nur Zelte
  const nurZelte = !(hasTag('geschaeftsfuehrung') || hasTag('backoffice'));

  // ── Kacheln: zuerst „Mein Tag“, dann je Bereich, den die Rolle sieht ─────
  const meinTag = [];
  if (p) {
    const laufendSek = p.laufend ? p.laufend.sekunden : 0;
    meinTag.push(<Kachel key="heute" icon="uhr" label="Heute erfasst" wert={stunden(p.heuteSekunden + laufendSek)}
      sub={p.laufend ? (p.laufend.status === 'pausiert' ? 'gerade Pause' : 'Uhr läuft') : 'abgeschlossene Einträge'} ziel="/zeit" />);
    meinTag.push(<Kachel key="woche" icon="woche" label="Diese Woche" wert={stunden(p.wocheSekunden + laufendSek)} sub="seit Montag" ziel="/zeit" />);
    if (p.gleitzeit) {
      meinTag.push(<Kachel key="gleit" icon="waage" label="Gleitzeitkonto" wert={p.gleitzeit.anzeige}
        sub={p.gleitzeit.minuten < 0 ? 'im Minus' : 'Saldo'} ton={p.gleitzeit.minuten < 0 ? 'minus' : 'ok'} ziel="/zeit" />);
    }
    const u = p.naechsterUrlaub;
    meinTag.push(<Kachel key="urlaub" icon="sonne" label="Nächste Abwesenheit"
      wert={u ? `${datKurz(u.von)}${u.bis !== u.von ? ' – ' + datKurz(u.bis) : ''}` : 'keine geplant'}
      sub={u ? `${u.art === 'gleitzeitabbau' ? 'Gleitzeitabbau' : 'Urlaub'} · ${u.status === 'pending' ? 'beantragt' : 'genehmigt'}` : 'Urlaub beantragen →'}
      ziel="/urlaub" />);
  }

  const bereich = [];
  if (naechste && !naechste.fehler) {
    bereich.push(<Kachel key="zw" icon="zelt" label={nurZelte ? 'Zelte diese Woche' : 'Projekte diese Woche'} wert={naechste.dieseWoche} sub="im Mietzeitraum" ziel={zeltSeite} />);
    bereich.push(<Kachel key="z14" icon="zelt" label="Nächste 14 Tage" wert={naechste.naechste14} sub={nurZelte ? 'Zeltprojekte' : 'Projekte'} ziel={zeltSeite} />);
  }
  if (k.bestellungenOhneSer !== undefined) {
    bereich.push(<Kachel key="ser" icon="senden" label="Nicht an SER" wert={k.bestellungenOhneSer} ziel="/finance/bestellungen" ton="warn" sub="Gasbestellungen" />);
    bereich.push(<Kachel key="sero" icon="warten" label="SER offen" wert={k.bestellungenSerOffen} ziel="/finance/bestellungen" ton="amber" sub="übermittelt, ohne Rückmeldung" />);
    if (k.bestellungenOffen !== undefined) bereich.push(<Kachel key="offen" icon="paket" label="Offene Bestellungen" wert={k.bestellungenOffen} ziel="/finance/bestellungen" sub="noch nicht erledigt" />);
  }
  if (k.metallEingangNeu !== undefined) {
    bereich.push(<Kachel key="me" icon="eingang" label="Neu im Eingang" wert={k.metallEingangNeu} ziel="/metallarbeiten/eingang" ton="warn" sub="Kundenanfragen" />);
    bereich.push(<Kachel key="mb" icon="beleg" label="Belege zuordnen" wert={k.metallBelegeOffen} ziel="/metallarbeiten/zuordnen" ton="amber" sub="aus Lexware" />);
  }
  if (k.offeneAntraege !== undefined) bereich.push(<Kachel key="ua" icon="antrag" label="Offene Urlaubsanträge" wert={k.offeneAntraege} ziel="/hr/urlaubskalender" ton="warn" sub="warten auf Freigabe" />);
  if (k.mitarbeiter !== undefined) bereich.push(<Kachel key="ma" icon="team" label="Mitarbeiter aktiv" wert={k.mitarbeiter} ziel="/hr/mitarbeiter" />);
  if (k.jetztEingestempelt !== undefined) bereich.push(<Kachel key="ein" icon="stempel" label="Gerade eingestempelt" wert={k.jetztEingestempelt} ziel="/hr/zeiterfassung" sub="Kolleginnen und Kollegen" />);
  if (k.server) {
    const s = k.server;
    const max = Math.max(s.ram || 0, s.last || 0, s.disk || 0);
    bereich.push(<Kachel key="srv" icon="server" label="Server" wert={`${max} %`} sub={`RAM ${s.ram} % · Last ${s.last} % · Disk ${s.disk ?? '–'} %`}
      ziel="/it/system" ton={max >= 85 ? 'warn' : 'ok'} />);
  }

  const schnell = [
    ['/urlaub', 'Urlaubsantrag stellen'],
    ['/zeit', 'Meine Zeiterfassung'],
    zeltSeite && [zeltSeite, 'Zeltprojekte'],
    hasArea('zeltplanung') && ['/zeltverleih/zeltplaner', 'Zeltplaner'],
    darfGas && ['/finance/kunden', 'Gas-Kunden'],
    darfGas && ['/finance/bestellungen', 'Gasbestellungen'],
    hasArea('metallarbeiten.vorgaenge') && ['/metallarbeiten/vorgaenge', 'Maschinenbau-Aufträge'],
    hasArea('hr.urlaubskalender') && ['/hr/urlaubskalender', 'Urlaubskalender'],
    hasArea('hr.zeitauswertung') && ['/hr/zeiterfassung', 'Zeitauswertung'],
    hasArea('it') && ['/it/system', 'IT-Dashboards'],
    ['/profil', 'Profil & Daten'],
  ].filter(Boolean);

  const zeigeRechts = !!bestellungen?.bestellungen || hasArea('notizen') || doku?.seiten?.length > 0;
  const rasterKlasse = 'dash-grid' + (darfZelte ? ' dash-mit-projekten' : ' dash-ohne-projekte') + (zeigeRechts ? ' dash-drei' : '');

  return (
    <div style={{ padding: '20px 24px', maxWidth: '1900px' }}>
      {/* Kopf: Begrüßung, offene Punkte, Stempeluhr */}
      <div className="dash-hero dash-auftritt">
        <div className="dash-hero-text">
          <div className="dash-hero-datum">
            {uhrzeit.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
            <span className="dash-hero-uhr">{uhrzeit.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <div className="dash-hero-gruss">{gruss}, {vorname || 'willkommen'}</div>
          <div className="dash-aufgaben">
            {daten && aufgaben.length === 0 && <span className="dash-chip dash-chip--ok">Alles erledigt — nichts Offenes in deinen Bereichen</span>}
            {aufgaben.map((a, i) => {
              const inhalt = <><span className={`dash-chip-punkt dash-chip-punkt--${a.ton}`} />{a.text}</>;
              return a.ziel
                ? <Link key={i} to={a.ziel} className="dash-chip">{inhalt}</Link>
                : <span key={i} className="dash-chip">{inhalt}</span>;
            })}
          </div>
        </div>
        {p?.zeitQuelle === 'portal' && <Stempeluhr p={p} onGeaendert={ladeDaten} />}
      </div>

      {meinTag.length > 0 && (
        <>
          <div className="dash-gruppe">Mein Tag</div>
          <div className="dash-kacheln">{meinTag.map((el, i) => cloneElement(el, { nr: i }))}</div>
        </>
      )}
      {bereich.length > 0 && (
        <>
          <div className="dash-gruppe">Meine Bereiche</div>
          <div className="dash-kacheln">{bereich.map((el, i) => cloneElement(el, { nr: i + meinTag.length }))}</div>
        </>
      )}

      <div className={rasterKlasse} style={{ marginTop: '16px' }}>
        {/* Links: Schnellzugriff, Anträge, Abwesenheiten */}
        <div className="dash-spalte">
          <div style={karte}>
            <div style={ueberschrift}>Schnellzugriff</div>
            <div className="dash-schnell">
              {schnell.map(([ziel, text]) => <Link key={ziel} to={ziel} className="dash-schnell-link">{text}</Link>)}
            </div>
          </div>

          <div style={karte}>
            <div style={ueberschrift}>Meine letzten Anträge</div>
            {!daten?.meineAntraege?.length && (
              <div style={{ fontSize: '13px', color: 'var(--text3)' }}>Keine Anträge vorhanden.</div>
            )}
            {daten?.meineAntraege?.map(a => (
              <div key={a.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: '12.5px',
              }}>
                <span style={{ color: 'var(--text2)' }}>
                  {dat(a.start_date)} – {dat(a.end_date)}
                  <span style={{ color: 'var(--text3)', marginLeft: '6px' }}>{a.art === 'gleitzeitabbau' ? 'Gleitzeitabbau · ' : ''}{a.abbau_von ? `${String(a.abbau_von).slice(0, 5)}–${String(a.abbau_bis).slice(0, 5)} Uhr` : `${a.days_count} Tage`}</span>
                </span>
                <span style={{
                  fontSize: '11px', padding: '2px 8px', borderRadius: '10px',
                  background: 'var(--bg3)',
                  color: (ANTRAG_STATUS[a.status] || {}).farbe || 'var(--text2)',
                }}>{(ANTRAG_STATUS[a.status] || {}).text || a.status}</span>
              </div>
            ))}
            <Link to="/urlaub" style={{ fontSize: '12px', color: 'var(--r)', textDecoration: 'none', display: 'inline-block', marginTop: '9px' }}>
              Alle anzeigen →
            </Link>
          </div>

          <div style={karte}>
            <div style={{ ...ueberschrift, marginBottom: '8px' }}>Diese Woche abwesend</div>
            {!abwesend && <div style={{ fontSize: '13px', color: 'var(--text3)' }}>lädt…</div>}
            {abwesend?.fehler && <div style={{ fontSize: '12px', color: 'var(--text3)' }}>nicht abrufbar</div>}
            {abwesend?.abwesend?.length === 0 && (
              <div style={{ fontSize: '12.5px', color: 'var(--text3)' }}>Keine Abwesenheiten erfasst</div>
            )}
            {abwesend?.abwesend?.map((a, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text1)', padding: '4px 0' }}>
                <span className="dash-avatar">{a.name.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase()}</span>
                <span style={{ flex: 1 }}>{a.name}</span>
                <span style={{ fontSize: '11px', color: 'var(--text3)' }}>{a.typ} · bis {datKurz(a.bis)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Mitte: Projekte aus Rentman, nur mit Bereich zeltverleih.projekte (ohne GF/Backoffice nur Zelte) */}
        {darfZelte && (
          <div className="dash-spalte">
            <div style={karte}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ ...ueberschrift, marginBottom: 0 }}>{nurZelte ? 'Zeltprojekte' : 'Projekte'} — Mietzeiträume</div>
                <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                  <button onClick={() => blaettern(-1)} style={blaetterKnopf} aria-label="Vormonat">‹</button>
                  <span style={{ fontSize: '12.5px', color: 'var(--text1)', minWidth: '110px', textAlign: 'center' }}>
                    {MONATE[kalMonat - 1]} {kalJahr}
                  </span>
                  <button onClick={() => blaettern(1)} style={blaetterKnopf} aria-label="Folgemonat">›</button>
                  <button onClick={() => { setKalJahr(jetzt.getFullYear()); setKalMonat(jetzt.getMonth() + 1); }}
                    style={{ ...blaetterKnopf, width: 'auto', padding: '0 9px' }}>Heute</button>
                </div>
              </div>
              {!kalender && <div style={{ fontSize: '13px', color: 'var(--text3)' }}>lädt…</div>}
              {kalender?.fehler && <div style={{ fontSize: '13px', color: 'var(--red2)' }}>Rentman nicht erreichbar</div>}
              {kalender?.projekte && (
                <Zeitleiste jahr={kalender.jahr} monat={kalender.monat} projekte={kalender.projekte} />
              )}
            </div>

            <div style={karte}>
              <div style={ueberschrift}>{nurZelte ? 'Nächste Zeltprojekte' : 'Nächste Projekte'}</div>
              {!naechste && <div style={{ fontSize: '13px', color: 'var(--text3)' }}>lädt…</div>}
              {naechste?.fehler && <div style={{ fontSize: '13px', color: 'var(--red2)' }}>Rentman nicht erreichbar</div>}
              {naechste?.projekte?.length === 0 && (
                <div style={{ fontSize: '13px', color: 'var(--text3)' }}>Keine anstehenden Projekte.</div>
              )}
              {naechste?.projekte?.map(pr => {
                const Zeile = pr.link ? 'a' : 'div';
                return (
                  <Zeile key={pr.id}
                    {...(pr.link ? { href: pr.link, target: '_blank', rel: 'noreferrer', title: 'In Rentman öffnen' } : {})}
                    className={'dash-projekt' + (pr.link ? ' dash-projekt--link' : '')}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: pr.farbe || 'var(--r)', flexShrink: 0 }} />
                    <span style={{ fontSize: '12.5px', color: 'var(--text1)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {pr.name}
                    </span>
                    <span style={{ fontSize: '11.5px', color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                      {dat(pr.von)} – {dat(pr.bis)}
                    </span>
                    <span style={{
                      fontSize: '10.5px', padding: '2px 7px', borderRadius: '9px',
                      background: 'var(--bg3)', color: 'var(--text3)', whiteSpace: 'nowrap',
                    }}>{pr.status}</span>
                  </Zeile>
                );
              })}
            </div>
          </div>
        )}

        {/* Rechts: Gasbestellungen, Notizen, Doku */}
        {zeigeRechts && (
          <div className="dash-rechts">
            <div className="dash-spalte">
              {bestellungen?.bestellungen && (
                <div style={karte}>
                  <div style={ueberschrift}>Letzte Gasbestellungen</div>
                  {bestellungen.bestellungen.map(b => (
                    <div key={b.id} style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '8px 0', borderBottom: '1px solid var(--border)',
                    }}>
                      <span style={{ fontSize: '12.5px', color: 'var(--text1)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {b.kunde}
                        <span style={{ color: 'var(--text3)', marginLeft: '6px', fontSize: '11px' }}>{b.kundennummer}</span>
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                        {Number(b.betrag).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                      </span>
                      {(() => {
                        const zustand = b.storniert ? 'storniert'
                                       : b.serStatus === 'ok' ? 'ok'
                                       : b.serStatus === 'pending' ? 'pending' : 'offen';
                        const text = { storniert: 'storniert', ok: 'SER ok', pending: 'übermittelt, offen', offen: 'nicht übertragen' }[zustand];
                        const bg = { storniert: 'var(--bg3)', ok: 'var(--bg3)', pending: 'var(--amber)', offen: 'var(--r)' }[zustand];
                        const farbe = { storniert: 'var(--text3)', ok: 'var(--text3)', pending: '#fff', offen: '#fff' }[zustand];
                        return (
                          <span style={{
                            fontSize: '10.5px', padding: '2px 7px', borderRadius: '9px', whiteSpace: 'nowrap',
                            background: bg, color: farbe, opacity: b.storniert ? 0.7 : 1,
                          }} title={b.serFehler || ''}>{text}</span>
                        );
                      })()}
                    </div>
                  ))}
                  <Link to="/finance/bestellungen" style={{ fontSize: '12px', color: 'var(--r)', textDecoration: 'none', display: 'inline-block', marginTop: '9px' }}>
                    Alle Bestellungen →
                  </Link>
                </div>
              )}
              {hasArea('notizen') && <NotizenKarte />}
              {doku?.seiten?.length > 0 && (
                <div style={karte}>
                  <div style={ueberschrift}>Zuletzt in der Doku geändert</div>
                  {doku.seiten.map(s => (
                    <a key={s.id} href={s.url} target="_blank" rel="noreferrer" style={{
                      display: 'block', padding: '5px 0', fontSize: '12.5px',
                      color: 'var(--text2)', textDecoration: 'none',
                    }}>
                      {s.name}
                      <span style={{ color: 'var(--text3)', fontSize: '11px', marginLeft: '6px' }}>{dat(s.geaendert)}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes dashAuftritt { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .dash-auftritt { animation: dashAuftritt .35s ease both; }
        @media (prefers-reduced-motion: reduce) { .dash-auftritt { animation: none; } }

        .dash-hero { display: flex; gap: 20px; align-items: stretch; justify-content: space-between; flex-wrap: wrap;
          padding: 20px 22px; border-radius: 12px; border: 1px solid var(--border); margin-bottom: 18px;
          background: radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--r) 16%, var(--bg1)) 0%, var(--bg1) 55%); }
        .dash-hero-text { flex: 1 1 360px; min-width: 0; }
        .dash-hero-datum { font-size: 12px; color: var(--text2); display: flex; gap: 10px; align-items: baseline; }
        .dash-hero-uhr { font-family: 'DM Mono', monospace; color: var(--text3); font-variant-numeric: tabular-nums; }
        .dash-hero-gruss { font-size: 22px; font-weight: 700; color: var(--text1); margin: 2px 0 12px; text-wrap: balance; }
        .dash-aufgaben { display: flex; flex-wrap: wrap; gap: 6px; }
        .dash-chip { display: inline-flex; align-items: center; gap: 7px; padding: 5px 11px; border-radius: 999px;
          background: var(--bg2); border: 1px solid var(--border); color: var(--text1); font-size: 12.5px; text-decoration: none;
          transition: border-color .15s, transform .15s; }
        a.dash-chip:hover { border-color: var(--r); }
        a.dash-chip:active { transform: scale(.97); }
        .dash-chip--ok { color: var(--text2); }
        .dash-chip-punkt { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
        .dash-chip-punkt--warn { background: var(--r); box-shadow: 0 0 0 3px color-mix(in srgb, var(--r) 25%, transparent); }
        .dash-chip-punkt--amber { background: var(--amber); }

        .stempel { flex: 0 0 240px; background: var(--bg2); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; display: flex; flex-direction: column; }
        .stempel-zeile { display: flex; align-items: center; gap: 7px; font-size: 12px; color: var(--text2); }
        .stempel-punkt { width: 8px; height: 8px; border-radius: 50%; background: var(--text3); }
        .stempel-punkt--laufend { background: var(--green); animation: stempelPuls 1.6s ease-in-out infinite; }
        .stempel-punkt--pausiert { background: var(--amber); }
        @keyframes stempelPuls { 0%,100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--green) 55%, transparent); } 50% { box-shadow: 0 0 0 5px transparent; } }
        @media (prefers-reduced-motion: reduce) { .stempel-punkt--laufend { animation: none; } }
        .stempel-uhr { font-family: 'DM Mono', monospace; font-size: 28px; font-weight: 500; color: var(--text1); font-variant-numeric: tabular-nums; margin-top: 6px; line-height: 1.1; }
        .stempel-sub { font-size: 11px; color: var(--text3); margin-bottom: 10px; }
        .stempel-knoepfe { display: flex; gap: 6px; margin-top: auto; }
        .stempel-fehler { font-size: 11.5px; color: var(--red2); margin-top: 6px; }
        .dbtn { flex: 1; font: inherit; font-size: 12.5px; font-weight: 600; padding: 7px 10px; border-radius: 7px; cursor: pointer;
          border: 1px solid var(--border); background: var(--bg1); color: var(--text1); transition: background .12s, transform .12s; }
        .dbtn:hover { background: var(--bg3); }
        .dbtn:active { transform: scale(.96); }
        .dbtn:disabled { opacity: .6; cursor: default; }
        .dbtn--primaer { background: var(--r); border-color: var(--r); color: #fff; }
        .dbtn--primaer:hover { background: var(--r2); }

        .dash-gruppe { font-size: 11px; font-weight: 700; color: var(--text3); text-transform: uppercase; letter-spacing: .08em; margin: 4px 0 8px; }
        .dash-kacheln { display: grid; gap: 12px; margin-bottom: 14px; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); }
        .dk { position: relative; overflow: hidden; background: var(--bg1); border: 1px solid var(--border); border-radius: 9px; padding: 14px 16px; display: block; text-decoration: none; }
        .dk--link { transition: border-color .15s, transform .15s; }
        .dk--link:hover { border-color: var(--r); transform: translateY(-1px); }
        .dk--link:active { transform: scale(.98); }
        .dk-kopf { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
        .dk-icon { width: 28px; height: 28px; border-radius: 7px; display: flex; align-items: center; justify-content: center; background: var(--bg2); color: var(--text2); flex-shrink: 0; }
        .dk-label { font-size: 11px; font-weight: 700; color: var(--text3); text-transform: uppercase; letter-spacing: .06em; line-height: 1.25; }
        .dk-wert { font-size: 24px; font-weight: 700; color: var(--text1); line-height: 1.15; font-variant-numeric: tabular-nums; }
        .dk-sub { font-size: 11.5px; color: var(--text3); margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .dk-streifen { position: absolute; left: 0; top: 0; bottom: 0; width: 3px; }

        .dash-spalte { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
        .dash-schnell { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; }
        .dash-schnell-link { display: block; padding: 9px 11px; background: var(--bg2); border: 1px solid var(--border); border-radius: 6px;
          font-size: 13px; color: var(--text1); text-decoration: none; transition: border-color .15s; }
        .dash-schnell-link:hover { border-color: var(--r); }
        .dash-avatar { width: 24px; height: 24px; border-radius: 50%; background: var(--bg3); color: var(--text2); font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .dash-projekt { display: flex; align-items: center; gap: 10px; padding: 8px 4px; border-bottom: 1px solid var(--border); text-decoration: none; border-radius: 5px; transition: background .12s; }
        .dash-projekt--link:hover { background: var(--bg2); }

        .dash-grid { display: grid; gap: 16px; grid-template-columns: 1fr; }
        .dash-rechts { grid-column: 1 / -1; }
        @media (min-width: 900px) {
          .dash-grid.dash-mit-projekten { grid-template-columns: minmax(250px, 1fr) minmax(420px, 2fr); }
          .dash-grid.dash-ohne-projekte { grid-template-columns: 1fr 1fr; }
          .dash-grid.dash-ohne-projekte .dash-rechts { grid-column: auto; }
        }
        @media (min-width: 1500px) {
          .dash-grid.dash-mit-projekten.dash-drei { grid-template-columns: minmax(250px, 0.85fr) minmax(500px, 2fr) minmax(300px, 1fr); }
          .dash-grid.dash-drei .dash-rechts { grid-column: auto; }
        }
      `}</style>
    </div>
  );
}

const blaetterKnopf = {
  width: '26px', height: '26px', borderRadius: '6px',
  border: '1px solid var(--border)', background: 'var(--bg2)',
  color: 'var(--text2)', cursor: 'pointer', fontSize: '14px',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
