import { useState, useEffect, useCallback, useRef } from 'react';
import { NewOrderModal } from './Customers';

function StatusBadge({ status }) {
  const cfg = {
    pending:       { bg:'rgba(232,160,32,.12)', border:'rgba(232,160,32,.3)',  color:'var(--amber)' },
    confirmed:     { bg:'rgba(74,127,212,.12)', border:'rgba(74,127,212,.3)',  color:'var(--blue)'  },
    delivered:     { bg:'rgba(46,189,122,.12)', border:'rgba(46,189,122,.3)',  color:'var(--green)' },
    cancelled:     { bg:'rgba(224,80,80,.1)',   border:'rgba(224,80,80,.25)', color:'var(--red2)'  },
    new:           { bg:'rgba(74,127,212,.12)', border:'rgba(74,127,212,.3)',  color:'var(--blue)'  },
    xml_generated: { bg:'rgba(232,160,32,.12)', border:'rgba(232,160,32,.3)',  color:'var(--amber)' },
    in_lexware:    { bg:'rgba(46,189,122,.12)', border:'rgba(46,189,122,.3)',  color:'var(--green)' },
  };
  const s = cfg[status] || cfg.pending;
  const labels = { pending:'Ausstehend', confirmed:'Bestätigt', delivered:'Geliefert', cancelled:'Storniert', new:'Neu', xml_generated:'XML', in_lexware:'Lexware' };
  return <span style={{ fontSize:'.7rem', padding:'.12rem .45rem', borderRadius:4, background:s.bg, border:`1px solid ${s.border}`, color:s.color, fontFamily:'DM Mono, monospace' }}>{labels[status] || status}</span>;
}

function SerBadge({ ser_status }) {
  const cfg = { ok:{ color:'var(--green)', label:'SER ✓' }, err:{ color:'var(--red2)', label:'SER ✗' }, pending:{ color:'var(--amber)', label:'SER …' } };
  if (!ser_status || ser_status === 'none') return <span style={{ color:'var(--text3)', fontSize:'.7rem' }}>—</span>;
  const c = cfg[ser_status] || cfg.pending;
  return <span style={{ fontSize:'.7rem', color:c.color, fontFamily:'DM Mono, monospace' }}>{c.label}</span>;
}

function channelLabel(o) {
  const who = o.created_by ? ` ${o.created_by}` : '';
  if (o.order_channel === 'mobile') return `Mobile${who}`;
  if (o.order_channel === 'portal') return `Portal${who}`;
  return 'Shop';
}
function OrderStatusBadge({ order }) {
  const cfg = {
    bestellt:     { color:'var(--blue)',  label:'Bestellt' },
    uebermittelt: { color:'var(--amber)', label:'SER übermittelt' },
    akzeptiert:   { color:'var(--green)', label:'SER akzeptiert' },
    abgelehnt:    { color:'var(--red2)',  label:'SER abgelehnt' },
    storniert:    { color:'var(--text3)', label:'Storniert' },
  };
  let key = 'bestellt';
  if (order.status === 'cancelled') key = 'storniert';
  else if (order.ser_status === 'ok') key = 'akzeptiert';
  else if (order.ser_status === 'err' || order.ser_status === 'upload_error') key = 'abgelehnt';
  else if (order.ser_status === 'pending') key = 'uebermittelt';
  const c = cfg[key];
  return <span style={{ fontSize:'.7rem', color:c.color, fontFamily:'DM Mono, monospace' }}>{c.label}</span>;
}

