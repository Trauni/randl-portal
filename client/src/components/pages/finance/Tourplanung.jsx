import { useState, useEffect, useCallback, useMemo } from 'react';

// #518 Tourplanung: Tour anlegen, offene Bestellungen zuordnen, Stopps sortieren, freigeben.
const input = { background:'var(--bg0)', border:'1px solid var(--border)', borderRadius:6, padding:'.35rem .6rem', color:'var(--text1)', fontSize:'.85rem', boxSizing:'border-box', width:'100%' };
const knopf = { background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:6, padding:'.35rem .8rem', color:'var(--text1)', fontSize:'.85rem', cursor:'pointer' };
const karte = { background:'var(--bg1)', border:'1px solid var(--border)', borderRadius:10, padding:'1rem', marginBottom:'1rem' };
const klein = { fontSize:'.75rem', color:'var(--text3)' };

const STATUS = {
  entwurf: { label:'Entwurf', farbe:'var(--text2)' },
  freigegeben: { label:'Freigegeben (gesperrt)', farbe:'var(--green, #2ebd7a)' },
  unterwegs: { label:'Unterwegs', farbe:'var(--blue, #4a7fd4)' },
  beendet: { label:'Beendet', farbe:'var(--text3)' },
  storniert: { label:'Storniert', farbe:'var(--red, #e5484d)' },
};
const heute = () => new Intl.DateTimeFormat('sv-SE', { timeZone:'Europe/Berlin' }).format(new Date());
const datumDe = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('de-DE', { weekday:'short', day:'2-digit', month:'2-digit' });

