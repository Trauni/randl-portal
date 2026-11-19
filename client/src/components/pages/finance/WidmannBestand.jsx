import { useState, useEffect, useCallback } from 'react';
import { ProductSearch } from './Orders';

function Modal({ title, children, onClose, wide }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.85)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'var(--bg1)', border:'1px solid var(--border)', borderRadius:10, padding:'1.5rem', width:'90%', maxWidth: wide ? 680 : 480, maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
          <span style={{ fontWeight:600, color:'var(--text1)', fontSize:'.95rem' }}>{title}</span>
          <button onClick={onClose} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:6, color:'var(--text2)', cursor:'pointer', padding:'.2rem .55rem', fontSize:'.8rem' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ItemModal({ item, onClose, onSaved }) {
  const [form, setForm] = useState(item || { name:'', mindestbestand:0, lexware_article_number:'', sort_order:0 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    if (!form.name?.trim()) { setErr('Name ist Pflichtfeld'); return; }
    setBusy(true); setErr('');
    try {
      const url = item ? `/api/finance/widmann-bestand/items/${item.id}` : '/api/finance/widmann-bestand/items';
      const method = item ? 'PUT' : 'POST';
      const r = await fetch(url, { method, headers:{'Content-Type':'application/json'}, body: JSON.stringify(form) });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Fehler');
      onSaved();
    } catch(e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const inputStyle = { width:'100%', background:'var(--bg0)', border:'1px solid var(--border)', borderRadius:6, padding:'.35rem .6rem', color:'var(--text1)', fontSize:'.85rem', boxSizing:'border-box' };
  const labelStyle = { fontSize:'.68rem', color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:'.2rem' };

  return (
    <Modal title={item ? 'Gas bearbeiten' : 'Neues Gas anlegen'} onClose={onClose}>
      <div style={{ display:'grid', gap:'.75rem' }}>
        <div>
          <label style={labelStyle}>Name *</label>
          <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({...f, name:e.target.value}))} placeholder="z. B. Propan 33 kg" />
        </div>
        <div>
          <label style={labelStyle}>Mindestbestand</label>
          <input type="number" min="0" style={inputStyle} value={form.mindestbestand} onChange={e => setForm(f => ({...f, mindestbestand: e.target.value}))} />
        </div>
        <div>
          <label style={labelStyle}>Lexware-Artikelnummer (optional)</label>
          <input style={inputStyle} value={form.lexware_article_number || ''} onChange={e => setForm(f => ({...f, lexware_article_number:e.target.value}))} placeholder="z. B. RG-1234" />
          <div style={{ marginTop:'.4rem' }}>
            <ProductSearch value="" onChange={() => {}} onSelect={p => setForm(f => ({...f, lexware_article_number: p.articleNumber, name: f.name || p.name }))} />
            <div style={{ fontSize:'.7rem', color:'var(--text3)', marginTop:'.2rem' }}>Suche wählt die Artikelnummer automatisch aus.</div>
          </div>
        </div>
        {err && <div style={{ color:'var(--red2)', fontSize:'.8rem' }}>✗ {err}</div>}
        <div style={{ display:'flex', gap:'.5rem', justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ padding:'.4rem .8rem', borderRadius:7, background:'transparent', border:'1px solid var(--border)', color:'var(--text2)', cursor:'pointer', fontSize:'.8rem' }}>Abbrechen</button>
          <button onClick={save} disabled={busy} style={{ padding:'.4rem .9rem', borderRadius:7, background:'var(--r)', border:'none', color:'#fff', cursor:'pointer', fontSize:'.8rem' }}>{busy ? '…' : '✓ Speichern'}</button>
        </div>
      </div>
    </Modal>
  );
}

function CheckDetailModal({ checkId, onClose }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    fetch(`/api/finance/widmann-bestand/checks/${checkId}`).then(r => r.json()).then(setData).catch(() => {});
  }, [checkId]);
  if (!data) return <Modal title="Zählung" onClose={onClose}><div style={{ color:'var(--text3)' }}>Lädt…</div></Modal>;
  return (
    <Modal title={`Zählung vom ${new Date(data.check.created_at).toLocaleString('de-DE')}`} onClose={onClose} wide>
      <div style={{ fontSize:'.82rem', color:'var(--text2)', marginBottom:'.75rem' }}>
        Gezählt von: {data.check.checked_by_name || '—'}
        {data.check.note && <div style={{ marginTop:'.3rem' }}>📋 {data.check.note}</div>}
      </div>
      <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:8, padding:'.6rem .8rem', marginBottom:'.75rem' }}>
        <div style={{ fontSize:'.9rem', fontWeight:600, color:'var(--text1)' }}>
          Nachliefern: {data.ergebnis.summe} {data.ergebnis.summe === 1 ? 'Flasche' : 'Flaschen'}
        </div>
        {data.ergebnis.positionen === 0
          ? <div style={{ fontSize:'.78rem', color:'var(--text3)' }}>Nichts nachzuliefern.</div>
          : <ul style={{ margin:'.3rem 0 0 1rem', fontSize:'.8rem', color:'var(--text2)' }}>
              {data.entries.filter(e => e.nachliefern > 0).map(e => <li key={e.id}>{e.item_name}: {e.nachliefern}</li>)}
            </ul>}
      </div>
      <div style={{ background:'var(--bg2)', borderRadius:8, overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ borderBottom:'1px solid var(--border)' }}>
              {['Gas','Mindestbestand','Gezählt','Reserviert','Nachliefern'].map(h => (
                <th key={h} style={{ textAlign:'left', padding:'.4rem .6rem', fontSize:'.68rem', textTransform:'uppercase', color:'var(--text3)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.entries.map(e => (
              <tr key={e.id} style={{ borderBottom:'1px solid rgba(255,255,255,.04)' }}>
                <td style={{ padding:'.4rem .6rem', fontSize:'.82rem', color:'var(--text1)' }}>{e.item_name}</td>
                <td style={{ padding:'.4rem .6rem', fontSize:'.82rem', color:'var(--text2)', fontFamily:'DM Mono, monospace' }}>{e.mindestbestand}</td>
                <td style={{ padding:'.4rem .6rem', fontSize:'.82rem', color:'var(--text1)', fontFamily:'DM Mono, monospace' }}>{e.gezaehlt}</td>
                <td style={{ padding:'.4rem .6rem', fontSize:'.82rem', color:'var(--text2)', fontFamily:'DM Mono, monospace' }}>{e.reserviert || 0}</td>
                <td style={{ padding:'.4rem .6rem', fontSize:'.82rem', fontWeight: e.nachliefern > 0 ? 600 : 400, color: e.nachliefern > 0 ? 'var(--text1)' : 'var(--text3)', fontFamily:'DM Mono, monospace' }}>{e.nachliefern}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop:'1rem', display:'flex', justifyContent:'flex-end' }}>
        <a href={`/api/finance/widmann-bestand/checks/${checkId}/markdown`} download
          style={{ padding:'.4rem .8rem', borderRadius:7, fontSize:'.78rem', background:'rgba(74,127,212,.1)', border:'1px solid rgba(74,127,212,.3)', color:'var(--blue)', textDecoration:'none' }}>
          ⬇ Als .md herunterladen
        </a>
      </div>
    </Modal>
  );
}

export default function WidmannBestand() {
  const [tab, setTab] = useState('items');
  const [items, setItems] = useState([]);
  const [checks, setChecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editItem, setEditItem] = useState(null);
  const [detailCheckId, setDetailCheckId] = useState(null);

  const loadItems = useCallback(async () => {
    const r = await fetch('/api/finance/widmann-bestand/items/all');
    const d = await r.json();
    setItems(d.items || []);
  }, []);
  const loadChecks = useCallback(async () => {
    const r = await fetch('/api/finance/widmann-bestand/checks');
    const d = await r.json();
    setChecks(d.checks || []);
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadItems(), loadChecks()]).finally(() => setLoading(false));
  }, [loadItems, loadChecks]);

  const toggleActive = async (item) => {
    if (item.active) {
      await fetch(`/api/finance/widmann-bestand/items/${item.id}`, { method:'DELETE' });
    } else {
      await fetch(`/api/finance/widmann-bestand/items/${item.id}/restore`, { method:'POST' });
    }
    loadItems();
  };

  return (
    <div>
      {editItem !== null && <ItemModal item={editItem === true ? null : editItem} onClose={() => setEditItem(null)} onSaved={() => { setEditItem(null); loadItems(); }} />}
      {detailCheckId && <CheckDetailModal checkId={detailCheckId} onClose={() => setDetailCheckId(null)} />}

      <div style={{ marginBottom:'1.2rem' }}>
        <h1 style={{ fontSize:'1.15rem', fontWeight:600, color:'var(--text1)' }}>Widmann-Bestand</h1>
        <p style={{ color:'var(--text2)', fontSize:'.8rem', marginTop:'.2rem' }}>Artikelliste und Zählhistorie für die mittwöchentliche Bestandszählung, mit reserviert und nachliefern</p>
      </div>

      <div style={{ display:'flex', gap:'.5rem', marginBottom:'1rem' }}>
        <button onClick={() => setTab('items')} style={{ padding:'.35rem .8rem', borderRadius:7, fontSize:'.8rem', cursor:'pointer', background: tab==='items' ? 'var(--r)' : 'var(--bg2)', border:'1px solid var(--border)', color: tab==='items' ? '#fff' : 'var(--text2)' }}>Artikel</button>
        <button onClick={() => setTab('checks')} style={{ padding:'.35rem .8rem', borderRadius:7, fontSize:'.8rem', cursor:'pointer', background: tab==='checks' ? 'var(--r)' : 'var(--bg2)', border:'1px solid var(--border)', color: tab==='checks' ? '#fff' : 'var(--text2)' }}>Zählungen</button>
      </div>

      {loading ? <div style={{ color:'var(--text3)', textAlign:'center', padding:'2rem' }}>Lädt…</div> : tab === 'items' ? (
        <div style={{ background:'var(--bg1)', border:'1px solid var(--border)', borderRadius:9, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'var(--bg2)', borderBottom:'1px solid var(--border)' }}>
                {['Name','Mindestbestand','Lexware-Art.-Nr.','Status',''].map(h => (
                  <th key={h} style={{ textAlign:'left', padding:'.5rem .65rem', fontSize:'.65rem', textTransform:'uppercase', color:'var(--text3)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(it => (
                <tr key={it.id} style={{ borderBottom:'1px solid rgba(255,255,255,.04)', opacity: it.active ? 1 : .5 }}>
                  <td style={{ padding:'.5rem .65rem', fontSize:'.85rem', color:'var(--text1)' }}>{it.name}</td>
                  <td style={{ padding:'.5rem .65rem', fontSize:'.82rem', color:'var(--text2)', fontFamily:'DM Mono, monospace' }}>{it.mindestbestand}</td>
                  <td style={{ padding:'.5rem .65rem', fontSize:'.78rem', color:'var(--text3)', fontFamily:'DM Mono, monospace' }}>{it.lexware_article_number || '—'}</td>
                  <td style={{ padding:'.5rem .65rem', fontSize:'.78rem', color: it.active ? 'var(--green)' : 'var(--text3)' }}>{it.active ? 'aktiv' : 'ausgeblendet'}</td>
                  <td style={{ padding:'.5rem .65rem', display:'flex', gap:'.35rem' }}>
                    <button onClick={() => setEditItem(it)} style={{ padding:'.2rem .5rem', borderRadius:5, fontSize:'.75rem', background:'transparent', border:'1px solid var(--border)', color:'var(--text2)', cursor:'pointer' }}>Bearbeiten</button>
                    <button onClick={() => toggleActive(it)} style={{ padding:'.2rem .5rem', borderRadius:5, fontSize:'.75rem', background:'transparent', border:'1px solid var(--border)', color: it.active ? 'var(--red2)' : 'var(--green)', cursor:'pointer' }}>
                      {it.active ? 'Ausblenden' : 'Reaktivieren'}
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={5} style={{ padding:'2rem', textAlign:'center', color:'var(--text3)' }}>Noch keine Artikel angelegt.</td></tr>}
            </tbody>
          </table>
          <div style={{ padding:'.75rem' }}>
            <button onClick={() => setEditItem(true)} style={{ padding:'.35rem .8rem', borderRadius:7, fontSize:'.78rem', cursor:'pointer', background:'var(--blue)', border:'none', color:'#fff', fontWeight:600 }}>+ Neues Gas</button>
          </div>
        </div>
      ) : (
        <div style={{ background:'var(--bg1)', border:'1px solid var(--border)', borderRadius:9, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'var(--bg2)', borderBottom:'1px solid var(--border)' }}>
                {['Datum','Gezählt von','Positionen','Nachliefern','Notiz',''].map(h => (
                  <th key={h} style={{ textAlign:'left', padding:'.5rem .65rem', fontSize:'.65rem', textTransform:'uppercase', color:'var(--text3)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {checks.map(c => (
                <tr key={c.id} style={{ borderBottom:'1px solid rgba(255,255,255,.04)' }}>
                  <td style={{ padding:'.5rem .65rem', fontSize:'.82rem', color:'var(--text2)' }}>{new Date(c.created_at).toLocaleString('de-DE')}</td>
                  <td style={{ padding:'.5rem .65rem', fontSize:'.85rem', color:'var(--text1)' }}>{c.checked_by_name || '—'}</td>
                  <td style={{ padding:'.5rem .65rem', fontSize:'.82rem', color:'var(--text2)' }}>{c.entry_count}</td>
                  <td style={{ padding:'.5rem .65rem', fontSize:'.82rem', color:'var(--text1)', fontFamily:'DM Mono, monospace' }}>{c.nachliefern_summe}</td>
                  <td style={{ padding:'.5rem .65rem', fontSize:'.78rem', color:'var(--text3)' }}>{c.note || '—'}</td>
                  <td style={{ padding:'.5rem .65rem', display:'flex', gap:'.35rem' }}>
                    <button onClick={() => setDetailCheckId(c.id)} style={{ padding:'.2rem .5rem', borderRadius:5, fontSize:'.75rem', background:'transparent', border:'1px solid var(--border)', color:'var(--text2)', cursor:'pointer' }}>Detail</button>
                    <a href={`/api/finance/widmann-bestand/checks/${c.id}/markdown`} download
                      style={{ padding:'.2rem .5rem', borderRadius:5, fontSize:'.75rem', background:'transparent', border:'1px solid rgba(74,127,212,.3)', color:'var(--blue)', textDecoration:'none' }}>⬇ .md</a>
                  </td>
                </tr>
              ))}
              {checks.length === 0 && <tr><td colSpan={6} style={{ padding:'2rem', textAlign:'center', color:'var(--text3)' }}>Noch keine Zählung erfasst.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