function Modal({ title, children, onClose, wide }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.85)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'var(--bg1)', border:'1px solid var(--border)', borderRadius:10, padding:'1.5rem', width:'90%', maxWidth: wide ? 680 : 520, maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
          <span style={{ fontWeight:600, color:'var(--text1)', fontSize:'.95rem' }}>{title}</span>
          <button onClick={onClose} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:6, color:'var(--text2)', cursor:'pointer', padding:'.2rem .55rem', fontSize:'.8rem' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CustomerPicker({ onSelect, onClose }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);

  const search = (val) => {
    setQ(val);
    clearTimeout(timer.current);
    if (val.length < 2) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      setBusy(true);
      const r = await fetch('/api/finance/customers?q=' + encodeURIComponent(val));
      const d = await r.json();
      setResults(d.customers || []);
      setBusy(false);
    }, 300);
  };

  return (
    <Modal title="Kunde auswählen" onClose={onClose}>
      <input autoFocus value={q} onChange={e => search(e.target.value)}
        placeholder="Name, Firma, Kundennummer, PLZ…"
        style={{ background:'var(--bg0)', border:'1px solid var(--border)', borderRadius:6, padding:'.4rem .6rem', color:'var(--text1)', fontSize:'.85rem', outline:'none', width:'100%', marginBottom:'.75rem' }}/>
      {busy && <div style={{ fontSize:'.78rem', color:'var(--text3)' }}>Suche…</div>}
      {results.map(c => (
        <div key={c.id} onClick={() => onSelect(c)}
          style={{ padding:'.5rem .6rem', borderRadius:6, cursor:'pointer', marginBottom:'.3rem', background:'var(--bg2)', border:'1px solid var(--border)' }}>
          <div style={{ fontSize:'.85rem', color:'var(--text1)' }}>{c.company_name || c.name}</div>
          <div style={{ fontSize:'.72rem', color:'var(--text3)' }}>{c.lexware_customer_number || c.customer_number} · {c.billing_zip} {c.billing_city}</div>
        </div>
      ))}
      {!busy && q.length >= 2 && results.length === 0 && (
        <div style={{ fontSize:'.78rem', color:'var(--text3)' }}>Keine Treffer.</div>
      )}
    </Modal>
  );
}

