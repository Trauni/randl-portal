import { useState, useEffect, useRef } from 'react';

const LINE_OPTIONS = [50, 100, 200, 500];

export default function Logs() {
  const [sources,  setSources]  = useState([]);
  const [activeSrc,setActiveSrc]= useState('auth');
  const [lines,    setLines]    = useState([]);
  const [file,     setFile]     = useState('');
  const [srcLabel, setSrcLabel] = useState('');
  const [n,        setN]        = useState(100);
  const [loading,  setLoading]  = useState(false);
  const [filter,   setFilter]   = useState('');
  const preRef = useRef(null);

  // Quellen laden
  useEffect(() => {
    fetch('/api/it/logs/sources')
      .then(r => r.json())
      .then(d => { if (d.sources) setSources(d.sources); });
  }, []);

  const load = async (src = activeSrc, lines_n = n) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/it/logs/data?src=${src}&n=${lines_n}`);
      const d = await r.json();
      setLines(d.lines || []);
      setFile(d.file || '');
      setSrcLabel(d.source || '');
    } catch {}
    setLoading(false);
    // Scroll to bottom
    setTimeout(() => {
      if (preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight;
    }, 50);
  };

  useEffect(() => { if (sources.length) load(); }, [activeSrc, n, sources]);

  const switchSrc = (id) => { setActiveSrc(id); setFilter(''); };

  const filteredLines = filter
    ? lines.filter(l => l.line.toLowerCase().includes(filter.toLowerCase()))
    : lines;

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
        marginBottom:'.75rem', flexWrap:'wrap', gap:'.5rem' }}>
        <div>
          <h1 style={{ fontSize:'1.15rem', fontWeight:600, color:'var(--text1)' }}>System Logs</h1>
          <p style={{ color:'var(--text3)', fontSize:'.75rem', marginTop:'.2rem',
            fontFamily:'DM Mono, monospace' }}>{file}</p>
        </div>
        <div style={{ display:'flex', gap:'.4rem', alignItems:'center' }}>
          {LINE_OPTIONS.map(opt => (
            <button key={opt} onClick={() => setN(opt)} style={{
              padding:'.25rem .55rem', borderRadius:5, fontSize:'.75rem',
              border:'1px solid', cursor:'pointer',
              borderColor: n === opt ? 'rgba(184,49,31,.5)' : 'var(--border)',
              background:  n === opt ? 'rgba(184,49,31,.1)' : 'transparent',
              color:       n === opt ? 'var(--r)' : 'var(--text2)',
            }}>{opt}</button>
          ))}
          <button onClick={() => load()} style={{ padding:'.3rem .75rem',
            background:'var(--bg2)', border:'1px solid var(--border)',
            borderRadius:7, color:'var(--text2)', fontSize:'.8rem', cursor:'pointer' }}>
            ↻
          </button>
        </div>
      </div>

      {/* Source Tabs */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:'.35rem', marginBottom:'.75rem' }}>
        {sources.map(s => (
          <button key={s.id} onClick={() => switchSrc(s.id)} style={{
            padding:'.28rem .7rem', borderRadius:6, fontSize:'.75rem',
            border:'1px solid', cursor:'pointer', fontFamily:'DM Sans, sans-serif',
            borderColor: activeSrc === s.id ? 'rgba(184,49,31,.5)' : 'var(--border)',
            background:  activeSrc === s.id ? 'rgba(184,49,31,.1)' : 'transparent',
            color:       activeSrc === s.id ? 'var(--r)' : 'var(--text2)',
          }}>{s.label}</button>
        ))}
      </div>

      {/* Filter */}
      <input value={filter} onChange={e => setFilter(e.target.value)}
        placeholder="Live-Filter…"
        style={{ width:'100%', maxWidth:400, background:'var(--bg0)',
          border:'1px solid var(--border)', borderRadius:7,
          padding:'.35rem .75rem', color:'var(--text1)', fontSize:'.8rem',
          outline:'none', marginBottom:'.75rem', fontFamily:'DM Mono, monospace' }}/>

      {/* Log Output */}
      <div style={{ background:'var(--bg0)', border:'1px solid var(--border)',
        borderRadius:9, overflow:'hidden' }}>
        {/* Stats bar */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
          padding:'.4rem .75rem', borderBottom:'1px solid var(--border)',
          background:'var(--bg1)', fontSize:'.72rem', color:'var(--text3)' }}>
          <span>{srcLabel} · {filteredLines.length} Zeilen{filter ? ` (gefiltert aus ${lines.length})` : ''}</span>
          <div style={{ display:'flex', gap:'1rem' }}>
            {[['var(--red2)','Fehler'],['var(--amber)','Warnung'],['var(--green)','OK']].map(([c,l]) => (
              <span key={l} style={{ display:'flex', alignItems:'center', gap:'.3rem' }}>
                <span style={{ width:8, height:8, borderRadius:2, background:c, display:'inline-block' }}/>
                {l}
              </span>
            ))}
          </div>
        </div>

        <pre ref={preRef}
          style={{ margin:0, padding:'1rem', fontFamily:'DM Mono, monospace',
            fontSize:'.72rem', lineHeight:1.65, overflowY:'auto',
            maxHeight:'65vh', whiteSpace:'pre-wrap', wordBreak:'break-all' }}>
          {loading ? (
            <span style={{ color:'var(--text3)' }}>Lade…</span>
          ) : filteredLines.length === 0 ? (
            <span style={{ color:'var(--text3)' }}>
              {filter ? 'Keine Zeilen gefunden.' : 'Log-Datei leer oder nicht lesbar.'}
            </span>
          ) : (
            filteredLines.map((l, i) => (
              <span key={i} style={{ color: l.color, display:'block',
                padding:'.05rem 0', borderBottom:'1px solid rgba(255,255,255,.025)' }}>
                {l.line}
              </span>
            ))
          )}
        </pre>
      </div>
    </div>
  );
}
