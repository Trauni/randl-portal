import { useState, useEffect } from 'react';

// ── Mini Bar Chart (SVG) ─────────────────────────────────────────────
function BarChart({ data, height = 120 }) {
  if (!data || !data.length) return null;
  const spamMax = Math.max(...data.map(d => (d.spam || 0) + (d.ham || 0)), 1);
  const W = 520, BAR_W = Math.floor(W / data.length) - 1;

  return (
    <svg viewBox={`0 0 ${W} ${height}`} style={{ width:'100%', height }} preserveAspectRatio="none">
      {data.map((d, i) => {
        const total = (d.spam || 0) + (d.ham || 0);
        const spamH = Math.round((d.spam || 0) / spamMax * (height - 20));
        const hamH  = Math.round((d.ham  || 0) / spamMax * (height - 20));
        const x     = i * (BAR_W + 1);
        return (
          <g key={i}>
            {hamH  > 0 && <rect x={x} y={height - 20 - spamH - hamH} width={BAR_W} height={hamH}
              fill="rgba(46,189,122,.55)" rx="2"/>}
            {spamH > 0 && <rect x={x} y={height - 20 - spamH} width={BAR_W} height={spamH}
              fill="rgba(248,81,73,.75)" rx="2"/>}
            {i % 4 === 0 && (
              <text x={x + BAR_W / 2} y={height - 4} textAnchor="middle"
                fill="rgba(255,255,255,.25)" fontSize="8" fontFamily="DM Mono, monospace">
                {String(d.h).padStart(2,'0')}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ── Donut ────────────────────────────────────────────────────────────
function Donut({ spamPct }) {
  const r = 44, circ = 2 * Math.PI * r;
  const spDash = (spamPct / 100) * circ;
  return (
    <div style={{ position:'relative', width:110, height:110 }}>
      <svg width="110" height="110" viewBox="0 0 110 110" style={{ transform:'rotate(-90deg)' }}>
        <circle cx="55" cy="55" r={r} fill="none" stroke="rgba(46,189,122,.55)" strokeWidth="16"/>
        <circle cx="55" cy="55" r={r} fill="none" stroke="rgba(248,81,73,.8)" strokeWidth="16"
          strokeDasharray={`${spDash.toFixed(2)} ${circ.toFixed(2)}`}/>
      </svg>
      <div style={{ position:'absolute', top:'50%', left:'50%',
        transform:'translate(-50%,-50%)', textAlign:'center' }}>
        <div style={{ fontFamily:'DM Mono, monospace', fontSize:'1.3rem', fontWeight:700,
          color:'#f85149', lineHeight:1 }}>{spamPct}%</div>
        <div style={{ fontSize:'.58rem', color:'var(--text3)', textTransform:'uppercase',
          letterSpacing:'.08em' }}>SPAM</div>
      </div>
    </div>
  );
}

// ── Rule color ───────────────────────────────────────────────────────
function ruleColor(r) {
  if (r.startsWith('SH_'))         return 'var(--blue)';
  if (r.startsWith('BAYES'))       return 'var(--green)';
  if (r.startsWith('RCVD_IN'))     return 'var(--amber)';
  if (r.startsWith('DKIM') || r.startsWith('SPF') || r.startsWith('DMARC')) return '#bc8cff';
  if (r.startsWith('SHORTCIRCUIT'))return '#39d3f0';
  if (r.startsWith('URIBL') || r.startsWith('SURBL')) return '#f97316';
  return 'var(--text3)';
}

// ── Stat Card ────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accentColor }) {
  return (
    <div style={{ background:'var(--bg1)', border:'1px solid var(--border)', borderRadius:9,
      padding:'1rem', borderTop:`2px solid ${accentColor}` }}>
      <div style={{ fontSize:'.65rem', letterSpacing:'.1em', textTransform:'uppercase',
        color:'var(--text3)', marginBottom:'.4rem' }}>{label}</div>
      <div style={{ fontFamily:'DM Mono, monospace', fontSize:'1.75rem', fontWeight:700,
        color: accentColor, lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:'.72rem', color:'var(--text3)', marginTop:'.3rem' }}>{sub}</div>}
    </div>
  );
}

export default function SpamDashboard() {
  const [raw,     setRaw]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [ageMin,  setAgeMin]  = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/it/spam');
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      setRaw(d.data);
      setAgeMin(d.ageMin);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div style={{color:'var(--text3)', textAlign:'center', padding:'3rem'}}>Lade…</div>;
  if (error)   return (
    <div style={{ background:'rgba(224,80,80,.08)', border:'1px solid rgba(224,80,80,.3)',
      borderRadius:9, padding:'1rem', color:'var(--red2)' }}>
      ✗ {error}
      <div style={{ fontSize:'.8rem', color:'var(--text2)', marginTop:'.5rem' }}>
        Pfad: <code style={{fontFamily:'DM Mono,monospace'}}>SPAM_DATA_FILE</code> in .env
      </div>
    </div>
  );
  if (!raw) return null;

  const bayes    = raw.bayes     || { nspam:0, nham:0, ntokens:0 };
  const mails    = raw.mails     || { total:0, spam:0, ham:0, rejected:0 };
  const topRules = raw.top_rules || [];
  const hourly   = raw.hourly    || [];
  const hours    = raw.hours     || 24;

  const total    = mails.total    || 0;
  const spamCnt  = mails.spam     || 0;
  const hamCnt   = mails.ham      || 0;
  const rejected = mails.rejected || 0;
  const spamPct  = total > 0 ? Math.round(spamCnt / total * 100) : 0;

  // Letzten 24h sortiert
  const nowH   = new Date().getHours();
  const sorted = Array.from({length:24}, (_, i) => {
    const h = (nowH - 23 + i + 24) % 24;
    return hourly.find(x => x.h === h) || { h, spam:0, ham:0 };
  });

  const bRatio  = bayes.nham > 0 ? bayes.nspam / bayes.nham : 0;
  const ratioStr= bRatio > 0 ? `1:${Math.round(1 / bRatio)}` : '∞';
  const bQual   = bayes.nspam < 200 ? 'schlecht' : bayes.nspam < 600 ? 'mäßig' : bayes.nspam < 1000 ? 'gut' : 'sehr gut';
  const bQColor = { schlecht:'var(--red2)', mäßig:'var(--amber)', gut:'var(--green)', 'sehr gut':'var(--green)' }[bQual];

  const maxRule  = topRules.length ? Math.max(...topRules.map(r => r.count)) : 1;

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
        marginBottom:'1.2rem', flexWrap:'wrap', gap:'.5rem' }}>
        <div>
          <h1 style={{ fontSize:'1.15rem', fontWeight:600, color:'var(--text1)' }}>Spam Dashboard</h1>
          <p style={{ color:'var(--text2)', fontSize:'.8rem', marginTop:'.2rem' }}>
            SpamAssassin · {raw.generated || '–'} · {ageMin !== null ? `vor ${ageMin}min${ageMin > 20 ? ' ⚠' : ''}` : ''}
          </p>
        </div>
        <button onClick={load} style={{ display:'flex', alignItems:'center', gap:'.4rem',
          padding:'.4rem .9rem', background:'var(--bg2)', border:'1px solid var(--border)',
          borderRadius:8, color:'var(--text2)', fontSize:'.82rem', cursor:'pointer' }}>
          ↻ Neu laden
        </button>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px, 1fr))',
        gap:'.75rem', marginBottom:'1rem' }}>
        <StatCard label={`Spam (${hours}h)`}   value={spamCnt}  sub={`${spamPct}% aller Mails`}  accentColor="#f85149"/>
        <StatCard label="Ham (sauber)"           value={hamCnt}   sub="zugestellt"                  accentColor="var(--green)"/>
        <StatCard label="Abgelehnt"              value={rejected} sub="Exim hard reject"             accentColor="var(--amber)"/>
        <StatCard label="Gesamt"                 value={total}    sub="gescannt"                     accentColor="var(--blue)"/>
        <StatCard label="Bayes nspam"            value={bayes.nspam.toLocaleString('de-DE')} sub="Ziel: >1.000" accentColor="#bc8cff"/>
        <StatCard label="Bayes nham"             value={bayes.nham.toLocaleString('de-DE')}  sub={`Verhältnis ${ratioStr}`} accentColor="#39d3f0"/>
      </div>

      {/* Chart + Donut */}
      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:'.75rem', marginBottom:'.75rem' }}>
        <div style={{ background:'var(--bg1)', border:'1px solid var(--border)', borderRadius:9, padding:'1.1rem' }}>
          <div style={{ fontSize:'.82rem', fontWeight:600, color:'var(--text1)', marginBottom:'.75rem' }}>
            Spam vs. Ham — {hours}h Verlauf
          </div>
          {total > 0
            ? <BarChart data={sorted} height={130}/>
            : <div style={{ color:'var(--text2)', textAlign:'center', padding:'2rem', fontSize:'.85rem' }}>
                Keine Mails im Zeitfenster.
              </div>
          }
          <div style={{ display:'flex', gap:'1rem', marginTop:'.5rem' }}>
            <span style={{ display:'flex', alignItems:'center', gap:'.4rem', fontSize:'.72rem', color:'var(--text2)' }}>
              <span style={{ width:10, height:10, borderRadius:2, background:'rgba(248,81,73,.75)', display:'inline-block' }}/>
              Spam
            </span>
            <span style={{ display:'flex', alignItems:'center', gap:'.4rem', fontSize:'.72rem', color:'var(--text2)' }}>
              <span style={{ width:10, height:10, borderRadius:2, background:'rgba(46,189,122,.55)', display:'inline-block' }}/>
              Ham
            </span>
          </div>
        </div>

        <div style={{ background:'var(--bg1)', border:'1px solid var(--border)', borderRadius:9,
          padding:'1.1rem', display:'flex', flexDirection:'column', alignItems:'center', gap:'1rem' }}>
          <div style={{ fontSize:'.82rem', fontWeight:600, color:'var(--text1)', alignSelf:'flex-start' }}>Verteilung</div>
          <Donut spamPct={spamPct}/>
          <div style={{ width:'100%' }}>
            {[['#f85149','Spam',spamCnt],['var(--green)','Ham',hamCnt],['var(--amber)','Rejected',rejected]].map(([c,l,v]) => (
              <div key={l} style={{ display:'flex', alignItems:'center', gap:'.6rem', padding:'.3rem 0' }}>
                <span style={{ width:8, height:8, borderRadius:'50%', background:c, flexShrink:0 }}/>
                <span style={{ flex:1, fontSize:'.8rem', color:'var(--text2)' }}>{l}</span>
                <span style={{ fontSize:'.8rem', fontFamily:'DM Mono, monospace', color:'var(--text1)' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Analyse */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.75rem' }}>
        {/* Top Rules */}
        <div style={{ background:'var(--bg1)', border:'1px solid var(--border)', borderRadius:9, padding:'1.1rem' }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'.75rem' }}>
            <span style={{ fontSize:'.82rem', fontWeight:600, color:'var(--text1)' }}>Top Spam-Regeln</span>
            <span style={{ fontSize:'.68rem', padding:'.15rem .5rem',
              background:'rgba(255,255,255,.05)', border:'1px solid var(--border)',
              borderRadius:4, color:'var(--text2)' }}>{topRules.length} Regeln</span>
          </div>
          {topRules.map(r => {
            const c = ruleColor(r.rule);
            const p = Math.round(r.count / maxRule * 100);
            return (
              <div key={r.rule} style={{ display:'flex', alignItems:'center', gap:'.6rem', padding:'.3rem 0' }}>
                <div style={{ width:200, fontFamily:'DM Mono, monospace', fontSize:'.72rem',
                  color:c, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flexShrink:0 }}>
                  {r.rule}
                </div>
                <div style={{ flex:1, height:6, background:'rgba(255,255,255,.06)', borderRadius:3 }}>
                  <div style={{ width:`${p}%`, height:'100%', background:c,
                    borderRadius:3, opacity:.8 }}/>
                </div>
                <div style={{ fontFamily:'DM Mono, monospace', fontSize:'.72rem',
                  color:'var(--text2)', width:28, textAlign:'right', flexShrink:0 }}>{r.count}</div>
              </div>
            );
          })}
          {topRules.length === 0 && <div style={{ color:'var(--text3)', fontSize:'.82rem' }}>Keine Regeldaten.</div>}
        </div>

        {/* Bayes DB */}
        <div style={{ background:'var(--bg1)', border:'1px solid var(--border)', borderRadius:9, padding:'1.1rem' }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:.75*16 }}>
            <span style={{ fontSize:'.82rem', fontWeight:600, color:'var(--text1)' }}>Bayes-Datenbank</span>
            <span style={{ fontSize:'.72rem', fontWeight:600, padding:'.15rem .5rem', borderRadius:4,
              background:`color-mix(in srgb, ${bQColor} 10%, transparent)`,
              border:`1px solid color-mix(in srgb, ${bQColor} 25%, transparent)`,
              color:bQColor }}>{bQual}</span>
          </div>
          {[
            ['nspam',     bayes.nspam.toLocaleString('de-DE'),   Math.min(100, Math.round(bayes.nspam/2000*100)),  '#f85149'],
            ['nham',      bayes.nham.toLocaleString('de-DE'),    Math.min(100, Math.round(bayes.nham/20000*100)), 'var(--green)'],
            ['ntokens',   bayes.ntokens.toLocaleString('de-DE'), 60,                                              'var(--blue)'],
            ['Verhältnis',ratioStr,                              Math.min(100, bRatio*50),                        '#bc8cff'],
          ].map(([l, v, p, c]) => (
            <div key={l} style={{ display:'flex', alignItems:'center', gap:'.75rem', padding:'.3rem 0' }}>
              <div style={{ width:70, fontFamily:'DM Mono, monospace', fontSize:'.72rem',
                color:'var(--text2)', flexShrink:0 }}>{l}</div>
              <div style={{ flex:1, height:6, background:'rgba(255,255,255,.06)', borderRadius:3 }}>
                <div style={{ width:`${p}%`, height:'100%', background:c, borderRadius:3, opacity:.85 }}/>
              </div>
              <div style={{ fontFamily:'DM Mono, monospace', fontSize:'.72rem',
                color:c, width:70, textAlign:'right', flexShrink:0 }}>{v}</div>
            </div>
          ))}
          <div style={{ marginTop:'1rem', paddingTop:'.75rem', borderTop:'1px solid var(--border)',
            fontFamily:'DM Mono, monospace', fontSize:'.78rem', color:'var(--text2)', lineHeight:2.2 }}>
            nspam &gt; 1.000 →{' '}
            <span style={{ color: bayes.nspam >= 1000 ? 'var(--green)' : 'var(--red2)', fontWeight:700 }}>
              {bayes.nspam.toLocaleString('de-DE')}
            </span><br/>
            Verhältnis &lt; 1:10 →{' '}
            <span style={{ color: bRatio >= 0.1 ? 'var(--green)' : 'var(--amber)', fontWeight:700 }}>
              {ratioStr}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