const api = async (url, methode = 'GET', body) => {
  const r = await fetch(url, { method: methode, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Fehler');
  return d;
};

function StatusMarke({ status }) {
  const s = STATUS[status] || STATUS.entwurf;
  return <span style={{ color:s.farbe, fontSize:'.75rem', fontWeight:600 }}>{s.label}</span>;
}

function NeueTour({ fahrer, basen, onAngelegt, onFehler }) {
  const [f, setF] = useState({ datum: heute(), bezeichnung:'', employeeId:'', fahrzeug:'', ladebasisId:'' });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const anlegen = async () => {
    try {
      const t = await api('/api/fahrer-touren', 'POST', { ...f, employeeId: Number(f.employeeId), ladebasisId: f.ladebasisId ? Number(f.ladebasisId) : null });
      setF((x) => ({ ...x, bezeichnung:'' }));
      onAngelegt(t);
    } catch (e) { onFehler(e.message); }
  };
  return (
    <div style={{ ...karte, display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))', gap:'.6rem', alignItems:'end' }}>
      <label><div style={klein}>Datum</div><input style={input} type="date" value={f.datum} onChange={set('datum')} /></label>
      <label><div style={klein}>Bezeichnung</div><input style={input} placeholder="z. B. Montag Rosenheim" value={f.bezeichnung} onChange={set('bezeichnung')} /></label>
      <label><div style={klein}>Fahrer</div>
        <select style={input} value={f.employeeId} onChange={set('employeeId')}><option value="">wählen …</option>{fahrer.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      <label><div style={klein}>Fahrzeug</div><input style={input} placeholder="RO-DR 101" value={f.fahrzeug} onChange={set('fahrzeug')} /></label>
      <label><div style={klein}>Ladebasis</div>
        <select style={input} value={f.ladebasisId} onChange={set('ladebasisId')}><option value="">keine</option>{basen.filter((b) => b.aktiv).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <button style={knopf} disabled={!f.bezeichnung.trim() || !f.employeeId || !f.datum} onClick={anlegen}>Tour anlegen</button>
    </div>
  );
}

function Stopp({ s, index, anzahl, gesperrt, onHoch, onRunter, onEntfernen, onSpeichern }) {
  const [edit, setEdit] = useState(null);
  return (
    <div style={{ display:'grid', gridTemplateColumns:'2rem 1fr auto', gap:'.6rem', padding:'.6rem 0', borderTop:'1px solid var(--border)' }}>
      <div style={{ color:'var(--text2)', fontWeight:600 }}>{index + 1}</div>
      <div>
        <div style={{ color:'var(--text1)', fontSize:'.9rem' }}>{s.kundeName} <span style={klein}>#{s.kundeNr} · {s.auftragRef}</span></div>
        <div style={klein}>{s.adresse || 'Adresse fehlt'}</div>
        <div style={{ fontSize:'.8rem', color:'var(--text2)', margin:'.15rem 0' }}>{s.positionen.map((p) => `${p.soll}× ${p.artikelNr}`).join(' · ')}</div>
        {edit ? (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr auto', gap:'.4rem', marginTop:'.3rem' }}>
            <input style={input} placeholder="Lieferzeit" value={edit.lieferzeit} onChange={(e) => setEdit((x) => ({ ...x, lieferzeit:e.target.value }))} />
            <input style={input} placeholder="Hinweise" value={edit.hinweise} onChange={(e) => setEdit((x) => ({ ...x, hinweise:e.target.value }))} />
            <button style={knopf} onClick={async () => { await onSpeichern(s, edit); setEdit(null); }}>OK</button>
          </div>
        ) : (
          <div style={klein}>{s.lieferzeit || 'keine Lieferzeit'}{s.hinweise ? ` · ${s.hinweise}` : ''}</div>
        )}
      </div>
      {!gesperrt && !edit && (
        <div style={{ display:'flex', gap:'.3rem', alignItems:'start' }}>
          <button style={knopf} disabled={index === 0} onClick={() => onHoch(s)} title="nach oben">↑</button>
          <button style={knopf} disabled={index === anzahl - 1} onClick={() => onRunter(s)} title="nach unten">↓</button>
          <button style={knopf} onClick={() => setEdit({ lieferzeit: s.lieferzeit || '', hinweise: s.hinweise || '' })}>Ändern</button>
          <button style={knopf} onClick={() => onEntfernen(s)} title="Bestellung wird wieder frei">Entfernen</button>
        </div>
      )}
    </div>
  );
}

function OffeneBestellungen({ offen, auswahl, setAuswahl, onHinzu, aktiv }) {
  const [q, setQ] = useState('');
  const gefiltert = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? offen.filter((b) => `${b.kundeName} ${b.kundeNr} ${b.adresse}`.toLowerCase().includes(s)) : offen;
  }, [offen, q]);
  const umschalten = (id) => setAuswahl((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  return (
    <div style={karte}>
      <div style={{ display:'flex', gap:'.6rem', alignItems:'center', marginBottom:'.5rem' }}>
        <h2 style={{ fontSize:'1rem', color:'var(--text1)', margin:0, flex:1 }}>Offene Bestellungen ({offen.length})</h2>
        <input style={{ ...input, width:180 }} placeholder="Kunde, Ort …" value={q} onChange={(e) => setQ(e.target.value)} />
        <button style={knopf} disabled={!aktiv || !auswahl.length} onClick={onHinzu}>{auswahl.length} zur Tour</button>
      </div>
      {!aktiv && <div style={klein}>Tour im Entwurf wählen, um Bestellungen zuzuordnen.</div>}
      {gefiltert.map((b) => (
        <label key={b.id} style={{ display:'grid', gridTemplateColumns:'1.5rem 1fr auto', gap:'.5rem', padding:'.45rem 0', borderTop:'1px solid var(--border)', cursor: aktiv ? 'pointer' : 'default' }}>
          <input type="checkbox" disabled={!aktiv} checked={auswahl.includes(b.id)} onChange={() => umschalten(b.id)} />
          <div>
            <div style={{ color:'var(--text1)', fontSize:'.88rem' }}>{b.kundeName || '—'} <span style={klein}>#{b.kundeNr || 'ohne Nr.'}</span></div>
            <div style={klein}>{[b.adresse, b.lieferzeit, b.hinweis].filter(Boolean).join(' · ')}</div>
            <div style={{ fontSize:'.78rem', color:'var(--text2)' }}>{b.positionen.map((p) => `${p.menge}× ${p.artikelNr || '?'}`).join(' · ')}</div>
          </div>
          <div style={{ textAlign:'right', ...klein }}>
            {b.herkunft === 'mobile' ? 'Mobile' : 'Shop/Portal'}
            {b.serAbgelehnt && <div style={{ color:'var(--red, #e5484d)' }}>SER abgelehnt</div>}
          </div>
        </label>
      ))}
      {!gefiltert.length && <div style={klein}>Keine offenen Bestellungen.</div>}
    </div>
  );
}

function AusVorlage({ vorlagen, onAngelegt, onFehler }) {
  const [vid, setVid] = useState('');
  const [datum, setDatum] = useState(heute());
  const [ergebnis, setErgebnis] = useState(null);
  const los = async () => {
    try {
      const r = await api('/api/fahrer-touren/aus-vorlage', 'POST', { vorlageId: Number(vid), datum });
      setErgebnis(r);
      onAngelegt(r.tour);
    } catch (e) { onFehler(e.message); }
  };
  return (
    <div style={karte}>
      <div style={{ display:'flex', gap:'.6rem', alignItems:'end', flexWrap:'wrap' }}>
        <label style={{ flex:1, minWidth:200 }}><div style={klein}>Tour aus Vorlage</div>
          <select style={input} value={vid} onChange={(e) => setVid(e.target.value)}><option value="">Vorlage wählen …</option>{vorlagen.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.kunden.length} Kunden)</option>)}</select></label>
        <label><div style={klein}>Datum</div><input style={input} type="date" value={datum} onChange={(e) => setDatum(e.target.value)} /></label>
        <button style={knopf} disabled={!vid || !datum} onClick={los}>Tour anlegen</button>
      </div>
      {ergebnis && (
        <div style={{ ...klein, marginTop:'.6rem', lineHeight:1.5 }}>
          <div style={{ color:'var(--text2)' }}>{ergebnis.uebernommen} Bestellung(en) übernommen.</div>
          {ergebnis.ohneBestellung.length > 0 && <div>Keine offene Bestellung: {ergebnis.ohneBestellung.map((k) => k.kundeName).join(', ')}</div>}
          {ergebnis.fehler.map((f) => <div key={f.bestellId} style={{ color:'var(--red, #e5484d)' }}>Nicht übernommen (Kunde {f.kundeNr}): {f.grund}</div>)}
        </div>
      )}
    </div>
  );
}

function Vorlagen({ vorlagen, onGeaendert, onFehler }) {
  const [offen, setOffen] = useState(false);
  const speichern = async (v, kunden, name = v.name) => {
    try { await api(`/api/fahrer-touren/vorlagen/${v.id}`, 'PUT', { name, employeeId: v.employeeId, fahrzeug: v.fahrzeug, ladebasisId: v.ladebasisId, kunden }); await onGeaendert(); } catch (e) { onFehler(e.message); }
  };
  const verschiebe = (v, i, r) => { const k = [...v.kunden]; [k[i], k[i + r]] = [k[i + r], k[i]]; return speichern(v, k); };
  const umbenennen = (v) => { const n = window.prompt('Neuer Name der Vorlage', v.name); if (n && n.trim()) speichern(v, v.kunden, n.trim()); };
  const loeschen = async (v) => {
    if (!window.confirm(`Vorlage „${v.name}“ löschen? Bereits angelegte Touren bleiben.`)) return;
    try { await api(`/api/fahrer-touren/vorlagen/${v.id}`, 'DELETE'); await onGeaendert(); } catch (e) { onFehler(e.message); }
  };
  return (
    <div style={karte}>
      <div style={{ display:'flex', alignItems:'center', cursor:'pointer' }} onClick={() => setOffen((o) => !o)}>
        <h2 style={{ fontSize:'1rem', color:'var(--text1)', margin:0, flex:1 }}>Vorlagen ({vorlagen.length})</h2>
        <span style={klein}>{offen ? 'zuklappen' : 'aufklappen'}</span>
      </div>
      {offen && (
        <div style={{ marginTop:'.6rem' }}>
          <div style={{ ...klein, marginBottom:'.5rem' }}>Neue Vorlage: eine Tour mit Stopps öffnen und „Als Vorlage speichern“ wählen.</div>
          {vorlagen.map((v) => (
            <div key={v.id} style={{ borderTop:'1px solid var(--border)', padding:'.6rem 0' }}>
              <div style={{ display:'flex', gap:'.5rem', alignItems:'center' }}>
                <div style={{ flex:1, color:'var(--text1)', fontSize:'.9rem' }}>{v.name} <span style={klein}>{v.fahrerName} · {v.fahrzeug || 'kein Fahrzeug'} · {v.ladebasisName || 'keine Ladebasis'}</span></div>
                <button style={knopf} onClick={() => umbenennen(v)}>Umbenennen</button>
                <button style={knopf} onClick={() => loeschen(v)}>Löschen</button>
              </div>
              {v.kunden.map((k, i) => (
                <div key={k.kundeNr} style={{ display:'grid', gridTemplateColumns:'1.5rem 1fr auto', gap:'.4rem', padding:'.25rem 0 .25rem .5rem', fontSize:'.85rem', color:'var(--text2)' }}>
                  <span>{i + 1}</span>
                  <span>{k.kundeName} <span style={klein}>#{k.kundeNr}{k.lieferzeit ? ` · ${k.lieferzeit}` : ''}</span></span>
                  <span style={{ display:'flex', gap:'.25rem' }}>
                    <button style={knopf} disabled={i === 0} onClick={() => verschiebe(v, i, -1)}>↑</button>
                    <button style={knopf} disabled={i === v.kunden.length - 1} onClick={() => verschiebe(v, i, 1)}>↓</button>
                    <button style={knopf} onClick={() => speichern(v, v.kunden.filter((x) => x.kundeNr !== k.kundeNr))}>Raus</button>
                  </span>
                </div>
              ))}
              {!v.kunden.length && <div style={klein}>Keine Kunden.</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Tourplanung() {
  const [von, setVon] = useState(heute());
  const [touren, setTouren] = useState(null);
  const [fahrer, setFahrer] = useState([]);
  const [basen, setBasen] = useState([]);
  const [offen, setOffen] = useState([]);
  const [vorlagen, setVorlagen] = useState([]);
  const [tour, setTour] = useState(null);
  const [auswahl, setAuswahl] = useState([]);
  const [fehler, setFehler] = useState(null);

  const ladeTouren = useCallback(async () => { setTouren(await api(`/api/fahrer-touren?von=${von}`)); }, [von]);
  const ladeOffen = useCallback(async () => { setOffen(await api('/api/fahrer-touren/offene-bestellungen')); }, []);
  const ladeVorlagen = useCallback(async () => { setVorlagen(await api('/api/fahrer-touren/vorlagen')); }, []);
  const ladeTour = useCallback(async (id) => { setTour(await api(`/api/fahrer-touren/${id}`)); }, []);

  const sicher = useCallback(async (fn) => {
    setFehler(null);
    try { await fn(); } catch (e) { setFehler(e.message); }
  }, []);
  const alles = useCallback((id) => sicher(async () => { await Promise.all([ladeTouren(), ladeOffen(), id ? ladeTour(id) : null]); }), [sicher, ladeTouren, ladeOffen, ladeTour]);

  useEffect(() => { sicher(async () => { await ladeTouren(); }); }, [sicher, ladeTouren]);
  useEffect(() => {
    sicher(async () => {
      const [f, b, o, v] = await Promise.all([api('/api/fahrer-touren/fahrer'), api('/api/fahrer-ladebasen'), api('/api/fahrer-touren/offene-bestellungen'), api('/api/fahrer-touren/vorlagen')]);
      setFahrer(f); setBasen(b); setOffen(o); setVorlagen(v);
    });
  }, [sicher]);

  const entwurf = tour?.status === 'entwurf';
  const gesperrt = !entwurf;
  const stopps = tour?.stoppListe || [];

  const aktion = (name, bestaetigung) => async () => {
    if (bestaetigung && !window.confirm(bestaetigung)) return;
    await sicher(async () => { await api(`/api/fahrer-touren/${tour.id}/${name}`, 'POST'); await alles(tour.id); });
  };
  const verschiebe = (s, richtung) => sicher(async () => {
    const ids = stopps.map((x) => x.id);
    const i = ids.indexOf(s.id);
    [ids[i], ids[i + richtung]] = [ids[i + richtung], ids[i]];
    await api(`/api/fahrer-touren/${tour.id}/reihenfolge`, 'PUT', { stoppIds: ids });
    await alles(tour.id);
  });
  const hinzufuegen = () => sicher(async () => {
    await api(`/api/fahrer-touren/${tour.id}/bestellungen`, 'POST', { bestellIds: auswahl });
    setAuswahl([]);
    await alles(tour.id);
  });

  return (
    <div style={{ padding:'1.5rem', maxWidth:1200 }}>
      <h1 style={{ fontSize:'1.2rem', color:'var(--text1)', marginBottom:'.25rem' }}>Tourplanung</h1>
      <p style={{ color:'var(--text2)', fontSize:'.85rem', marginBottom:'1rem' }}>
        Tour anlegen, offene Bestellungen zuordnen, Reihenfolge festlegen und freigeben. Nach der Freigabe ist die Tour gesperrt; das Tablet lädt sie mit „Touren neu laden“.
      </p>
      {fehler && <div style={{ color:'var(--red, #e5484d)', fontSize:'.85rem', marginBottom:'.75rem' }}>{fehler}</div>}

      <NeueTour fahrer={fahrer} basen={basen} onFehler={setFehler} onAngelegt={(t) => alles(t.id)} />
      <AusVorlage vorlagen={vorlagen} onFehler={setFehler} onAngelegt={(t) => alles(t.id)} />
      <Vorlagen vorlagen={vorlagen} onFehler={setFehler} onGeaendert={() => sicher(ladeVorlagen)} />

      <div style={{ display:'grid', gridTemplateColumns:'minmax(240px, 1fr) 2fr', gap:'1rem', alignItems:'start' }}>
        <div style={karte}>
          <label style={klein}>Ab Datum <input style={{ ...input, width:150, marginLeft:'.4rem' }} type="date" value={von} onChange={(e) => setVon(e.target.value)} /></label>
          {(touren || []).map((t) => (
            <div key={t.id} onClick={() => { setAuswahl([]); sicher(() => ladeTour(t.id)); }}
              style={{ padding:'.55rem .4rem', borderTop:'1px solid var(--border)', cursor:'pointer', background: tour?.id === t.id ? 'var(--bg2)' : 'transparent' }}>
              <div style={{ color:'var(--text1)', fontSize:'.88rem' }}>{datumDe(t.datum)} · {t.bezeichnung}</div>
              <div style={klein}>{t.fahrerName || '—'} · {t.stopps} Stopps · <StatusMarke status={t.status} /></div>
            </div>
          ))}
          {touren && !touren.length && <div style={{ ...klein, marginTop:'.6rem' }}>Keine Touren ab diesem Datum.</div>}
        </div>

        <div>
          {tour ? (
            <div style={karte}>
              <div style={{ display:'flex', gap:'.6rem', alignItems:'center', flexWrap:'wrap', marginBottom:'.4rem' }}>
                <h2 style={{ fontSize:'1rem', color:'var(--text1)', margin:0, flex:1 }}>{datumDe(tour.datum)} · {tour.bezeichnung}</h2>
                <StatusMarke status={tour.status} />
              </div>
              <div style={{ ...klein, marginBottom:'.6rem' }}>
                {tour.fahrerName} · {tour.fahrzeug || 'kein Fahrzeug'} · Ladebasis: {tour.ladebasisName || 'keine'}
              </div>
              <div style={{ display:'flex', gap:'.4rem', flexWrap:'wrap' }}>
                {tour.status === 'entwurf' && <button style={knopf} onClick={aktion('freigeben')}>Freigeben</button>}
                {stopps.length > 0 && <button style={knopf} onClick={() => { const n = window.prompt('Name der Vorlage', tour.bezeichnung); if (n && n.trim()) sicher(async () => { await api(`/api/fahrer-touren/${tour.id}/als-vorlage`, 'POST', { name: n.trim() }); await ladeVorlagen(); }); }}>Als Vorlage speichern</button>}
                {tour.status === 'freigegeben' && <button style={knopf} onClick={aktion('zurueck', 'Tour zurück in den Entwurf? Das Tablet lädt sie dann nicht mehr.')}>Zurück in Entwurf</button>}
                {['entwurf', 'freigegeben', 'unterwegs'].includes(tour.status) && (
                  <button style={knopf} onClick={aktion('stornieren', 'Tour stornieren? Die Bestellungen werden wieder frei.')}>Stornieren</button>)}
                {tour.status === 'unterwegs' && <button style={knopf} onClick={aktion('beenden', 'Tour im Büro beenden? Nur für den Notfall, wenn das Tablet sie nicht beenden kann.')}>Im Büro beenden</button>}
                {(tour.status === 'storniert' || !stopps.length) && (
                  <button style={knopf} onClick={() => { if (window.confirm('Tour entfernen?')) sicher(async () => { await api(`/api/fahrer-touren/${tour.id}`, 'DELETE'); setTour(null); await alles(); }); }}>Entfernen</button>)}
              </div>
              <div style={{ marginTop:'.8rem' }}>
                {stopps.map((s, i) => (
                  <Stopp key={s.id} s={s} index={i} anzahl={stopps.length} gesperrt={gesperrt}
                    onHoch={(x) => verschiebe(x, -1)} onRunter={(x) => verschiebe(x, 1)}
                    onEntfernen={(x) => sicher(async () => { await api(`/api/fahrer-touren/${tour.id}/stopps/${x.id}`, 'DELETE'); await alles(tour.id); })}
                    onSpeichern={(x, e) => sicher(async () => { await api(`/api/fahrer-touren/${tour.id}/stopps/${x.id}`, 'PATCH', e); await ladeTour(tour.id); })} />
                ))}
                {!stopps.length && <div style={klein}>Noch keine Stopps. Unten Bestellungen auswählen.</div>}
              </div>
            </div>
          ) : <div style={{ ...karte, ...klein }}>Tour links wählen oder oben neu anlegen.</div>}
          <OffeneBestellungen offen={offen} auswahl={auswahl} setAuswahl={setAuswahl} onHinzu={hinzufuegen} aktiv={entwurf} />
        </div>
      </div>
    </div>
  );
}