function ProductSearch({ value, onChange, onSelect }) {
  const [q, setQ] = useState(value || '');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const timer = useRef(null);

  const search = (val) => {
    setQ(val); onChange(val);
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
      <input value={q} onChange={e => search(e.target.value)}
        placeholder="Artikel suchen…"
        style={{ background:'var(--bg0)', border:'1px solid var(--border)', borderRadius:6, padding:'.3rem .6rem', color:'var(--text1)', fontSize:'.8rem', outline:'none', width:'100%' }}/>
      {open && results.length > 0 && (
        <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'var(--bg1)', border:'1px solid var(--border)', borderRadius:7, zIndex:100, maxHeight:200, overflowY:'auto', marginTop:2 }}>
          {results.map(p => (
            <div key={p.id} onClick={() => { onSelect(p); setQ(p.name); setOpen(false); }}
              style={{ padding:'.4rem .7rem', cursor:'pointer', fontSize:'.8rem', color:'var(--text1)', borderBottom:'1px solid rgba(255,255,255,.04)' }}
              onMouseEnter={e => e.currentTarget.style.background='var(--bg2)'}
              onMouseLeave={e => e.currentTarget.style.background='transparent'}>
              <span style={{ fontFamily:'DM Mono, monospace', fontSize:'.72rem', color:'var(--text3)', marginRight:'.5rem' }}>{p.articleNumber}</span>
              {p.name}
              <span style={{ float:'right', color:'var(--green)', fontFamily:'DM Mono, monospace', fontSize:'.75rem' }}>{p.price} €</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EditOrderModal({ order, onClose, onSaved }) {
  const [items, setItems] = useState(() => {
    const it = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
    return it || [];
  });
  const [note, setNote] = useState(order.delivery_note || '');
  const [addrId, setAddrId] = useState(order.delivery_address_id || '');
  const [addresses, setAddresses] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg,  setMsg]  = useState('');

  useEffect(() => {
    if (!order.customer_id) return;
    fetch('/api/finance/orders/customer/' + order.customer_id + '/delivery-addresses')
      .then(r => r.json())
      .then(d => {
        const list = Array.isArray(d) ? d : (Array.isArray(d?.deliveryAddresses) ? d.deliveryAddresses : []);
        setAddresses(list);
      })
      .catch(() => setAddresses([]));
  }, [order.customer_id]);

  const setItem = (i, k, v) => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [k]: v } : it));

  const totalNet = items.reduce((s, i) => s + (parseFloat(i.unitPriceNet)||0) * (parseInt(i.quantity)||0), 0);

  const save = async () => {
    setBusy(true); setMsg('');
    try {
      const r = await fetch('/api/finance/orders/' + order.id, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: items.map(it => ({ ...it, quantity: parseInt(it.quantity)||0, emptyReturn: parseInt(it.emptyReturn)||0 })), delivery_note: note, delivery_address_id: addrId || null })
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setMsg('✓ Gespeichert');
      setTimeout(onSaved, 600);
    } catch(e) { setMsg('✗ ' + e.message); }
    finally { setBusy(false); }
  };

  return (
    <Modal title={'Bestellung bearbeiten #' + order.id?.slice(-8).toUpperCase()} onClose={onClose} wide>
      {items.map((item, i) => (
        <div key={i} style={{ background:'var(--bg2)', borderRadius:8, padding:'.75rem', marginBottom:'.5rem' }}>
          <div style={{ marginBottom:'.4rem' }}>
            <div style={{ fontSize:'.65rem', color:'var(--text3)', marginBottom:'.15rem' }}>Artikel</div>
            <ProductSearch
              value={item.productName}
              onChange={v => setItem(i, 'productName', v)}
              onSelect={p => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, product_id: p.articleNumber, productName: p.name, articleNumber: p.articleNumber, unitPriceNet: p.price } : it))}/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr auto', gap:'.4rem', alignItems:'end' }}>
            <div>
              <div style={{ fontSize:'.65rem', color:'var(--text3)', marginBottom:'.15rem' }}>Menge</div>
              <input type="number" min="0" value={item.quantity} placeholder="0" onChange={e => setItem(i,'quantity',e.target.value)}
                style={{ background:'var(--bg0)', border:'1px solid var(--border)', borderRadius:6, padding:'.3rem .5rem', color:'var(--text1)', fontSize:'.8rem', outline:'none', width:'100%' }}/>
            </div>
            <div>
              <div style={{ fontSize:'.65rem', color:'var(--text3)', marginBottom:'.15rem' }}>Preis netto</div>
              <input type="number" step="0.01" value={item.unitPriceNet} onChange={e => setItem(i,'unitPriceNet',parseFloat(e.target.value)||0)}
                style={{ background:'var(--bg0)', border:'1px solid var(--border)', borderRadius:6, padding:'.3rem .5rem', color:'var(--text1)', fontSize:'.8rem', outline:'none', width:'100%' }}/>
            </div>
            <div>
              <div style={{ fontSize:'.65rem', color:'var(--text3)', marginBottom:'.15rem' }}>Leergut</div>
              <input type="number" min="0" value={item.emptyReturn} placeholder="0" onChange={e => setItem(i,'emptyReturn',e.target.value)}
                style={{ background:'var(--bg0)', border:'1px solid var(--border)', borderRadius:6, padding:'.3rem .5rem', color:'var(--text1)', fontSize:'.8rem', outline:'none', width:'100%' }}/>
            </div>
            {items.length > 1 && <button onClick={() => setItems(prev => prev.filter((_,idx) => idx !== i))}
              style={{ background:'transparent', border:'1px solid rgba(224,80,80,.3)', borderRadius:6, color:'var(--red2)', cursor:'pointer', padding:'.3rem .5rem', fontSize:'.8rem' }}>✕</button>}
          </div>
        </div>
      ))}
      <button onClick={() => setItems(p => [...p, { product_id:'', productName:'', articleNumber:'', quantity:'', unitPriceNet:0, emptyReturn:'' }])}
        style={{ padding:'.3rem .7rem', borderRadius:7, fontSize:'.78rem', cursor:'pointer', background:'var(--bg2)', border:'1px solid var(--border)', color:'var(--text2)', marginBottom:'1rem' }}>+ Artikel</button>
      <div style={{ marginBottom:'1rem' }}>
        <div style={{ fontSize:'.68rem', color:'var(--text3)', marginBottom:'.2rem' }}>Lieferhinweis</div>
        <input value={note} onChange={e => setNote(e.target.value)}
          style={{ background:'var(--bg0)', border:'1px solid var(--border)', borderRadius:6, padding:'.35rem .6rem', color:'var(--text1)', fontSize:'.82rem', outline:'none', width:'100%' }}/>
      </div>
      <div style={{ marginBottom:'1rem' }}>
        <div style={{ fontSize:'.68rem', color:'var(--text3)', marginBottom:'.2rem' }}>Lieferadresse</div>
        <select value={addrId} onChange={e => setAddrId(e.target.value)}
          style={{ background:'var(--bg0)', border:'1px solid var(--border)', borderRadius:6, padding:'.35rem .6rem', color:'var(--text1)', fontSize:'.82rem', outline:'none', width:'100%' }}>
          <option value="">Hauptadresse (Rechnungsadresse)</option>
          {addresses.map(a => (
            <option key={a.id} value={a.id}>
              {(a.name1 ? a.name1 + ' · ' : '') + (a.strasse || '') + ', ' + (a.plz || '') + ' ' + (a.ort || '')}
            </option>
          ))}
        </select>
        {order.ser_status && order.ser_status !== 'upload_error' && (
          <div style={{ fontSize:'.72rem', color:'var(--amber)', marginTop:'.35rem' }}>
            ⚠ Bestellung wurde bereits an SER uebermittelt. Eine Aenderung hier loest automatisch eine erneute Uebertragung aus.
          </div>
        )}
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontFamily:'DM Mono, monospace', fontSize:'.9rem', color:'var(--green)' }}>Gesamt netto: {totalNet.toFixed(2)} €</span>
        <div style={{ display:'flex', gap:'.5rem', alignItems:'center' }}>
          {msg && <span style={{ fontSize:'.8rem', color: msg.startsWith('✓') ? 'var(--green)' : 'var(--red2)' }}>{msg}</span>}
          <button disabled={busy} onClick={save} style={{ padding:'.4rem .9rem', borderRadius:7, fontSize:'.78rem', cursor:'pointer', background:'var(--r)', border:'none', color:'#fff' }}>{busy ? '…' : '✓ Speichern'}</button>
        </div>
      </div>
    </Modal>
  );
}

