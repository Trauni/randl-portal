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

export default function Docker() {
  const [containers, setContainers] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [logsFor,    setLogsFor]    = useState(null);
  const [actionMod,  setActionMod]  = useState(null); // { title, result }
  const [filter,     setFilter]     = useState('');

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
        </div>
        <div style={{ display:'flex', gap:'.5rem' }}>
          <input value={filter} onChange={e => setFilter(e.target.value)}
            placeholder="Filter…" style={{ background:'var(--bg0)',
              border:'1px solid var(--border)', borderRadius:7,
              padding:'.3rem .7rem', color:'var(--text1)', fontSize:'.8rem',
              outline:'none', width:140 }}/>
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
                  {['ID','Name','Image','Status','CPU','RAM','Aktionen'].map(h => (
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
                    <td colSpan={7} style={{ padding:'2rem', textAlign:'center',
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
