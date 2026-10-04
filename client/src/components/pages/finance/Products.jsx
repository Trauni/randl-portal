import { useState, useEffect, useCallback } from 'react';

export default function Products() {
  const [products, setProducts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [q,        setQ]        = useState('');
  const [search,   setSearch]   = useState('');

  const load = useCallback(async (query) => {
    setLoading(true); setError('');
    try {
      const r = await fetch('/api/finance/products?q=' + encodeURIComponent(query || ''));
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setProducts(d.products || []);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(''); }, [load]);

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(q);
    load(q);
  };

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.2rem', flexWrap:'wrap', gap:'.5rem' }}>
        <div>
          <h1 style={{ fontSize:'1.15rem', fontWeight:600, color:'var(--text1)' }}>Produkte</h1>
          <p style={{ color:'var(--text2)', fontSize:'.8rem', marginTop:'.2rem' }}>
            Lexware Artikelstamm · {products.length} Artikel {search && `· Suche: "${search}"`}
          </p>
        </div>
        <form onSubmit={handleSearch} style={{ display:'flex', gap:'.5rem' }}>
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="Artikelname / Nummer…"
            style={{ background:'var(--bg0)', border:'1px solid var(--border)', borderRadius:7,
              padding:'.3rem .7rem', color:'var(--text1)', fontSize:'.8rem', outline:'none', width:200 }}/>
          <button type="submit" style={{ padding:'.4rem .9rem', background:'var(--r)',
            border:'none', borderRadius:8, color:'#fff', fontSize:'.82rem', cursor:'pointer' }}>
            Suchen
          </button>
          {search && <button type="button" onClick={() => { setQ(''); setSearch(''); load(''); }}
            style={{ padding:'.4rem .9rem', background:'var(--bg2)', border:'1px solid var(--border)',
              borderRadius:8, color:'var(--text2)', fontSize:'.82rem', cursor:'pointer' }}>
            ✕ Reset
          </button>}
        </form>
      </div>

      {error && (
        <div style={{ background:'rgba(224,80,80,.08)', border:'1px solid rgba(224,80,80,.3)',
          borderRadius:9, padding:'.75rem 1rem', color:'var(--red2)', fontSize:'.85rem', marginBottom:'1rem' }}>
          ✗ {error}
        </div>
      )}

      {loading ? (
        <div style={{ color:'var(--text3)', textAlign:'center', padding:'3rem' }}>Lade Artikel…</div>
      ) : (
        <div style={{ background:'var(--bg1)', border:'1px solid var(--border)', borderRadius:9, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'var(--bg2)', borderBottom:'1px solid var(--border)' }}>
                {['Artikelnummer','Bezeichnung','Einheit','Preis netto'].map(h => (
                  <th key={h} style={{ textAlign:'left', padding:'.5rem .75rem', fontSize:'.65rem',
                    textTransform:'uppercase', letterSpacing:'.08em', color:'var(--text3)',
                    fontFamily:'DM Mono, monospace', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id} style={{ borderBottom:'1px solid rgba(255,255,255,.04)' }}>
                  <td style={{ padding:'.5rem .75rem', fontFamily:'DM Mono, monospace',
                    fontSize:'.75rem', color:'var(--text3)' }}>{p.articleNumber}</td>
                  <td style={{ padding:'.5rem .75rem', fontSize:'.85rem', color:'var(--text1)', fontWeight:500 }}>{p.name}</td>
                  <td style={{ padding:'.5rem .75rem', fontSize:'.8rem', color:'var(--text2)' }}>{p.unit}</td>
                  <td style={{ padding:'.5rem .75rem', fontFamily:'DM Mono, monospace',
                    fontSize:'.82rem', color:'var(--green)', fontWeight:600 }}>
                    {p.price != null ? `${Number(p.price).toFixed(2)} €` : '—'}
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr><td colSpan={4} style={{ padding:'2rem', textAlign:'center',
                  color:'var(--text3)', fontSize:'.82rem' }}>
                  {search ? `Keine Artikel für "${search}" gefunden.` : 'Keine Artikel vorhanden.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