function MassSerModal({ orders, onClose, onDone }) {
  const [result,  setResult]  = useState(null);
  const [running, setRunning] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/finance/orders/mass-ser', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: orders.map(o => o.id) })
        });
        const d = await r.json();
        if (d.error) setError(d.error + (d.details ? ' – ' + d.details.slice(0,200) : ''));
        else setResult(d);
      } catch(e) { setError(e.message); }
      finally { setRunning(false); }
    })();
  }, []);

  return (
    <Modal title={`Bulk-SER Upload (${orders.length} Bestellungen)`} onClose={onClose}>
      {running ? (
        <div style={{ color:'var(--text2)', textAlign:'center', padding:'2rem', fontSize:'.85rem' }}>⏳ Generiere Bulk-XML und übertrage an SER…</div>
      ) : error ? (
        <>
          <div style={{ background:'rgba(224,80,80,.08)', border:'1px solid rgba(224,80,80,.3)', borderRadius:8, padding:'.75rem', color:'var(--red2)', fontSize:'.82rem', marginBottom:'1rem' }}>✗ {error}</div>
          <button onClick={onClose} style={{ padding:'.4rem .9rem', borderRadius:7, fontSize:'.78rem', cursor:'pointer', background:'var(--bg2)', border:'1px solid var(--border)', color:'var(--text2)' }}>Schließen</button>
        </>
      ) : result ? (
        <>
          <div style={{ background:'rgba(46,189,122,.08)', border:'1px solid rgba(46,189,122,.3)', borderRadius:8, padding:'1rem', marginBottom:'1rem' }}>
            <div style={{ color:'var(--green)', fontWeight:600, marginBottom:'.5rem' }}>✓ Bulk-XML erfolgreich übertragen</div>
            <div style={{ fontSize:'.82rem', color:'var(--text2)', display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.3rem' }}>
              <span>Datei:</span><span style={{ fontFamily:'DM Mono, monospace', color:'var(--text1)' }}>{result.filename}</span>
              <span>Übertragen:</span><span style={{ color:'var(--green)' }}>{result.uploaded} Bestellung(en)</span>
              {result.skipped > 0 && <><span>Übersprungen:</span><span style={{ color:'var(--amber)' }}>{result.skipped} (bereits OK oder kein SER)</span></>}
            </div>
          </div>
          <p style={{ fontSize:'.78rem', color:'var(--text3)', marginBottom:'1rem' }}>Rückmeldung von SER folgt innerhalb von ~15 Minuten.</p>
          <button onClick={() => { onDone(); onClose(); }} style={{ padding:'.4rem .9rem', borderRadius:7, fontSize:'.78rem', cursor:'pointer', background:'var(--bg2)', border:'1px solid var(--border)', color:'var(--text2)' }}>Schließen</button>
        </>
      ) : null}
    </Modal>
  );
}

function OrderDetail({ order: initOrder, onClose, onRefresh, onReorder }) {
  const [order,   setOrder]   = useState(initOrder);
  const [busy,    setBusy]    = useState('');
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(false);

  const action = async (url, method = 'POST', label = '') => {
    setBusy(label); setMessage('');
    try {
      const r = await fetch(url, { method, headers:{ 'Content-Type':'application/json' } });
      const d = await r.json();
      if (d.requiresConfirmation) {
        setBusy('');
        if (window.confirm(d.error + '\n\nTrotzdem erneut senden?')) {
          const sep = url.includes('?') ? '&' : '?';
          return action(url + sep + 'force=true', method, label);
        }
        return;
      }
      setMessage(d.error ? `✗ ${d.error}` : '✓ Erfolgreich');
      if (!d.error) { onRefresh(); if (label === 'done') setOrder(p => ({ ...p, done: !p.done })); }
    } catch(e) { setMessage(`✗ ${e.message}`); }
    finally { setBusy(''); }
  };

  const totalNet = (order.items || []).reduce((s, i) => s + (i.quantity * i.unitPriceNet), 0);

  if (editing) return <EditOrderModal order={order} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onRefresh(); onClose(); }}/>;

  return (
    <Modal title={`Bestellung #${order.id?.slice(-8).toUpperCase()}`} onClose={onClose}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.5rem .75rem', marginBottom:'1rem' }}>
        {[
          ['Kunde', order.customer_name || '—'],
          ['Kundennummer', order.lexware_customer_number || order.customer_number || '—'],
          ['Status', <OrderStatusBadge order={order}/>],
          ['Bestellt über', channelLabel(order)],
          ['Datum', order.created_at ? new Date(order.created_at).toLocaleDateString('de-DE') : '—'],
          ['Gesamt netto', `${totalNet.toFixed(2)} €`],
          ['Lieferadresse', order.delivery_address_id
            ? `${order.delivery_name1 ? order.delivery_name1 + ' · ' : ''}${order.delivery_strasse || ''}, ${order.delivery_plz || ''} ${order.delivery_ort || ''}`
            : 'Hauptadresse (Rechnungsadresse)'],
        ].map(([k, v]) => (
          <div key={k}>
            <div style={{ fontSize:'.68rem', color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:'.15rem' }}>{k}</div>
            <div style={{ fontSize:'.85rem', color:'var(--text1)' }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ background:'var(--bg2)', borderRadius:8, padding:'.75rem', marginBottom:'1rem' }}>
        <div style={{ fontSize:'.7rem', color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:'.5rem' }}>Artikel</div>
        {(order.items || []).map((item, i) => (
          <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'.3rem 0', borderBottom: i < order.items.length-1 ? '1px solid var(--border)' : 'none' }}>
            <div>
              <div style={{ fontSize:'.82rem', color:'var(--text1)' }}>{item.productName}</div>
              <div style={{ fontSize:'.72rem', color:'var(--text3)', fontFamily:'DM Mono, monospace' }}>
                {item.articleNumber} · {item.quantity}x · {Number(item.unitPriceNet).toFixed(2)} €/Stk
                {item.emptyReturn > 0 && ` · ${item.emptyReturn} Leergut`}
              </div>
            </div>
            <div style={{ fontFamily:'DM Mono, monospace', fontSize:'.82rem', color:'var(--green)' }}>{(item.quantity * item.unitPriceNet).toFixed(2)} €</div>
          </div>
        ))}
      </div>
      {order.delivery_note && (
        <div style={{ background:'rgba(74,127,212,.08)', border:'1px solid rgba(74,127,212,.2)', borderRadius:7, padding:'.6rem .8rem', marginBottom:'1rem', fontSize:'.8rem', color:'var(--text2)' }}>
          📋 {order.delivery_note}
        </div>
      )}
      {message && (
        <div style={{ padding:'.5rem .75rem', borderRadius:7, marginBottom:'.75rem', fontSize:'.82rem',
          background: message.startsWith('✓') ? 'rgba(46,189,122,.08)' : 'rgba(224,80,80,.08)',
          border: `1px solid ${message.startsWith('✓') ? 'rgba(46,189,122,.3)' : 'rgba(224,80,80,.3)'}`,
          color: message.startsWith('✓') ? 'var(--green)' : 'var(--red2)' }}>{message}</div>
      )}
      <div style={{ display:'flex', gap:'.5rem', flexWrap:'wrap' }}>
        {order.status !== 'cancelled' && (<>
          <button onClick={() => setEditing(true)} style={{ padding:'.4rem .8rem', borderRadius:7, fontSize:'.78rem', cursor:'pointer', background:'var(--bg2)', border:'1px solid var(--border)', color:'var(--text2)' }}>✏ Bearbeiten</button>
          {order.done && <button onClick={() => { onReorder(order); onClose(); }} style={{ padding:'.4rem .8rem', borderRadius:7, fontSize:'.78rem', cursor:'pointer', background:'rgba(184,49,31,.1)', border:'1px solid rgba(184,49,31,.3)', color:'var(--r)' }}>↺ Erneut bestellen</button>}
          <button disabled={!!busy} onClick={() => action(`/api/finance/orders/${order.id}/generate-xml`, 'POST', 'xml')}
            style={{ padding:'.4rem .8rem', borderRadius:7, fontSize:'.78rem', cursor:'pointer', background: busy==='xml' ? 'var(--bg3)' : 'rgba(74,127,212,.15)', border:'1px solid rgba(74,127,212,.3)', color:'var(--blue)' }}>
            {busy==='xml' ? '…' : '⬆ SER XML'}</button>
          <button disabled={!!busy} onClick={() => action(`/api/finance/orders/${order.id}/push-lexware`, 'POST', 'lex')}
            style={{ padding:'.4rem .8rem', borderRadius:7, fontSize:'.78rem', cursor:'pointer', background: busy==='lex' ? 'var(--bg3)' : 'rgba(46,189,122,.1)', border:'1px solid rgba(46,189,122,.3)', color:'var(--green)' }}>
            {busy==='lex' ? '…' : '📄 Lexware'}</button>
          <button disabled={!!busy} onClick={() => action(`/api/finance/orders/${order.id}/done`, 'PATCH', 'done')}
            style={{ padding:'.4rem .8rem', borderRadius:7, fontSize:'.78rem', cursor:'pointer', background: order.done ? 'rgba(46,189,122,.15)' : 'var(--bg2)', border:'1px solid var(--border)', color: order.done ? 'var(--green)' : 'var(--text2)' }}>
            {order.done ? '✓ Erledigt' : 'Als erledigt'}</button>
          <button disabled={!!busy} onClick={() => { if (confirm('Bestellung wirklich stornieren?')) action(`/api/finance/orders/${order.id}`, 'DELETE', 'del'); }}
            style={{ padding:'.4rem .8rem', borderRadius:7, fontSize:'.78rem', cursor:'pointer', background:'rgba(224,80,80,.08)', border:'1px solid rgba(224,80,80,.3)', color:'var(--red2)' }}>
            {busy==='del' ? '…' : '✕ Storno'}</button>
        </>)}
      </div>
    </Modal>
  );
}

