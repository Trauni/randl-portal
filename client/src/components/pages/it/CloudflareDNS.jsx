import { useState, useEffect, useCallback } from 'react';

const TYPE_COLOR = {
  A:'var(--blue)', AAAA:'#bc8cff', CNAME:'#39d3f0',
  MX:'var(--amber)', TXT:'var(--green)', NS:'var(--text3)',
};
const ALL_TYPES = ['A','AAAA','CNAME','MX','TXT','NS','SRV','CAA'];

// ── Toast ────────────────────────────────────────────────────────────
function useToast() {
  const [toast, setToast] = useState(null);
  const show = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3200);
  };
  return { toast, show };
}

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div style={{ position:'fixed', bottom:'1.5rem', right:'1.5rem', zIndex:999,
      background:'var(--bg1)', border:`1px solid ${toast.ok ? 'rgba(46,189,122,.4)' : 'rgba(224,80,80,.4)'}`,
      borderRadius:9, padding:'.6rem 1.1rem', fontSize:'.82rem', fontFamily:'DM Mono, monospace',
      color: toast.ok ? 'var(--green)' : 'var(--red2)' }}>
      {toast.ok ? '✓' : '✗'} {toast.msg}
    </div>
  );
}

// ── Pill Button ──────────────────────────────────────────────────────
function Pill({ children, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding:'.3rem .8rem', borderRadius:6, fontSize:'.75rem', border:'1px solid',
      borderColor: active ? 'rgba(184,49,31,.5)' : 'var(--border)',
      background:  active ? 'rgba(184,49,31,.12)' : 'transparent',
      color:       active ? 'var(--r)' : 'var(--text2)',
      cursor:'pointer', fontFamily:'DM Sans, sans-serif'
    }}>{children}</button>
  );
}

// ── Mono Input ───────────────────────────────────────────────────────
const MonoInput = ({ value, onChange, placeholder, width, type = 'text' }) => (
  <input type={type} value={value} onChange={e => onChange(e.target.value)}
    placeholder={placeholder}
    style={{ background:'var(--bg0)', border:'1px solid var(--border)', borderRadius:6,
      padding:'.28rem .55rem', color:'var(--text1)', fontFamily:'DM Mono, monospace',
      fontSize:'.78rem', outline:'none', width: width || '100%' }}/>
);

