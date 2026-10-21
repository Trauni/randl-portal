import { useState, useEffect } from 'react';

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/;

// ── Status Badge ─────────────────────────────────────────────────────
function StateBadge({ state }) {
  const cfg = {
    running: { bg:'rgba(46,189,122,.12)', border:'rgba(46,189,122,.3)', color:'var(--green)' },
    exited:  { bg:'rgba(224,80,80,.1)',   border:'rgba(224,80,80,.25)', color:'var(--red2)' },
    paused:  { bg:'rgba(232,160,32,.1)',  border:'rgba(232,160,32,.25)',color:'var(--amber)' },
  };
  const s = cfg[state] || cfg.exited;
  return (
    <span style={{ fontSize:'.7rem', padding:'.12rem .45rem', borderRadius:4,
      background:s.bg, border:`1px solid ${s.border}`, color:s.color,
      fontFamily:'DM Mono, monospace' }}>{state}</span>
  );
}

// ── Action Button ────────────────────────────────────────────────────
function ActBtn({ label, onClick, color = 'var(--text2)', title }) {
  return (
    <button title={title} onClick={onClick} style={{
      padding:'.22rem .55rem', borderRadius:5, fontSize:'.75rem',
      background:'transparent', border:'1px solid var(--border)',
      color, cursor:'pointer', transition:'opacity .15s',
    }}>{label}</button>
  );
}

// ── Logs Modal ───────────────────────────────────────────────────────
function LogsModal({ container, onClose }) {
  const [logs, setLogs]   = useState('Lade…');
  const [lines, setLines] = useState(150);

  const load = async (n) => {
    setLogs('Lade…');
    try {
      const r = await fetch(`/api/it/docker/logs?id=${encodeURIComponent(container.id)}&lines=${n}`);
      const d = await r.json();
      setLogs(d.ok ? d.logs || '(keine Ausgabe)' : `Fehler: ${d.error}`);
    } catch (e) { setLogs(`Fehler: ${e.message}`); }
  };

  useEffect(() => { load(lines); }, []);

  const changeLines = (n) => { setLines(n); load(n); };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.85)',
      zIndex:200, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'var(--bg1)', border:'1px solid var(--border)',
        borderRadius:10, padding:'1.25rem', width:'95%', maxWidth:960,
        maxHeight:'85vh', display:'flex', flexDirection:'column' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
          marginBottom:'1rem', flexShrink:0 }}>
          <div>
            <span style={{ fontWeight:600, color:'var(--text1)' }}>Logs: {container.name}</span>
            <span style={{ fontFamily:'DM Mono, monospace', fontSize:'.72rem',
              color:'var(--text3)', marginLeft:'.6rem' }}>{container.id}</span>
          </div>
          <div style={{ display:'flex', gap:'.4rem', alignItems:'center' }}>
            {[50,100,150,300].map(n => (
              <button key={n} onClick={() => changeLines(n)} style={{
                padding:'.2rem .5rem', borderRadius:5, fontSize:'.72rem',
                background: lines === n ? 'rgba(184,49,31,.1)' : 'transparent',
                border:`1px solid ${lines === n ? 'rgba(184,49,31,.4)' : 'var(--border)'}`,
                color: lines === n ? 'var(--r)' : 'var(--text2)', cursor:'pointer' }}>
                {n}
              </button>
            ))}
            <button onClick={onClose} style={{ padding:'.25rem .6rem', borderRadius:6,
              background:'var(--bg2)', border:'1px solid var(--border)',
              color:'var(--text2)', cursor:'pointer', fontSize:'.78rem' }}>✕</button>
          </div>
        </div>
        <pre style={{ flex:1, overflowY:'auto', background:'#0d1117',
          border:'1px solid var(--border)', borderRadius:7, padding:'1rem',
          fontFamily:'DM Mono, monospace', fontSize:'.72rem', lineHeight:1.6,
          color:'#e6edf3', whiteSpace:'pre-wrap', wordBreak:'break-all', margin:0 }}>
          {logs}
        </pre>
      </div>
    </div>
  );
}

