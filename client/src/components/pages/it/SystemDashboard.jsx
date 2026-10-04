import { useState, useCallback } from 'react';

// ── Gauge SVG ────────────────────────────────────────────────────────
function Gauge({ pct = 0, label, value, sub }) {
  const r     = 38;
  const circ  = 2 * Math.PI * r;
  const dash  = circ * (Math.min(pct, 100) / 100);
  const color = pct < 60 ? 'var(--green)' : pct < 85 ? 'var(--amber)' : 'var(--red2)';
  return (
    <div style={{ display:'flex', alignItems:'center', gap:'1rem',
      background:'var(--bg1)', border:'1px solid var(--border)',
      borderRadius:9, padding:'1rem 1.1rem' }}>
      <svg width="88" height="88" viewBox="0 0 88 88" style={{ flexShrink:0 }}>
        <circle cx="44" cy="44" r={r} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="8"/>
        <circle cx="44" cy="44" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${dash.toFixed(1)} ${circ.toFixed(1)}`}
          strokeDashoffset={(circ / 4).toFixed(1)}
          strokeLinecap="round"
          transform="rotate(-90 44 44)"/>
        <text x="44" y="49" textAnchor="middle" fill="var(--text1)"
          fontSize="14" fontWeight="700" fontFamily="DM Mono, monospace">{pct}%</text>
      </svg>
      <div>
        <div style={{ fontSize:'.65rem', textTransform:'uppercase', letterSpacing:'.12em', color:'var(--text3)' }}>{label}</div>
        <div style={{ fontSize:'1rem', fontWeight:700, color:'var(--text1)', fontFamily:'DM Mono, monospace', marginTop:'.2rem' }}>{value}</div>
        <div style={{ fontSize:'.72rem', color:'var(--text2)', marginTop:'.1rem' }}>{sub}</div>
      </div>
    </div>
  );
}

// ── Info Tile ────────────────────────────────────────────────────────
function Tile({ icon, label, big, sub, accentColor = 'var(--r)' }) {
  return (
    <div style={{ background:'var(--bg1)', border:'1px solid var(--border)',
      borderRadius:9, padding:'.85rem 1rem', display:'flex', alignItems:'center', gap:'.9rem' }}>
      <div style={{ width:40, height:40, borderRadius:8,
        background:`color-mix(in srgb, ${accentColor} 12%, transparent)`,
        display:'flex', alignItems:'center', justifyContent:'center',
        fontSize:'1.2rem', flexShrink:0 }}>{icon}</div>
      <div>
        <div style={{ fontSize:'.65rem', textTransform:'uppercase', letterSpacing:'.12em', color:'var(--text3)' }}>{label}</div>
        <div style={{ fontSize:'1.25rem', fontWeight:700, color:'var(--text1)',
          fontFamily:'DM Mono, monospace', lineHeight:1.2, marginTop:'.2rem' }}>{big}</div>
        {sub && <div style={{ fontSize:'.72rem', color:'var(--text2)', marginTop:'.1rem' }}>{sub}</div>}
      </div>
    </div>
  );
}

// ── Status dot ───────────────────────────────────────────────────────
const Dot = ({ on }) => (
  <span style={{ display:'inline-block', width:7, height:7, borderRadius:'50%',
    background: on ? 'var(--green)' : 'var(--red2)', marginRight:6, flexShrink:0 }}/>
);


// ── Shopware Monitor ─────────────────────────────────────────────────
function ShopwareMonitor() {
  const [sw, setSw]       = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/it/shopware');
      const d = await r.json();
      if (d.ok) setSw(d);
    } catch {}
    setLoading(false);
  };

  useState(() => { load(); }, []);

  const workerColor = sw?.worker?.running ? 'var(--green)' : 'var(--red2)';
  const queueTotal  = sw ? (sw.queue.async + sw.queue.low_priority + sw.queue.failed) : 0;

  return (
    <div style={{ marginTop:'1rem' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'.6rem' }}>
        <div style={{ fontSize:'.85rem', fontWeight:600, color:'var(--text1)' }}>🛒 Shopware · shop.werk-2.net</div>
        <button onClick={load} disabled={loading}
          style={{ fontSize:'.75rem', padding:'.25rem .6rem', background:'var(--bg2)',
            border:'1px solid var(--border)', borderRadius:6, color:'var(--text3)', cursor:'pointer' }}>
          {loading ? '⏳' : '↻'}
        </button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:'.75rem', marginBottom:'.75rem' }}>
        {/* Worker */}
        <div style={{ background:'var(--bg1)', border:`1px solid ${sw?.worker?.running ? 'rgba(72,199,142,.25)' : 'rgba(224,80,80,.25)'}`,
          borderRadius:9, padding:'.85rem 1rem' }}>
          <div style={{ fontSize:'.65rem', textTransform:'uppercase', letterSpacing:'.1em', color:'var(--text3)', marginBottom:'.3rem' }}>Worker</div>
          <div style={{ display:'flex', alignItems:'center', gap:'.4rem' }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:workerColor, display:'inline-block', flexShrink:0 }}/>
            <span style={{ fontSize:'1rem', fontWeight:700, color:workerColor, fontFamily:'DM Mono, monospace' }}>
              {sw ? (sw.worker.running ? 'running' : 'stopped') : '–'}
            </span>
          </div>
          {sw?.worker?.pid && <div style={{ fontSize:'.7rem', color:'var(--text3)', marginTop:'.2rem' }}>PID {sw.worker.pid}</div>}
        </div>

        {/* Queue */}
        <div style={{ background:'var(--bg1)', border:`1px solid ${queueTotal > 0 ? 'rgba(255,180,0,.25)' : 'var(--border)'}`,
          borderRadius:9, padding:'.85rem 1rem' }}>
          <div style={{ fontSize:'.65rem', textTransform:'uppercase', letterSpacing:'.1em', color:'var(--text3)', marginBottom:'.3rem' }}>Message Queue</div>
          <div style={{ fontSize:'1rem', fontWeight:700, color: queueTotal > 0 ? 'var(--amber)' : 'var(--green)',
            fontFamily:'DM Mono, monospace' }}>{sw ? queueTotal : '–'}</div>
          {sw && <div style={{ fontSize:'.7rem', color:'var(--text3)', marginTop:'.2rem' }}>
            async: {sw.queue.async} · low: {sw.queue.low_priority} · failed: {sw.queue.failed}
          </div>}
        </div>

        {/* Overdue Tasks */}
        <div style={{ background:'var(--bg1)', border:`1px solid ${sw?.scheduledOverdue > 0 ? 'rgba(224,80,80,.25)' : 'var(--border)'}`,
          borderRadius:9, padding:'.85rem 1rem' }}>
          <div style={{ fontSize:'.65rem', textTransform:'uppercase', letterSpacing:'.1em', color:'var(--text3)', marginBottom:'.3rem' }}>Überfällige Tasks</div>
          <div style={{ fontSize:'1rem', fontWeight:700,
            color: sw?.scheduledOverdue > 0 ? 'var(--red2)' : 'var(--green)',
            fontFamily:'DM Mono, monospace' }}>{sw ? sw.scheduledOverdue : '–'}</div>
        </div>

        {/* Redis */}
        <div style={{ background:'var(--bg1)', border:'1px solid var(--border)', borderRadius:9, padding:'.85rem 1rem' }}>
          <div style={{ fontSize:'.65rem', textTransform:'uppercase', letterSpacing:'.1em', color:'var(--text3)', marginBottom:'.3rem' }}>Redis Cache</div>
          <div style={{ fontSize:'1rem', fontWeight:700, color:'var(--text1)', fontFamily:'DM Mono, monospace' }}>{sw?.redis?.usedMemory || '–'}</div>
          <div style={{ fontSize:'.7rem', color:'var(--text3)', marginTop:'.2rem' }}>Hit-Rate: {sw?.redis?.hitRate || '–'}</div>
        </div>
      </div>

      {/* Container Stats */}
      {sw?.containers && Object.keys(sw.containers).length > 0 && (
        <div style={{ background:'var(--bg1)', border:'1px solid var(--border)', borderRadius:9, padding:'1rem' }}>
          <div style={{ fontSize:'.8rem', fontWeight:600, color:'var(--text1)', marginBottom:'.6rem' }}>📊 Container Performance</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:'.5rem' }}>
            {Object.entries(sw.containers).map(([name, stats]) => (
              <div key={name} style={{ padding:'.4rem .6rem', background:'var(--bg2)', borderRadius:6 }}>
                <div style={{ fontSize:'.7rem', color:'var(--text3)', marginBottom:'.15rem' }}>{name.replace('sw_','')}</div>
                <div style={{ display:'flex', gap:'.6rem', fontFamily:'DM Mono, monospace', fontSize:'.75rem' }}>
                  <span style={{ color:'var(--r)' }}>{stats.cpu}% CPU</span>
                  <span style={{ color:'var(--text2)' }}>{stats.mem}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SystemDashboard() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [loaded,  setLoaded]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/it/system');
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || 'Fehler');
      setData(d);
      setLoaded(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Lade beim ersten Mount automatisch
  useState(() => { load(); }, []);

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
        marginBottom:'1.2rem', flexWrap:'wrap', gap:'.5rem' }}>
        <div>
          <h1 style={{ fontSize:'1.15rem', fontWeight:600, color:'var(--text1)' }}>System Dashboard</h1>
          {data && (
            <p style={{ color:'var(--text2)', fontSize:'.8rem', marginTop:'.2rem', fontFamily:'DM Mono, monospace' }}>
              {data.hostname} · Up {data.uptime} · {data.cpuCount} CPUs
            </p>
          )}
        </div>
        <button onClick={load} disabled={loading}
          style={{ display:'flex', alignItems:'center', gap:'.4rem', padding:'.4rem .9rem',
            background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:8,
            color:'var(--text2)', fontSize:'.82rem', cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>
          {loading ? '⏳ Lade…' : '↻ Aktualisieren'}
        </button>
      </div>

      {error && (
        <div style={{ background:'rgba(224,80,80,.08)', border:'1px solid rgba(224,80,80,.3)',
          borderRadius:9, padding:'.75rem 1rem', color:'var(--red2)', fontSize:'.85rem', marginBottom:'1rem' }}>
          ✗ {error}
        </div>
      )}

      {!loaded && !loading && !error && (
        <div style={{ color:'var(--text2)', textAlign:'center', padding:'3rem', fontSize:'.9rem' }}>
          Klicke „Aktualisieren" um die Systemdaten zu laden.
        </div>
      )}

      {loading && (
        <div style={{ color:'var(--text3)', textAlign:'center', padding:'3rem', fontSize:'.85rem' }}>
          Lade Systemdaten…
        </div>
      )}

      {data && !loading && (
        <>
          {/* Gauges */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))',
            gap:'.75rem', marginBottom:'.9rem' }}>
            <Gauge pct={data.ram.pct}  label="RAM"
              value={`${data.ram.usedGb} / ${data.ram.totalGb} GB`}
              sub={`Frei: ${data.ram.freeGb} GB`}/>
            <Gauge pct={data.load.pct} label="CPU Load"
              value={data.load['1m']}
              sub={`5m: ${data.load['5m']} · 15m: ${data.load['15m']}`}/>
            <Gauge pct={data.disk.pct} label="Disk /"
              value={`${data.disk.used} / ${data.disk.total}`}
              sub={`${data.disk.pct}% belegt`}/>
          </div>

          {/* Tiles */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(155px, 1fr))',
            gap:'.75rem', marginBottom:'.9rem' }}>
            <Tile icon="🌐" label="Netzwerk ↓" big={data.network.rx} sub={`↑ ${data.network.tx}`} accentColor="var(--blue)"/>
            <Tile icon="🐳" label="Docker"
              big={<><span style={{color:'var(--green)'}}>{data.docker.running}</span> / {data.docker.total}</>}
              sub="laufend / gesamt" accentColor="var(--blue)"/>
            <Tile icon="⚙" label="PM2 Prozesse"
              big={data.pm2.filter(p => p.status === 'online').length + ' / ' + data.pm2.length}
              sub="online / gesamt" accentColor="var(--green)"/>
          </div>

          {/* Bottom Grid */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.75rem' }}>

            {/* Docker Container */}
            <div style={{ background:'var(--bg1)', border:'1px solid var(--border)',
              borderRadius:9, padding:'1rem' }}>
              <div style={{ fontSize:'.85rem', fontWeight:600, color:'var(--text1)', marginBottom:'.6rem' }}>
                🐳 Docker Container
              </div>
              {data.docker.containers.map((c, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:'.6rem',
                  padding:'.35rem 0', borderBottom:'1px solid rgba(255,255,255,.04)', fontSize:'.78rem' }}>
                  <Dot on={c.state === 'running'}/>
                  <span style={{ flex:1, color:'var(--text1)', overflow:'hidden',
                    textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.name}</span>
                  <span style={{ color:'var(--text3)', fontSize:'.7rem' }}>{c.image.substring(0,16)}</span>
                  <span style={{ color: c.state === 'running' ? 'var(--green)' : 'var(--red2)',
                    fontSize:'.7rem', fontFamily:'DM Mono, monospace' }}>{c.state}</span>
                </div>
              ))}
              {data.docker.containers.length === 0 && (
                <div style={{ color:'var(--text3)', fontSize:'.8rem' }}>Keine Container</div>
              )}
            </div>

            {/* PM2 + Top CPU */}
            <div style={{ background:'var(--bg1)', border:'1px solid var(--border)',
              borderRadius:9, padding:'1rem' }}>
              <div style={{ fontSize:'.85rem', fontWeight:600, color:'var(--text1)', marginBottom:'.6rem' }}>
                ⚙ PM2 Prozesse
              </div>
              {data.pm2.map((p, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:'.6rem',
                  padding:'.35rem 0', borderBottom:'1px solid rgba(255,255,255,.04)', fontSize:'.78rem' }}>
                  <Dot on={p.status === 'online'}/>
                  <span style={{ flex:1, color:'var(--text1)' }}>{p.name}</span>
                  <span style={{ color:'var(--text3)', fontFamily:'DM Mono, monospace', fontSize:'.72rem' }}>
                    {p.cpu}% CPU
                  </span>
                  <span style={{ color:'var(--text3)', fontFamily:'DM Mono, monospace', fontSize:'.72rem' }}>
                    {p.mem}MB
                  </span>
                </div>
              ))}
              {data.pm2.length === 0 && <div style={{ color:'var(--text3)', fontSize:'.8rem' }}>–</div>}

              <div style={{ fontSize:'.85rem', fontWeight:600, color:'var(--text1)',
                marginTop:'.9rem', marginBottom:'.5rem' }}>📊 Top CPU-Prozesse</div>
              {data.topProcs.map((p, i) => (
                <div key={i} style={{ display:'flex', gap:'.5rem',
                  padding:'.3rem 0', borderBottom:'1px solid rgba(255,255,255,.04)', fontSize:'.75rem' }}>
                  <span style={{ flex:1, color:'var(--text2)', overflow:'hidden',
                    textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</span>
                  <span style={{ color:'var(--r)', fontFamily:'DM Mono, monospace' }}>{p.cpu}%</span>
                  <span style={{ color:'var(--text3)', fontFamily:'DM Mono, monospace' }}>{p.mem}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Shopware Monitor */}
          <ShopwareMonitor />
        </>
      )}
    </div>
  );
}