export default function CloudflareDNS() {
  const [zones,       setZones]       = useState([]);
  const [activeZone,  setActiveZone]  = useState(null);
  const [records,     setRecords]     = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [loadingZones,setLoadingZones]= useState(true);
  const [editId,      setEditId]      = useState(null);
  const [editData,    setEditData]    = useState({});
  const [showAdd,     setShowAdd]     = useState(false);
  const [newRec,      setNewRec]      = useState({ type:'A', name:'', content:'', ttl:'300' });
  const [bulkTtl,     setBulkTtl]     = useState('300');
  const [bulkMxTtl,   setBulkMxTtl]  = useState('60');
  const [bulkRunning, setBulkRunning] = useState(false);
  const [filter,      setFilter]      = useState('');
  const { toast, show } = useToast();

  // Zonen laden
  useEffect(() => {
    fetch('/api/it/cloudflare/zones')
      .then(r => r.json())
      .then(d => {
        if (d.ok && d.zones?.length) {
          setZones(d.zones);
          setActiveZone(d.zones[0].id);
        }
        setLoadingZones(false);
      })
      .catch(() => setLoadingZones(false));
  }, []);

  // Records laden wenn Zone wechselt
  useEffect(() => {
    if (!activeZone) return;
    setLoading(true);
    setEditId(null);
    fetch(`/api/it/cloudflare/records?zone_id=${activeZone}`)
      .then(r => r.json())
      .then(d => { setRecords(d.records || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [activeZone]);

  const reload = () => {
    if (!activeZone) return;
    setLoading(true);
    fetch(`/api/it/cloudflare/records?zone_id=${activeZone}`)
      .then(r => r.json())
      .then(d => { setRecords(d.records || []); setLoading(false); });
  };

  // Record speichern
  const saveEdit = async () => {
    const r = await fetch(`/api/it/cloudflare/records/${editId}`, {
      method:'PATCH',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ ...editData, zone_id: activeZone })
    }).then(r => r.json());
    if (r.ok) { show('Gespeichert'); setEditId(null); reload(); }
    else show(r.errors?.[0]?.message || r.error || 'Fehler', false);
  };

  // Record löschen
  const deleteRec = async (id) => {
    if (!confirm('Record löschen?')) return;
    const r = await fetch(`/api/it/cloudflare/records/${id}`, {
      method:'DELETE',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ zone_id: activeZone })
    }).then(r => r.json());
    if (r.ok) { show('Gelöscht'); reload(); }
    else show('Fehler beim Löschen', false);
  };

  // Record hinzufügen
  const addRec = async () => {
    const r = await fetch('/api/it/cloudflare/records', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ ...newRec, zone_id: activeZone })
    }).then(r => r.json());
    if (r.ok) {
      show('Record hinzugefügt');
      setNewRec({ type:'A', name:'', content:'', ttl:'300' });
      setShowAdd(false);
      reload();
    } else show(r.errors?.[0]?.message || r.error || 'Fehler', false);
  };

  // Bulk TTL
  const doBulkTtl = async () => {
    setBulkRunning(true);
    const r = await fetch('/api/it/cloudflare/bulk-ttl', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ zone_id: activeZone, ttl: bulkTtl, mx_ttl: bulkMxTtl })
    }).then(r => r.json());
    setBulkRunning(false);
    if (r.ok) {
      const ok  = r.results.filter(x => x.ok).length;
      const err = r.results.filter(x => !x.ok).length;
      show(`${ok} aktualisiert${err ? `, ${err} Fehler` : ''}`);
      reload();
    } else show(r.error || 'Fehler', false);
  };

  const filteredRecords = records.filter(r =>
    !filter || r.name.toLowerCase().includes(filter.toLowerCase()) ||
    r.content.toLowerCase().includes(filter.toLowerCase()) ||
    r.type.toLowerCase().includes(filter.toLowerCase())
  );

  const activeZoneName = zones.find(z => z.id === activeZone)?.name || '';

  return (
    <div>
      <Toast toast={toast}/>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
        marginBottom:'1.2rem', flexWrap:'wrap', gap:'.5rem' }}>
        <div>
          <h1 style={{ fontSize:'1.15rem', fontWeight:600, color:'var(--text1)' }}>Cloudflare DNS Manager</h1>
          <p style={{ color:'var(--text2)', fontSize:'.8rem', marginTop:'.2rem' }}>
            Records ansehen, bearbeiten, hinzufügen &amp; löschen
          </p>
        </div>
        <div style={{ display:'flex', gap:'.5rem', alignItems:'center' }}>
          <span style={{ fontSize:'.72rem', padding:'.2rem .6rem',
            background: zones.length ? 'rgba(46,189,122,.1)' : 'var(--bg2)',
            border:`1px solid ${zones.length ? 'rgba(46,189,122,.3)' : 'var(--border)'}`,
            borderRadius:6, color: zones.length ? 'var(--green)' : 'var(--text3)' }}>
            {zones.length} Zonen
          </span>
          <button onClick={reload} style={{ display:'flex', alignItems:'center', gap:'.4rem',
            padding:'.4rem .9rem', background:'var(--bg2)', border:'1px solid var(--border)',
            borderRadius:8, color:'var(--text2)', fontSize:'.82rem', cursor:'pointer' }}>
            ↻ Neu laden
          </button>
        </div>
      </div>

      {loadingZones && <div style={{ color:'var(--text3)', fontSize:'.85rem', padding:'1rem 0' }}>Lade Zonen…</div>}

      {/* Zonen-Tabs */}
      {zones.length > 0 && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:'.4rem', marginBottom:'1rem' }}>
          {zones.map(z => (
            <Pill key={z.id} active={activeZone === z.id} onClick={() => setActiveZone(z.id)}>
              {z.name}
            </Pill>
          ))}
        </div>
      )}

      {/* Bulk TTL */}
      <div style={{ background:'var(--bg1)', border:'1px solid var(--border)', borderRadius:9,
        padding:'.75rem 1rem', display:'flex', alignItems:'center', gap:'1rem',
        flexWrap:'wrap', marginBottom:'1rem' }}>
        <span style={{ fontSize:'.78rem', color:'var(--r)', fontWeight:600 }}>⚡ Bulk TTL:</span>
        <label style={{ display:'flex', alignItems:'center', gap:'.4rem', fontSize:'.78rem', color:'var(--text2)' }}>
          Alle
          <MonoInput value={bulkTtl} onChange={setBulkTtl} width="72px" type="number"/>s
        </label>
        <label style={{ display:'flex', alignItems:'center', gap:'.4rem', fontSize:'.78rem', color:'var(--text2)' }}>
          MX
          <MonoInput value={bulkMxTtl} onChange={setBulkMxTtl} width="72px" type="number"/>s
        </label>
        <button onClick={doBulkTtl} disabled={bulkRunning || !activeZone}
          style={{ padding:'.3rem .85rem', background:'rgba(184,49,31,.1)',
            border:'1px solid rgba(184,49,31,.35)', borderRadius:6, color:'var(--r)',
            fontSize:'.75rem', cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>
          {bulkRunning ? '…läuft' : 'Auf aktive Zone anwenden'}
        </button>
      </div>

      {/* Toolbar */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
        marginBottom:'.75rem', gap:'.5rem', flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'.5rem' }}>
          <span style={{ fontSize:'.68rem', fontWeight:700, letterSpacing:'.15em',
            textTransform:'uppercase', color:'var(--text3)' }}>{activeZoneName}</span>
          {records.length > 0 && (
            <span style={{ fontSize:'.68rem', color:'var(--text3)' }}>· {records.length} Records</span>
          )}
        </div>
        <div style={{ display:'flex', gap:'.5rem' }}>
          <input value={filter} onChange={e => setFilter(e.target.value)}
            placeholder="Filter…" style={{ background:'var(--bg0)',
              border:'1px solid var(--border)', borderRadius:7,
              padding:'.3rem .7rem', color:'var(--text1)', fontSize:'.8rem',
              outline:'none', width:160 }}/>
          <button onClick={() => setShowAdd(!showAdd)} style={{
            padding:'.3rem .9rem', background:'rgba(184,49,31,.1)',
            border:'1px solid rgba(184,49,31,.35)', borderRadius:7,
            color:'var(--r)', fontSize:'.78rem', cursor:'pointer' }}>
            + Record hinzufügen
          </button>
        </div>
      </div>

      {/* Add-Form */}
      {showAdd && (
        <div style={{ background:'var(--bg1)', border:'1px solid var(--border)', borderRadius:9,
          padding:'1rem', marginBottom:'1rem' }}>
          <div style={{ display:'grid', gridTemplateColumns:'90px 1fr 1fr 80px auto',
            gap:'.6rem', alignItems:'end' }}>
            <div>
              <div style={{ fontSize:'.65rem', color:'var(--text3)', textTransform:'uppercase',
                fontFamily:'DM Mono, monospace', marginBottom:'.25rem' }}>Typ</div>
              <select value={newRec.type} onChange={e => setNewRec(p => ({...p, type:e.target.value}))}
                style={{ width:'100%', background:'var(--bg0)', border:'1px solid var(--border)',
                  borderRadius:6, padding:'.3rem .5rem', color:'var(--text1)',
                  fontFamily:'DM Mono, monospace', fontSize:'.78rem' }}>
                {ALL_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize:'.65rem', color:'var(--text3)', textTransform:'uppercase',
                fontFamily:'DM Mono, monospace', marginBottom:'.25rem' }}>Name</div>
              <MonoInput value={newRec.name} onChange={v => setNewRec(p => ({...p,name:v}))}
                placeholder="subdomain oder @"/>
            </div>
            <div>
              <div style={{ fontSize:'.65rem', color:'var(--text3)', textTransform:'uppercase',
                fontFamily:'DM Mono, monospace', marginBottom:'.25rem' }}>Inhalt</div>
              <MonoInput value={newRec.content} onChange={v => setNewRec(p => ({...p,content:v}))}
                placeholder="IP, Hostname oder Wert"/>
            </div>
            <div>
              <div style={{ fontSize:'.65rem', color:'var(--text3)', textTransform:'uppercase',
                fontFamily:'DM Mono, monospace', marginBottom:'.25rem' }}>TTL</div>
              <MonoInput value={newRec.ttl} onChange={v => setNewRec(p => ({...p,ttl:v}))}
                width="100%" type="number"/>
            </div>
            <div style={{ paddingTop:'1.1rem' }}>
              <button onClick={addRec} style={{ padding:'.32rem .75rem',
                background:'rgba(46,189,122,.1)', border:'1px solid rgba(46,189,122,.3)',
                borderRadius:6, color:'var(--green)', fontSize:'.75rem',
                cursor:'pointer', whiteSpace:'nowrap' }}>Hinzufügen</button>
            </div>
          </div>
        </div>
      )}

      {/* Records-Tabelle */}
      <div style={{ background:'var(--bg1)', border:'1px solid var(--border)',
        borderRadius:9, overflow:'hidden' }}>
        <div style={{ overflowX:'auto' }}>
          {loading ? (
            <div style={{ color:'var(--text3)', textAlign:'center',
              padding:'2rem', fontSize:'.82rem' }}>Lade Records…</div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'.8rem' }}>
              <thead>
                <tr style={{ background:'var(--bg2)', borderBottom:'1px solid var(--border)' }}>
                  {['Typ','Name','Inhalt','TTL','Aktionen'].map(h => (
                    <th key={h} style={{ textAlign:'left', padding:'.5rem .75rem',
                      fontSize:'.65rem', textTransform:'uppercase', letterSpacing:'.06em',
                      color:'var(--text3)', fontFamily:'DM Mono, monospace' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map(rec => (
                  <tr key={rec.id} style={{ borderBottom:'1px solid rgba(255,255,255,.04)' }}>
                    {editId === rec.id ? (
                      // Edit-Row
                      <>
                        <td style={{ padding:'.4rem .6rem' }}>
                          <span style={{ fontFamily:'DM Mono, monospace', fontSize:'.78rem',
                            color: TYPE_COLOR[rec.type] || 'var(--text2)' }}>{rec.type}</span>
                        </td>
                        <td style={{ padding:'.4rem .6rem' }}>
                          <MonoInput value={editData.name}
                            onChange={v => setEditData(p => ({...p,name:v}))}/>
                        </td>
                        <td style={{ padding:'.4rem .6rem' }}>
                          <MonoInput value={editData.content}
                            onChange={v => setEditData(p => ({...p,content:v}))}/>
                        </td>
                        <td style={{ padding:'.4rem .6rem' }}>
                          <MonoInput value={editData.ttl}
                            onChange={v => setEditData(p => ({...p,ttl:v}))}
                            width="72px" type="number"/>
                        </td>
                        <td style={{ padding:'.4rem .6rem' }}>
                          <div style={{ display:'flex', gap:'.3rem' }}>
                            <button onClick={saveEdit} style={{ padding:'.22rem .55rem',
                              background:'rgba(46,189,122,.1)', border:'1px solid rgba(46,189,122,.3)',
                              borderRadius:5, color:'var(--green)', fontSize:'.7rem', cursor:'pointer' }}>
                              ✓ Speichern
                            </button>
                            <button onClick={() => setEditId(null)} style={{ padding:'.22rem .45rem',
                              background:'transparent', border:'1px solid var(--border)',
                              borderRadius:5, color:'var(--text3)', fontSize:'.7rem', cursor:'pointer' }}>
                              Abbrechen
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      // Normal-Row
                      <>
                        <td style={{ padding:'.45rem .75rem' }}>
                          <span style={{ fontFamily:'DM Mono, monospace', fontSize:'.78rem',
                            color: TYPE_COLOR[rec.type] || 'var(--text2)' }}>{rec.type}</span>
                        </td>
                        <td style={{ padding:'.45rem .75rem', fontFamily:'DM Mono, monospace',
                          fontSize:'.78rem', maxWidth:180, overflow:'hidden',
                          textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{rec.name}</td>
                        <td style={{ padding:'.45rem .75rem', fontFamily:'DM Mono, monospace',
                          fontSize:'.75rem', color:'var(--text2)', maxWidth:260,
                          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{rec.content}</td>
                        <td style={{ padding:'.45rem .75rem', fontFamily:'DM Mono, monospace',
                          fontSize:'.78rem' }}>{rec.ttl === 1 ? 'Auto' : rec.ttl + 's'}</td>
                        <td style={{ padding:'.45rem .75rem' }}>
                          <div style={{ display:'flex', gap:'.3rem' }}>
                            <button onClick={() => {
                              setEditId(rec.id);
                              setEditData({ name:rec.name, content:rec.content,
                                ttl: rec.ttl === 1 ? 300 : rec.ttl, type:rec.type });
                            }} style={{ padding:'.22rem .55rem',
                              background:'rgba(74,127,212,.08)', border:'1px solid rgba(74,127,212,.3)',
                              borderRadius:5, color:'var(--blue)', fontSize:'.7rem', cursor:'pointer' }}>
                              Edit
                            </button>
                            <button onClick={() => deleteRec(rec.id)} style={{ padding:'.22rem .45rem',
                              background:'rgba(224,80,80,.08)', border:'1px solid rgba(224,80,80,.25)',
                              borderRadius:5, color:'var(--red2)', fontSize:'.7rem', cursor:'pointer' }}>
                              ✕
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {filteredRecords.length === 0 && !loading && (
                  <tr>
                    <td colSpan={5} style={{ padding:'2rem', textAlign:'center',
                      color:'var(--text3)', fontSize:'.82rem' }}>
                      {filter ? 'Keine Records gefunden.' : 'Keine Records vorhanden.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
