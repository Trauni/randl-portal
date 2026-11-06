import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
                'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

const dat = (iso) => iso ? new Date(iso).toLocaleDateString('de-DE',
  { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';

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

function Kachel({ label, wert, ziel, ton }) {
  const inhalt = (
    <>
      <div style={{ ...ueberschrift, marginBottom: '6px' }}>{label}</div>
      <div style={{
        fontSize: '26px', fontWeight: 700, lineHeight: 1.1,
        color: ton === 'warn' && wert > 0 ? 'var(--r)' : ton === 'amber' && wert > 0 ? 'var(--amber)' : 'var(--text1)',
      }}>{wert ?? '—'}</div>
    </>
  );
  if (!ziel) return <div style={karte}>{inhalt}</div>;
  return (
    <Link to={ziel} style={{ ...karte, textDecoration: 'none', display: 'block', transition: 'border-color .15s' }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--r)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
      {inhalt}
    </Link>
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

export default function Dashboard() {
  const { user, hasArea } = useAuth();
  const jetzt = new Date();

  const [daten, setDaten] = useState(null);
  const [abwesend, setAbwesend] = useState(null);
  const [kalJahr, setKalJahr] = useState(jetzt.getFullYear());
  const [kalMonat, setKalMonat] = useState(jetzt.getMonth() + 1);
  const [kalender, setKalender] = useState(null);
  const [naechste, setNaechste] = useState(null);
  const [bestellungen, setBestellungen] = useState(null);
  const [doku, setDoku] = useState(null);

  const hol = (pfad, setzen) => fetch(pfad)
    .then(r => r.ok ? r.json() : null)
    .then(d => setzen(d || { fehler: true }))
    .catch(() => setzen({ fehler: true }));

  useEffect(() => { hol('/api/dashboard', setDaten); }, []);
  useEffect(() => { hol('/api/dashboard/abwesend', setAbwesend); }, []);
  useEffect(() => { hol('/api/dashboard/projekte/naechste?limit=10', setNaechste); }, []);
  useEffect(() => { hol('/api/dashboard/doku', setDoku); }, []);
  useEffect(() => {
    if (hasArea('gashandel')) hol('/api/dashboard/bestellungen?limit=10', setBestellungen);
  }, [hasArea]);

  const holKalender = useCallback(() => {
    setKalender(null);
    hol(`/api/dashboard/projekte?jahr=${kalJahr}&monat=${kalMonat}`, setKalender);
  }, [kalJahr, kalMonat]);
  useEffect(() => { holKalender(); }, [holKalender]);

  const blaettern = (schritt) => {
    let m = kalMonat + schritt, j = kalJahr;
    if (m < 1) { m = 12; j -= 1; }
    if (m > 12) { m = 1; j += 1; }
    setKalMonat(m); setKalJahr(j);
  };

  const k = daten?.kacheln || {};
  const vorname = (user?.fullName || '').split(' ')[0];
  const stunde = jetzt.getHours();
  const gruss = stunde < 11 ? 'Guten Morgen' : stunde < 18 ? 'Guten Tag' : 'Guten Abend';

  return (
    <div style={{ padding: '20px 24px', maxWidth: '1900px' }}>
      {/* Begrüßung */}
      <div style={{ ...karte, borderLeft: '3px solid var(--r)', marginBottom: '16px' }}>
        <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text1)' }}>
          {gruss}, {vorname || 'willkommen'}
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '2px' }}>
          {jetzt.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      </div>

      {/* Kacheln */}
      <div style={{
        display: 'grid', gap: '12px', marginBottom: '16px',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      }}>
        {k.mitarbeiter !== undefined && (
          <Kachel label="Mitarbeiter (aktiv)" wert={k.mitarbeiter} ziel="/hr/mitarbeiter" />
        )}
        {k.offeneAntraege !== undefined && (
          <Kachel label="Offene Urlaubsanträge" wert={k.offeneAntraege} ziel="/hr/urlaubskalender" ton="warn" />
        )}
        {k.bestellungenOhneSer !== undefined && (
          <Kachel label="Nicht an SER übertragen" wert={k.bestellungenOhneSer} ziel="/finance/bestellungen" ton="warn" />
        )}
        {k.bestellungenSerOffen !== undefined && (
          <Kachel label="SER übermittelt, offen" wert={k.bestellungenSerOffen} ziel="/finance/bestellungen" ton="amber" />
        )}
        <div style={karte}>
          <div style={{ ...ueberschrift, marginBottom: '8px' }}>Diese Woche abwesend</div>
          {!abwesend && <div style={{ fontSize: '13px', color: 'var(--text3)' }}>lädt…</div>}
          {abwesend?.fehler && <div style={{ fontSize: '12px', color: 'var(--text3)' }}>nicht abrufbar</div>}
          {abwesend?.abwesend?.length === 0 && (
            <div style={{ fontSize: '12.5px', color: 'var(--text3)' }}>
              Keine Abwesenheiten erfasst
            </div>
          )}
          {abwesend?.abwesend?.map((a, i) => (
            <div key={i} style={{ fontSize: '13px', color: 'var(--text1)', marginBottom: '3px' }}>
              {a.name}
              <span style={{ fontSize: '11px', color: 'var(--text3)', marginLeft: '6px' }}>{a.typ}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Spalten: 1 schmal / 2 ab 900px / 3 ab 1500px sofern Bestellungen sichtbar */}
      <div className={'dash-grid' + (bestellungen?.bestellungen ? ' dash-drei' : '')}>
        {/* Links */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={karte}>
            <div style={ueberschrift}>Schnellzugriff</div>
            {[
              ['/urlaub', 'Urlaubsantrag stellen'],
              ['/zeit', 'Meine Zeiterfassung'],
              ['/profil', 'Profil & Daten'],
              hasArea('gashandel') && ['/finance/kunden', 'Kunden'],
              hasArea('hr.urlaubskalender') && ['/hr/urlaubskalender', 'Urlaubskalender'],
            ].filter(Boolean).map(([ziel, text]) => (
              <Link key={ziel} to={ziel} style={{
                display: 'block', padding: '9px 11px', marginBottom: '6px',
                background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '6px',
                fontSize: '13px', color: 'var(--text1)', textDecoration: 'none',
              }}>{text}</Link>
            ))}
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
                  <span style={{ color: 'var(--text3)', marginLeft: '6px' }}>{a.art === 'gleitzeitabbau' ? 'Gleitzeitabbau · ' : ''}{a.days_count} Tage</span>
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

        {/* Rechts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={karte}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ ...ueberschrift, marginBottom: 0 }}>Projekte — Mietzeiträume</div>
              <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                <button onClick={() => blaettern(-1)} style={blaetterKnopf}>‹</button>
                <span style={{ fontSize: '12.5px', color: 'var(--text1)', minWidth: '110px', textAlign: 'center' }}>
                  {MONATE[kalMonat - 1]} {kalJahr}
                </span>
                <button onClick={() => blaettern(1)} style={blaetterKnopf}>›</button>
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
            <div style={ueberschrift}>Nächste Projekte</div>
            {!naechste && <div style={{ fontSize: '13px', color: 'var(--text3)' }}>lädt…</div>}
            {naechste?.projekte?.length === 0 && (
              <div style={{ fontSize: '13px', color: 'var(--text3)' }}>Keine anstehenden Projekte.</div>
            )}
            {naechste?.projekte?.map(p => {
              const Zeile = p.link ? 'a' : 'div';
              return (
                <Zeile key={p.id}
                  {...(p.link ? { href: p.link, target: '_blank', rel: 'noreferrer', title: 'In Rentman öffnen' } : {})}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '8px 4px', borderBottom: '1px solid var(--border)',
                    textDecoration: 'none', borderRadius: '5px',
                    cursor: p.link ? 'pointer' : 'default', transition: 'background .12s',
                  }}
                  onMouseEnter={e => { if (p.link) e.currentTarget.style.background = 'var(--bg2)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{
                    width: '8px', height: '8px', borderRadius: '50%',
                    background: p.farbe || 'var(--r)', flexShrink: 0,
                  }} />
                  <span style={{ fontSize: '12.5px', color: 'var(--text1)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.name}
                  </span>
                  <span style={{ fontSize: '11.5px', color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                    {dat(p.von)} – {dat(p.bis)}
                  </span>
                  <span style={{
                    fontSize: '10.5px', padding: '2px 7px', borderRadius: '9px',
                    background: 'var(--bg3)', color: 'var(--text3)', whiteSpace: 'nowrap',
                  }}>{p.status}</span>
                </Zeile>
              );
            })}
          </div>

        </div>

        {/* Rechts: Gasbestellungen + Notizen, eigene Spalte ab 1500px */}
        {(bestellungen?.bestellungen || hasArea('notizen')) && (
          <div className="dash-rechts">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
                            background: bg,
                            color: farbe,
                            opacity: b.storniert ? 0.7 : 1,
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
            </div>
          </div>
        )}
      </div>

      <style>{`
        .dash-grid { display: grid; gap: 16px; grid-template-columns: 1fr; }
        .dash-rechts { grid-column: 1 / -1; }
        @media (min-width: 900px) {
          .dash-grid { grid-template-columns: minmax(250px, 1fr) minmax(420px, 2fr); }
        }
        @media (min-width: 1500px) {
          .dash-grid.dash-drei { grid-template-columns: minmax(250px, 0.85fr) minmax(500px, 2fr) minmax(300px, 1fr); }
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