// ── Action Feedback Modal ─────────────────────────────────────────────
function ActionModal({ title, result, onClose }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.75)',
      zIndex:200, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'var(--bg1)', border:'1px solid var(--border)',
        borderRadius:10, padding:'1.5rem', width:360 }}>
        <div style={{ fontWeight:600, color:'var(--text1)', marginBottom:'.75rem' }}>{title}</div>
        <div style={{ fontSize:'.85rem',
          color: result === null ? 'var(--text2)'
               : result === true ? 'var(--green)' : 'var(--red2)' }}>
          {result === null ? '⏳ Wird ausgeführt…' : result === true ? '✓ Erfolgreich.' : `✗ ${result}`}
        </div>
        {result !== null && (
          <button onClick={onClose} style={{ marginTop:'1rem', padding:'.35rem .8rem',
            background:'var(--bg2)', border:'1px solid var(--border)',
            borderRadius:7, color:'var(--text2)', cursor:'pointer', fontSize:'.8rem' }}>
            Schließen
          </button>
        )}
      </div>
    </div>
  );
}

// ── Update-Status pro Container (#396) ───────────────────────────────
function UpdateCell({ u, onUpdate }) {
  if (!u) return <span style={{ fontSize:'.72rem', color:'var(--text3)' }}>–</span>;
  const pill = (text, color, title) => (
    <span title={title} style={{ fontSize:'.68rem', padding:'.1rem .4rem', borderRadius:4,
      border:`1px solid ${color}`, color, fontFamily:'DM Mono, monospace', whiteSpace:'nowrap' }}>{text}</span>
  );
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'.2rem', alignItems:'flex-start' }}>
      {u.status === 'aktuell' && pill('✓ aktuell', 'var(--green)')}
      {u.status === 'update' && pill('neues Image', 'var(--amber)', 'Für den gleichen Tag gibt es ein neueres Image')}
      {u.neue_version && pill(`${u.neue_version} verfügbar`, '#3b82f6',
        'Neue Version: Tag in docker-compose bzw. .env anpassen und den Stack neu starten (kein Knopf, bewusst)')}
      {u.status === 'lokal' && pill('lokal gebaut', 'var(--text3)', u.hinweis)}
      {u.status === 'fehler' && pill('nicht prüfbar', 'var(--text3)', u.hinweis)}
      {u.kann_aktualisieren && (
        <button onClick={() => onUpdate(u)} style={{ padding:'.15rem .5rem', borderRadius:5, fontSize:'.72rem',
          background:'rgba(232,160,32,.1)', border:'1px solid rgba(232,160,32,.4)', color:'var(--amber)', cursor:'pointer' }}>
          ⬆ Update
        </button>
      )}
      {u.status === 'update' && u.gesperrt && (
        <span style={{ fontSize:'.66rem', color:'var(--text3)' }}>{u.gesperrt}</span>
      )}
      {u.watchtower === 'aus' && (
        <span title="Watchtower-Label enable=false: wird nicht automatisch aktualisiert"
          style={{ fontSize:'.64rem', color:'var(--text3)' }}>Auto-Update aus</span>
      )}
    </div>
  );
}

// ── Update-Verlauf ───────────────────────────────────────────────────
function UpdateModal({ job, onClose }) {
  const done = job?.fertig;
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.8)',
      zIndex:200, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'var(--bg1)', border:'1px solid var(--border)',
        borderRadius:10, padding:'1.25rem', width:'95%', maxWidth:760, maxHeight:'80vh',
        display:'flex', flexDirection:'column' }}>
        <div style={{ fontWeight:600, color:'var(--text1)', marginBottom:'.6rem' }}>
          Update: {job?.name}{' '}
          <span style={{ fontSize:'.8rem', fontWeight:400,
            color: !done ? 'var(--text2)' : job.ok ? 'var(--green)' : 'var(--red2)' }}>
            {!done ? '⏳ läuft… (Image laden kann einige Minuten dauern)' : job.ok ? '✓ fertig' : '✗ fehlgeschlagen'}
          </span>
        </div>
        <pre style={{ flex:1, overflowY:'auto', background:'#0d1117', border:'1px solid var(--border)',
          borderRadius:7, padding:'.8rem', fontFamily:'DM Mono, monospace', fontSize:'.7rem',
          lineHeight:1.55, color:'#e6edf3', whiteSpace:'pre-wrap', wordBreak:'break-all', margin:0, minHeight:120 }}>
          {(job?.log || []).join('\n') || '…'}
        </pre>
        {done && (
          <button onClick={onClose} style={{ marginTop:'.8rem', alignSelf:'flex-start', padding:'.35rem .8rem',
            background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:7,
            color:'var(--text2)', cursor:'pointer', fontSize:'.8rem' }}>Schließen</button>
        )}
      </div>
    </div>
  );
}

