import { useState, useEffect, useCallback } from 'react';
import ProductSearch from './ProductSearch';

const INTERVAL_LABELS = { weekly:'Wöchentlich', biweekly:'14-tägig', monthly:'Monatlich' };

function Modal({ title, children, onClose, wide }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.85)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'var(--bg1)', border:'1px solid var(--border)', borderRadius:10, padding:'1.5rem', width:'90%', maxWidth: wide ? 700 : 480, maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
          <span style={{ fontWeight:600, color:'var(--text1)', fontSize:'.95rem' }}>{title}</span>
          <button onClick={onClose} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:6, color:'var(--text2)', cursor:'pointer', padding:'.2rem .55rem', fontSize:'.8rem' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function RecurringForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || { customer_name:'', customer_number:'', interval:'biweekly', notes:'', active:true, items:[{ productName:'', articleNumber:'', quantity:'', unitPriceNet:0, emptyReturn:'' }] });
  const [busy, setBusy] = useState(false);
  const [msg,  setMsg]  = useState('');


  const setItem = (i, k, v) => setForm(p => ({ ...p, items: p.items.map((it,idx) => idx===i ? { ...it, [k]:v } : it) }));


  const totalNet = form.items.reduce((s,i) => s + (parseFloat(i.unitPriceNet)||0)*(parseInt(i.quantity)||0), 0);

  const submit = async () => {
    if (!form.customer_name.trim()) return setMsg('✗ Kundenname erforderlich');
    setBusy(true); setMsg('');
    try {
      await onSave({ ...form, items: form.items.map(it => ({ ...it, quantity: parseInt(it.quantity)||0, emptyReturn: parseInt(it.emptyReturn)||0 })) });
    } catch(e) { setMsg('✗ ' + e.message); setBusy(false); }
  };

  const inp = (k, type='text') => ({
    type, value: form[k] ?? '',
    onChange: e => setForm(p => ({ ...p, [k]: e.target.value })),
    style: { background:'var(--bg0)', border:'1px solid var(--border)', borderRadius:6, padding:'.3rem .6rem', color:'var(--text1)', fontSize:'.82rem', outline:'none', width:'100%' }
  });

  return (<>
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.5rem .75rem', marginBottom:'1rem' }}>
      <div style={{ gridColumn:'1/-1' }}>
        <div style={{ fontSize:'.68rem', color:'var(--text3)', marginBottom:'.2rem' }}>Kundenname *</div>
        <input {...inp('customer_name')} placeholder="Firmenname oder Name"/>
      </div>
      <div>
        <div style={{ fontSize:'.68rem', color:'var(--text3)', marginBottom:'.2rem' }}>Kundennummer</div>
        <input {...inp('customer_number')}/>
      </div>
      <div>
        <div style={{ fontSize:'.68rem', color:'var(--text3)', marginBottom:'.2rem' }}>Turnus</div>
        <select value={form.interval} onChange={e => setForm(p => ({ ...p, interval:e.target.value }))}
          style={{ background:'var(--bg0)', border:'1px solid var(--border)', borderRadius:6, padding:'.3rem .6rem', color:'var(--text1)', fontSize:'.82rem', outline:'none', width:'100%' }}>
          <option value="weekly">Wöchentlich</option>
          <option value="biweekly">14-tägig</option>
          <option value="monthly">Monatlich</option>
        </select>
      </div>
      <div style={{ gridColumn:'1/-1' }}>
        <div style={{ fontSize:'.68rem', color:'var(--text3)', marginBottom:'.2rem' }}>Notiz / Lieferhinweis</div>
        <input {...inp('notes')}/>
      </div>
    </div>

    <div style={{ fontSize:'.72rem', fontWeight:600, color:'var(--text1)', marginBottom:'.5rem' }}>Artikel</div>
    {form.items.map((item, i) => (
      <div key={i} style={{ background:'var(--bg2)', borderRadius:8, padding:'.75rem', marginBottom:'.5rem' }}>
        <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr auto', gap:'.4rem', alignItems:'end' }}>
          <div>
            <div style={{ fontSize:'.65rem', color:'var(--text3)', marginBottom:'.15rem' }}>Artikel</div>
            <ProductSearch
              value={item.productName}
              onChange={v => setForm(p => ({ ...p, items: p.items.map((it,idx) => idx===i ? { ...it, productName:v } : it) }))}
              onSelect={p => setForm(prev => ({ ...prev, items: prev.items.map((it,idx) => idx===i ? { ...it, product_id:p.articleNumber, productName:p.name, articleNumber:p.articleNumber, unitPriceNet:p.price } : it) }))}/>
          </div>
          <div>
            <div style={{ fontSize:'.65rem', color:'var(--text3)', marginBottom:'.15rem' }}>Menge</div>
            <input type="number" min="0" value={item.quantity} placeholder="0" onChange={e => setItem(i,'quantity',e.target.value)}
              style={{ background:'var(--bg0)', border:'1px solid var(--border)', borderRadius:6, padding:'.3rem .4rem', color:'var(--text1)', fontSize:'.78rem', outline:'none', width:'100%' }}/>
          </div>
          <div>
            <div style={{ fontSize:'.65rem', color:'var(--text3)', marginBottom:'.15rem' }}>Preis netto</div>
            <input type="number" step="0.01" value={item.unitPriceNet} onChange={e => setItem(i,'unitPriceNet',parseFloat(e.target.value)||0)}
              style={{ background:'var(--bg0)', border:'1px solid var(--border)', borderRadius:6, padding:'.3rem .4rem', color:'var(--text1)', fontSize:'.78rem', outline:'none', width:'100%' }}/>
          </div>
          <div>
            <div style={{ fontSize:'.65rem', color:'var(--text3)', marginBottom:'.15rem' }}>Leergut</div>
            <input type="number" min="0" value={item.emptyReturn} placeholder="0" onChange={e => setItem(i,'emptyReturn',e.target.value)}
              style={{ background:'var(--bg0)', border:'1px solid var(--border)', borderRadius:6, padding:'.3rem .4rem', color:'var(--text1)', fontSize:'.78rem', outline:'none', width:'100%' }}/>
          </div>
          {form.items.length > 1 && <button onClick={() => setForm(p => ({ ...p, items: p.items.filter((_,idx) => idx!==i) }))}
            style={{ background:'transparent', border:'1px solid rgba(224,80,80,.3)', borderRadius:6, color:'var(--red2)', cursor:'pointer', padding:'.3rem .4rem', fontSize:'.8rem' }}>✕</button>}
        </div>
      </div>
    ))}
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
      <button onClick={() => setForm(p => ({ ...p, items: [...p.items, { productName:'', articleNumber:'', quantity:'', unitPriceNet:0, emptyReturn:'' }] }))}
        style={{ padding:'.3rem .7rem', borderRadius:7, fontSize:'.78rem', cursor:'pointer', background:'var(--bg2)', border:'1px solid var(--border)', color:'var(--text2)' }}>+ Artikel</button>
      <span style={{ fontFamily:'DM Mono, monospace', fontSize:'.85rem', color:'var(--green)' }}>Gesamt netto: {totalNet.toFixed(2)} €</span>
    </div>

    {msg && <div style={{ padding:'.4rem .75rem', borderRadius:7, marginBottom:'.75rem', fontSize:'.82rem', background:'rgba(224,80,80,.08)', border:'1px solid rgba(224,80,80,.3)', color:'var(--red2)' }}>{msg}</div>}
    <div style={{ display:'flex', gap:'.5rem' }}>
      <button disabled={busy} onClick={submit} style={{ padding:'.4rem .9rem', borderRadius:7, fontSize:'.78rem', cursor:'pointer', background:'var(--r)', border:'none', color:'#fff' }}>{busy ? '…' : '✓ Speichern'}</button>
      <button onClick={onClose} style={{ padding:'.4rem .8rem', borderRadius:7, fontSize:'.78rem', cursor:'pointer', background:'var(--bg2)', border:'1px solid var(--border)', color:'var(--text2)' }}>Abbrechen</button>
    </div>
  </>);
}