export { ProductSearch };

export default function Orders() {
  const [orders,   setOrders]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [detail,   setDetail]   = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [massSer,  setMassSer]  = useState(false);
  const [filters,  setFilters]  = useState({ derived_status:'', period:'month', q:'' });

  const load = useCallback(async (f) => {
    setLoading(true); setError(''); setSelected(new Set());
    try {
      const params = new URLSearchParams();
      if (f.derived_status) params.set('derived_status', f.derived_status);
      if (f.period)          params.set('period', f.period);
      if (f.q)               params.set('q', f.q);
      const r = await fetch('/api/finance/orders?' + params);
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setOrders(d.orders || []);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(filters); }, []);

  const applyFilter = (key, val) => { const f = { ...filters, [key]: val }; setFilters(f); load(f); };

  const toggleSelect = (id) => setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const toggleAll = () => setSelected(prev => prev.size === orders.filter(o => o.status !== 'cancelled').length ? new Set() : new Set(orders.filter(o => o.status !== 'cancelled').map(o => o.id)));

  const selectedOrders = orders.filter(o => selected.has(o.id));
  const activeOrders = orders.filter(o => o.status !== 'cancelled');

  const [pickCustomer, setPickCustomer] = useState(false);
  const [newOrderCustomer, setNewOrderCustomer] = useState(null);
  const [newOrderAddresses, setNewOrderAddresses] = useState([]);
  const selectCustomerForNewOrder = async (c) => {
    setPickCustomer(false);
    const r = await fetch('/api/finance/customers/' + c.id + '/delivery-addresses');
    const d = await r.json();
    setNewOrderAddresses(d.deliveryAddresses || []);
    setNewOrderCustomer(c);
  };

  const [newOrderInitialItems, setNewOrderInitialItems] = useState(undefined);
  const [newOrderInitialAddressId, setNewOrderInitialAddressId] = useState('');
  const [reorderNotice, setReorderNotice] = useState('');
  const resetNewOrderState = () => {
    setNewOrderCustomer(null); setNewOrderAddresses([]);
    setNewOrderInitialItems(undefined); setNewOrderInitialAddressId('');
    setReorderNotice('');
  };
  const startReorder = async (order) => {
    try {
      const [custRes, addrRes] = await Promise.all([
        fetch('/api/finance/customers/' + order.customer_id),
        fetch('/api/finance/customers/' + order.customer_id + '/delivery-addresses'),
      ]);
      const custData = await custRes.json();
      const addrData = await addrRes.json();
      const customer = custData.customer || custData;
      if (custData.error || !customer?.id) throw new Error(custData.error || 'Kunde nicht gefunden');
      const addresses = addrData.deliveryAddresses || [];
      const orderItems = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []);
      // Gezielt pro Artikel nachschlagen statt den ganzen Katalog zu laden -- die Katalog-Liste
      // ohne q scheint nicht vollstaendig zu sein (Lexware-Cache, vermutlich gedeckelt/paginiert).
      const lookups = await Promise.all(orderItems.map(it =>
        fetch('/api/finance/products?q=' + encodeURIComponent(it.articleNumber)).then(r => r.json())
      ));
      const validItems = orderItems.map((it, idx) => {
        const current = (lookups[idx].products || []).find(p => p.articleNumber === it.articleNumber);
        if (!current) return null;
        return { productName: current.name, articleNumber: current.articleNumber, product_id: current.articleNumber, quantity: it.quantity, unitPriceNet: current.price, emptyReturn: it.emptyReturn ?? 0 };
      }).filter(Boolean);
      const dropped = orderItems.length - validItems.length;
      const addrStillExists = addresses.some(a => a.id === order.delivery_address_id);
      setReorderNotice(dropped > 0 ? `${dropped} Artikel nicht mehr verf\u00fcgbar und entfernt.` : '');
      setNewOrderAddresses(addresses);
      setNewOrderInitialItems(validItems.length ? validItems : [{ productName:'', articleNumber:'', quantity:'', unitPriceNet:0, emptyReturn:'' }]);
      setNewOrderInitialAddressId(addrStillExists ? order.delivery_address_id : '');
      setNewOrderCustomer(customer);
    } catch (e) { setError('Erneut bestellen fehlgeschlagen: ' + e.message); }
  };

  const Sel = ({ k, opts, placeholder }) => (
    <select value={filters[k]} onChange={e => applyFilter(k, e.target.value)}
      style={{ background:'var(--bg0)', border:'1px solid var(--border)', borderRadius:7, padding:'.3rem .6rem', color: filters[k] ? 'var(--text1)' : 'var(--text3)', fontSize:'.8rem', outline:'none', cursor:'pointer' }}>
      <option value="">{placeholder}</option>
      {opts.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );

  const totalNet = orders.filter(o => o.status !== 'cancelled')
    .reduce((s, o) => s + (o.items||[]).reduce((ss,i) => ss + (i.quantity*i.unitPriceNet), 0), 0);

  return (
    <div>
      {detail && <OrderDetail order={detail} onClose={() => setDetail(null)} onRefresh={() => load(filters)} onReorder={startReorder}/>}
      {massSer && <MassSerModal orders={selectedOrders} onClose={() => setMassSer(false)} onDone={() => load(filters)}/>}
      {pickCustomer && <CustomerPicker onSelect={selectCustomerForNewOrder} onClose={() => setPickCustomer(false)}/>}
      {newOrderCustomer && <NewOrderModal customer={newOrderCustomer} deliveryAddresses={newOrderAddresses}
        initialItems={newOrderInitialItems} initialDeliveryAddressId={newOrderInitialAddressId} notice={reorderNotice}
        onClose={resetNewOrderState} onSaved={() => { resetNewOrderState(); load(filters); }}/>}

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'1.2rem', flexWrap:'wrap', gap:'.75rem' }}>
        <div>
          <h1 style={{ fontSize:'1.15rem', fontWeight:600, color:'var(--text1)' }}>Bestellungen</h1>
          <p style={{ color:'var(--text2)', fontSize:'.8rem', marginTop:'.2rem' }}>
            {orders.length} Bestellungen · Gesamt netto{' '}
            <span style={{ color:'var(--green)', fontFamily:'DM Mono, monospace' }}>{totalNet.toFixed(2)} €</span>
            {selected.size > 0 && <span style={{ marginLeft:'.75rem', color:'var(--amber)' }}> · {selected.size} ausgewählt</span>}
          </p>
        </div>
        <div style={{ display:'flex', gap:'.5rem', flexWrap:'wrap' }}>
          <button onClick={() => setPickCustomer(true)} style={{ padding:'.4rem .9rem', background:'var(--r)', border:'none', borderRadius:8, color:'#fff', fontSize:'.82rem', cursor:'pointer' }}>+ Neue Bestellung</button>
          {selected.size > 0 && (
            <button onClick={() => setMassSer(true)} style={{ padding:'.4rem .9rem', background:'rgba(74,127,212,.15)', border:'1px solid rgba(74,127,212,.3)', borderRadius:8, color:'var(--blue)', fontSize:'.82rem', cursor:'pointer' }}>
              ⬆ SER ({selected.size})
            </button>
          )}
          <Sel k="period" opts={[['today','Heute'],['week','Diese Woche'],['month','Dieser Monat'],['year','Dieses Jahr']]} placeholder="Zeitraum"/>
          <Sel k="derived_status" opts={[['bestellt','Bestellt'],['uebermittelt','SER übermittelt'],['akzeptiert','SER akzeptiert'],['abgelehnt','SER abgelehnt'],['storniert','Storniert']]} placeholder="Status"/>
          <input value={filters.q} onChange={e => applyFilter('q', e.target.value)}
            placeholder="Kunde / Nr. suchen…"
            style={{ background:'var(--bg0)', border:'1px solid var(--border)', borderRadius:7, padding:'.3rem .7rem', color:'var(--text1)', fontSize:'.8rem', outline:'none', width:160 }}/>
          <button onClick={() => load(filters)} style={{ padding:'.4rem .8rem', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text2)', fontSize:'.8rem', cursor:'pointer' }}>↻</button>
        </div>
      </div>

      {error && <div style={{ background:'rgba(224,80,80,.08)', border:'1px solid rgba(224,80,80,.3)', borderRadius:9, padding:'.75rem 1rem', color:'var(--red2)', fontSize:'.85rem', marginBottom:'1rem' }}>✗ {error}</div>}

      {loading ? <div style={{ color:'var(--text3)', textAlign:'center', padding:'3rem' }}>Lade Bestellungen…</div> : (
        <div style={{ background:'var(--bg1)', border:'1px solid var(--border)', borderRadius:9, overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'var(--bg2)', borderBottom:'1px solid var(--border)' }}>
                  <th style={{ padding:'.5rem .65rem', width:32 }}>
                    <input type="checkbox" checked={selected.size === activeOrders.length && activeOrders.length > 0}
                      onChange={toggleAll} style={{ cursor:'pointer' }}/>
                  </th>
                  {['#','Datum','Kunde','Bestellt über','Artikel','Netto','Status','Aktionen'].map(h => (
                    <th key={h} style={{ textAlign:'left', padding:'.5rem .65rem', fontSize:'.65rem', textTransform:'uppercase', letterSpacing:'.08em', color:'var(--text3)', fontFamily:'DM Mono, monospace', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map(o => {
                  const net = (o.items||[]).reduce((s,i) => s + (i.quantity*i.unitPriceNet), 0);
                  const isSelected = selected.has(o.id);
                  return (
                    <tr key={o.id} style={{ borderBottom:'1px solid rgba(255,255,255,.04)', opacity: o.status === 'cancelled' ? 0.5 : 1, background: isSelected ? 'rgba(74,127,212,.06)' : 'transparent' }}>
                      <td style={{ padding:'.5rem .65rem' }}>
                        {o.status !== 'cancelled' && <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(o.id)} style={{ cursor:'pointer' }}/>}
                      </td>
                      <td style={{ padding:'.5rem .65rem', fontFamily:'DM Mono, monospace', fontSize:'.72rem', color:'var(--text3)' }}>{o.id?.slice(-8).toUpperCase()}</td>
                      <td style={{ padding:'.5rem .65rem', fontSize:'.8rem', color:'var(--text2)', whiteSpace:'nowrap' }}>{o.created_at ? new Date(o.created_at).toLocaleDateString('de-DE') : '—'}</td>
                      <td style={{ padding:'.5rem .65rem', fontSize:'.85rem', color:'var(--text1)', fontWeight:500, maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{o.customer_name || '—'}</td>
                      <td style={{ padding:'.5rem .65rem', fontSize:'.78rem', color:'var(--text2)', whiteSpace:'nowrap' }}>{channelLabel(o)}</td>
                      <td style={{ padding:'.5rem .65rem', fontSize:'.78rem', color:'var(--text2)' }}>{(o.items||[]).length} Pos.</td>
                      <td style={{ padding:'.5rem .65rem', fontFamily:'DM Mono, monospace', fontSize:'.82rem', color:'var(--green)' }}>{net.toFixed(2)} €</td>
                      <td style={{ padding:'.5rem .65rem' }}><OrderStatusBadge order={o}/></td>
                      <td style={{ padding:'.5rem .65rem' }}>
                        <button onClick={() => setDetail(o)} style={{ padding:'.22rem .55rem', borderRadius:5, fontSize:'.75rem', background:'transparent', border:'1px solid var(--border)', color:'var(--text2)', cursor:'pointer' }}>Detail</button>
                      </td>
                    </tr>
                  );
                })}
                {orders.length === 0 && <tr><td colSpan={9} style={{ padding:'2rem', textAlign:'center', color:'var(--text3)', fontSize:'.82rem' }}>Keine Bestellungen gefunden.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
