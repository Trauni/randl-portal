import { useState, useRef, useEffect } from 'react';

export default function ProductSearch({ value, onChange, onSelect }) {
  const [q,       setQ]       = useState(value || '');
  const [results, setResults] = useState([]);
  const [open,    setOpen]    = useState(false);
  const [pos,     setPos]     = useState({ top:0, left:0, width:0 });
  const inputRef = useRef(null);
  const timer    = useRef(null);

  // Zieht die Anzeige nach, wenn `value` sich von aussen aendert (Reorder,
  // Index-Verschiebung nach dem Loeschen einer Zeile) - sonst haengt der Text
  // am einmalig gesetzten Mount-Wert fest (Bug: Reorder befuellt erste Zeile
  // nicht / Loeschen entfernt scheinbar die falsche Zeile).
  useEffect(() => {
    setQ(value || '');
  }, [value]);

  const updatePos = () => {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropH = Math.min(220, results.length * 48);
    const showAbove = spaceBelow < dropH + 8;
    const minWidth = 420;
    const width = Math.max(rect.width, minWidth);
    // nach rechts ausrichten falls zu weit rechts
    const left = Math.min(rect.left, window.innerWidth - width - 8);
    setPos({
      left,
      width,
      top: showAbove ? rect.top - dropH - 4 : rect.bottom + 2,
    });
  };

  useEffect(() => {
    if (open) updatePos();
  }, [open, results]);

  const search = (val) => {
    setQ(val);
    if (onChange) onChange(val);
    clearTimeout(timer.current);
    if (val.length < 2) { setResults([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      const r = await fetch('/api/finance/products?q=' + encodeURIComponent(val));
      const d = await r.json();
      setResults(d.products || []);
      setOpen(true);
    }, 300);
  };

  return (
    <div style={{ position:'relative' }}>
      <input ref={inputRef} value={q} onChange={e => search(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Artikel suchen (min. 2 Zeichen)..."
        style={{ background:'var(--bg0)', border:'1px solid var(--border)', borderRadius:6,
          padding:'.3rem .6rem', color:'var(--text1)', fontSize:'.8rem', outline:'none', width:'100%' }}/>
      {open && results.length > 0 && (
        <div style={{ position:'fixed', top: pos.top, left: pos.left, width: pos.width,
          background:'var(--bg1)', border:'1px solid var(--border)', borderRadius:7,
          zIndex:9999, maxHeight:220, overflowY:'auto',
          boxShadow:'0 4px 20px rgba(0,0,0,.6)' }}>
          {results.map(p => (
            <div key={p.id}
              onMouseDown={() => { onSelect(p); setQ(p.name); setOpen(false); }}
              style={{ padding:'.4rem .75rem', cursor:'pointer', fontSize:'.8rem',
                color:'var(--text1)', borderBottom:'1px solid rgba(255,255,255,.04)',
                display:'flex', justifyContent:'space-between', alignItems:'center', gap:'.75rem' }}
              onMouseEnter={e => e.currentTarget.style.background='var(--bg2)'}
              onMouseLeave={e => e.currentTarget.style.background='transparent'}>
              <div style={{ display:'flex', alignItems:'center', gap:'.5rem', minWidth:0, flex:1 }}>
                <span style={{ fontFamily:'DM Mono, monospace', fontSize:'.7rem',
                  color:'var(--text3)', flexShrink:0 }}>{p.articleNumber}</span>
                <span style={{ color:'var(--text1)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{p.name}</span>
              </div>
              <span style={{ color:'var(--green)', fontFamily:'DM Mono, monospace',
                fontSize:'.75rem', flexShrink:0 }}>{Number(p.price).toFixed(2)} €</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