export default function RecurringOrders() {
  const [orders,  setOrders]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [editId,  setEditId]  = useState(null);
  const [creating,setCreating]= useState(false);
  const [busy,    setBusy]    = useState({});
  const [msg,     setMsg]     = useState({});

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await fetch('/api/finance/recurring');
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setOrders(d.recurringOrders || []);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const send = async (id) => {
    setBusy(p => ({ ...p, [id]:'send' })); setMsg(p => ({ ...p, [id]:'' }));
    try {
      const r = await fetch('/api/finance/recurring/' + id + '/send', { method:'POST' });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setMsg(p => ({ ...p, [id]:'✓ Bestellung angelegt' }));
      load();
    } catch(e) { setMsg(p => ({ ...p, [id]:'✗ ' + e.message })); }
    finally { setBusy(p => ({ ...p, [id]:'' })); }
  };

  const del = async (id, name) => {
    if (!confirm('Stammkunde "' + name + '" wirklich löschen?')) return;
    try {
      await fetch('/api/finance/recurring/' + id, { method:'DELETE' });
      load();
    } catch(e) { alert(e.message); }
  };

  const saveNew = async (form) => {
    const r = await fetch('/api/finance/recurring', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(form)
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    setCreating(false); load();
  };

  const saveEdit = async (form) => {
    const r = await fetch('/api/finance/recurring/' + editId, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(form)
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    setEditId(null); load();
  };

  const active  = orders.filter(o => o.active);
  const inactive= orders.filter(o => !o.active);

  const Row = ({ o }) => {
    const items = typeof o.items === 'string' ? JSON.parse(o.items) : o.items;
    const net = items.reduce((s,i) => s + (parseFloat(i.unitPriceNet)||0)*(parseInt(i.quantity)||0), 0);
    return (
      <tr style={{ borderBottom:'1px solid rgba(255,255,255,.04)', opacity: o.active ? 1 : .5 }}>
        <td style={{ padding:'.5rem .65rem', fontSize:'.85rem', color:'var(--text1)', fontWeight:500 }}>
          {o.customer_name}
          <div style={{ fontSize:'.72rem', color:'var(--text3)', fontFamily:'DM Mono, monospace' }}>KD {o.customer_number || '—'}</div>
        </td>
        <td style={{ padding:'.5rem .65rem', fontSize:'.78rem', color:'var(--text2)' }}>
          {items.map((i,idx) => <div key={idx}>{i.quantity}× {i.productName}</div>)}
        </td>
        <td style={{ padding:'.5rem .65rem' }}>
          <span style={{ fontSize:'.72rem', padding:'.15rem .45rem', borderRadius:4, background:'rgba(74,127,212,.12)', border:'1px solid rgba(74,127,212,.3)', color:'var(--blue)', fontFamily:'DM Mono, monospace' }}>
            {INTERVAL_LABELS[o.interval] || o.interval}
          </span>
        </td>
        <td style={{ padding:'.5rem .65rem', fontFamily:'DM Mono, monospace', fontSize:'.78rem', color:'var(--text2)' }}>
          {o.last_sent_at ? new Date(o.last_sent_at).toLocaleDateString('de-DE') : '—'}
        </td>
        <td style={{ padding:'.5rem .65rem', fontFamily:'DM Mono, monospace', fontSize:'.8rem', color:'var(--green)' }}>
          {net.toFixed(2)} €
        </td>
        <td style={{ padding:'.5rem .65rem' }}>
          <div style={{ display:'flex', gap:'.3rem', alignItems:'center' }}>
            <button disabled={!!busy[o.id]} onClick={() => send(o.id)}
              style={{ padding:'.22rem .55rem', borderRadius:5, fontSize:'.75rem', cursor:'pointer', background:'rgba(46,189,122,.1)', border:'1px solid rgba(46,189,122,.3)', color:'var(--green)' }}>
              {busy[o.id]==='send' ? '…' : '▶ Senden'}
            </button>
            <button onClick={() => setEditId(o.id)}
              style={{ padding:'.22rem .55rem', borderRadius:5, fontSize:'.75rem', cursor:'pointer', background:'transparent', border:'1px solid var(--border)', color:'var(--text2)' }}>✏</button>
            <button onClick={() => del(o.id, o.customer_name)}
              style={{ padding:'.22rem .55rem', borderRadius:5, fontSize:'.75rem', cursor:'pointer', background:'rgba(224,80,80,.08)', border:'1px solid rgba(224,80,80,.3)', color:'var(--red2)' }}>✕</button>
          </div>
          {msg[o.id] && <div style={{ fontSize:'.7rem', marginTop:'.2rem', color: msg[o.id].startsWith('✓') ? 'var(--green)' : 'var(--red2)' }}>{msg[o.id]}</div>}
        </td>
      </tr>
    );
  };

  const Table = ({ rows }) => (
    <div style={{ background:'var(--bg1)', border:'1px solid var(--border)', borderRadius:9, overflow:'hidden', marginBottom:'1rem' }}>
      <table style={{ width:'100%', borderCollapse:'collapse' }}>
        <thead>
          <tr style={{ background:'var(--bg2)', borderBottom:'1px solid var(--border)' }}>
            {['Kunde','Artikel','Turnus','Zuletzt gesendet','Netto','Aktionen'].map(h => (
              <th key={h} style={{ textAlign:'left', padding:'.5rem .65rem', fontSize:'.65rem', textTransform:'uppercase', letterSpacing:'.08em', color:'var(--text3)', fontFamily:'DM Mono, monospace', whiteSpace:'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{rows.map(o => <Row key={o.id} o={o}/>)}</tbody>
      </table>
    </div>
  );

  return (
    <div>
      {creating && <Modal title="Neuer Stammkunde" onClose={() => setCreating(false)} wide><RecurringForm onSave={saveNew} onClose={() => setCreating(false)}/></Modal>}
      {editId && <Modal title="Stammkunde bearbeiten" onClose={() => setEditId(null)} wide>
        <RecurringForm initial={(() => { const o = orders.find(x => x.id===editId); if(!o) return null; const items = typeof o.items==='string' ? JSON.parse(o.items) : o.items; return { ...o, items }; })()} onSave={saveEdit} onClose={() => setEditId(null)}/>
      </Modal>}

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.2rem' }}>
        <div>
          <h1 style={{ fontSize:'1.15rem', fontWeight:600, color:'var(--text1)' }}>Stammkunden</h1>
          <p style={{ color:'var(--text2)', fontSize:'.8rem', marginTop:'.2rem' }}>{active.length} aktiv · {inactive.length} inaktiv</p>
        </div>
        <div style={{ display:'flex', gap:'.5rem' }}>
          <button onClick={load} style={{ padding:'.4rem .8rem', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text2)', fontSize:'.8rem', cursor:'pointer' }}>↻</button>
          <button onClick={() => setCreating(true)} style={{ padding:'.4rem .9rem', background:'var(--r)', border:'none', borderRadius:8, color:'#fff', fontSize:'.82rem', cursor:'pointer' }}>+ Stammkunde</button>
        </div>
      </div>

      {error && <div style={{ background:'rgba(224,80,80,.08)', border:'1px solid rgba(224,80,80,.3)', borderRadius:9, padding:'.75rem 1rem', color:'var(--red2)', fontSize:'.85rem', marginBottom:'1rem' }}>✗ {error}</div>}

      {loading ? <div style={{ color:'var(--text3)', textAlign:'center', padding:'3rem' }}>Lade Stammkunden…</div> : (<>
        {active.length > 0 && <><div style={{ fontSize:'.75rem', fontWeight:600, color:'var(--text1)', marginBottom:'.5rem' }}>Aktiv ({active.length})</div><Table rows={active}/></>}
        {inactive.length > 0 && <><div style={{ fontSize:'.75rem', fontWeight:600, color:'var(--text3)', marginBottom:'.5rem', marginTop:'1rem' }}>Inaktiv ({inactive.length})</div><Table rows={inactive}/></>}
        {orders.length === 0 && <div style={{ color:'var(--text3)', textAlign:'center', padding:'3rem', fontSize:'.82rem' }}>Keine Stammkunden vorhanden.</div>}
      </>)}
    </div>
  );
}