export default function Docker() {
  const [containers, setContainers] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [logsFor,    setLogsFor]    = useState(null);
  const [actionMod,  setActionMod]  = useState(null); // { title, result }
  const [filter,     setFilter]     = useState('');
  const [upd,        setUpd]        = useState(null);  // Ergebnis der Update-Pruefung
  const [updJob,     setUpdJob]     = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/it/docker');
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      setContainers(d.containers);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const loadUpdates = async (check) => {
    try {
      const r = await fetch('/api/it/docker/updates' + (check ? '/check' : ''), { method: check ? 'POST' : 'GET' });
      const d = await r.json();
      if (d.ok) setUpd(d);
    } catch {}
  };
  useEffect(() => { loadUpdates(false); }, []);
  // waehrend die Pruefung laeuft, alle 3 s nachsehen
  useEffect(() => {
    if (!upd?.laeuft) return;
    const t = setTimeout(() => loadUpdates(false), 3000);
    return () => clearTimeout(t);
  }, [upd]);

  const startUpdate = async (u) => {
    const hinweis = u.watchtower === 'aus' ? '\n\nDieser Container ist bewusst vom Auto-Update ausgenommen.' : '';
    if (!window.confirm(`${u.name} jetzt aktualisieren?\n\nImage ${u.image} wird neu geladen und der Container neu erstellt – er ist dabei kurz nicht erreichbar.${hinweis}`)) return;
    const r = await fetch('/api/it/docker/update', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ name: u.name }) }).then(x => x.json()).catch(e => ({ ok:false, error:e.message }));
    if (!r.ok) { setActionMod({ title:`Update: ${u.name}`, result: r.error }); return; }
    setUpdJob(r.job);
  };
  useEffect(() => {
    if (!updJob || updJob.fertig) return;
    const t = setTimeout(async () => {
      const r = await fetch('/api/it/docker/update/' + updJob.id).then(x => x.json()).catch(() => null);
      if (r?.ok) {
        setUpdJob(r.job);
        if (r.job.fertig) { load(); loadUpdates(false); }
      }
    }, 2000);
    return () => clearTimeout(t);
  }, [updJob]);
  const updByName = Object.fromEntries((upd?.container || []).map(u => [u.name, u]));
  const updCount = (upd?.container || []).filter(u => u.status === 'update' || u.neue_version).length;

  const doAction = async (action, container) => {
    const labels = { restart:'Neustart', stop:'Stoppen', start:'Starten' };
    setActionMod({ title:`${labels[action]}: ${container.name}`, result:null });
    try {
      const r = await fetch('/api/it/docker/action', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action, id: container.id })
      }).then(r => r.json());
      setActionMod(p => ({ ...p, result: r.ok || r.error }));
      if (r.ok) setTimeout(load, 1500);
    } catch (e) { setActionMod(p => ({ ...p, result: e.message })); }
  };

  const running = containers.filter(c => c.state === 'running').length;
  const filtered = containers.filter(c =>
    !filter || c.name.toLowerCase().includes(filter.toLowerCase()) ||
    c.image.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div>
      {logsFor && <LogsModal container={logsFor} onClose={() => setLogsFor(null)}/>}
      {actionMod && <ActionModal {...actionMod}
        onClose={() => { setActionMod(null); }}/>}
      {updJob && <UpdateModal job={updJob} onClose={() => setUpdJob(null)}/>}

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
        marginBottom:'1.2rem', flexWrap:'wrap', gap:'.5rem' }}>
        <div>
          <h1 style={{ fontSize:'1.15rem', fontWeight:600, color:'var(--text1)' }}>Docker Container</h1>
          <p style={{ color:'var(--text2)', fontSize:'.8rem', marginTop:'.2rem' }}>
            {containers.length} Container ·{' '}
            <span style={{ color:'var(--green)' }}>{running} laufend</span>
            {' · /var/run/docker.sock'}
          </p>
          <p style={{ color:'var(--text3)', fontSize:'.74rem', marginTop:'.15rem' }}>
            {upd?.laeuft ? '⏳ Prüfe Updates…'
              : upd?.geprueft_am
                ? <>Updates geprüft {new Date(upd.geprueft_am).toLocaleString('de-DE', { dateStyle:'short', timeStyle:'short' })}
                    {' · '}<span style={{ color: updCount ? 'var(--amber)' : 'var(--green)' }}>
                      {updCount ? `${updCount} mit Update` : 'alles aktuell'}</span></>
                : 'Updates noch nicht geprüft'}
            {upd?.fehler && <span style={{ color:'var(--red2)' }}> · Fehler: {upd.fehler}</span>}
          </p>
        </div>
        <div style={{ display:'flex', gap:'.5rem' }}>
          <input value={filter} onChange={e => setFilter(e.target.value)}
            placeholder="Filter…" style={{ background:'var(--bg0)',
              border:'1px solid var(--border)', borderRadius:7,
              padding:'.3rem .7rem', color:'var(--text1)', fontSize:'.8rem',
              outline:'none', width:140 }}/>
          <button onClick={() => loadUpdates(true)} disabled={upd?.laeuft} style={{ padding:'.4rem .9rem',
            background:'var(--bg2)', border:'1px solid var(--border)',
            borderRadius:8, color:'var(--text2)', fontSize:'.82rem', cursor:'pointer' }}>
            ⬆ Updates prüfen
          </button>
          <button onClick={load} style={{ padding:'.4rem .9rem',
            background:'var(--bg2)', border:'1px solid var(--border)',
            borderRadius:8, color:'var(--text2)', fontSize:'.82rem', cursor:'pointer' }}>
            ↻ Aktualisieren
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background:'rgba(224,80,80,.08)', border:'1px solid rgba(224,80,80,.3)',
          borderRadius:9, padding:'.75rem 1rem', color:'var(--red2)', fontSize:'.85rem',
          marginBottom:'1rem', fontFamily:'DM Mono, monospace' }}>
          ✗ {error}
          <div style={{ fontSize:'.78rem', color:'var(--text2)', marginTop:'.3rem' }}>
            Prüfe: <code>usermod -aG docker radmin</code> und pm2 danach neu starten
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ color:'var(--text3)', textAlign:'center', padding:'3rem' }}>Lade Container…</div>
      ) : (
        <div style={{ background:'var(--bg1)', border:'1px solid var(--border)',
          borderRadius:9, overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'var(--bg2)', borderBottom:'1px solid var(--border)' }}>
                  {['ID','Name','Image','Status','CPU','RAM','Update','Aktionen'].map(h => (
                    <th key={h} style={{ textAlign:'left', padding:'.5rem .65rem',
                      fontSize:'.65rem', textTransform:'uppercase', letterSpacing:'.08em',
                      color:'var(--text3)', fontFamily:'DM Mono, monospace', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} style={{ borderBottom:'1px solid rgba(255,255,255,.04)' }}>
                    <td style={{ padding:'.5rem .65rem', fontFamily:'DM Mono, monospace',
                      fontSize:'.72rem', color:'var(--text3)' }}>{c.id}</td>
                    <td style={{ padding:'.5rem .65rem', fontWeight:500, fontSize:'.85rem',
                      color:'var(--text1)' }}>{c.name}</td>
                    <td style={{ padding:'.5rem .65rem', fontSize:'.75rem', color:'var(--text2)',
                      maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {c.image}
                    </td>
                    <td style={{ padding:'.5rem .65rem' }}>
                      <StateBadge state={c.state}/>
                      <div style={{ fontSize:'.68rem', color:'var(--text3)',
                        marginTop:'.15rem', fontFamily:'DM Mono, monospace' }}>{c.status}</div>
                    </td>
                    <td style={{ padding:'.5rem .65rem', fontFamily:'DM Mono, monospace',
                      fontSize:'.75rem', color:'var(--text2)' }}>{c.cpu}</td>
                    <td style={{ padding:'.5rem .65rem', fontFamily:'DM Mono, monospace',
                      fontSize:'.75rem', color:'var(--text2)' }}>{c.mem}</td>
                    <td style={{ padding:'.5rem .65rem' }}>
                      <UpdateCell u={updByName[c.name]} onUpdate={startUpdate}/>
                    </td>
                    <td style={{ padding:'.5rem .65rem' }}>
                      <div style={{ display:'flex', gap:'.3rem' }}>
                        {c.state === 'running' ? (
                          <>
                            <ActBtn label="↺" title="Restart"
                              onClick={() => doAction('restart', c)} color="var(--amber)"/>
                            <ActBtn label="■" title="Stop"
                              onClick={() => doAction('stop', c)} color="var(--red2)"/>
                          </>
                        ) : (
                          <ActBtn label="▶" title="Start"
                            onClick={() => doAction('start', c)} color="var(--green)"/>
                        )}
                        <ActBtn label="≡" title="Logs"
                          onClick={() => setLogsFor(c)} color="var(--text2)"/>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ padding:'2rem', textAlign:'center',
                      color:'var(--text3)', fontSize:'.82rem' }}>
                      {filter ? 'Keine Container gefunden.' : 'Keine Container vorhanden.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
