import { useState, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import ProductSearch from './ProductSearch';

// 1. Woche = gerade KW, 2. Woche = ungerade KW (Festlegung 08.10.2026, gasshop #230)
const RHYTHMUS_LABELS = { woechentlich: 'Wöchentlich', woche_1: '1. Woche', woche_2: '2. Woche', alle_3: 'Alle 3 Wochen', alle_4: 'Alle 4 Wochen' };
const RHYTHMUS_HINTS = { woche_1: 'gerade KW', woche_2: 'ungerade KW', alle_3: 'ab Start-KW', alle_4: 'ab Start-KW' };
const RHYTHMUS_KEYS = ['woechentlich', 'woche_1', 'woche_2', 'alle_3', 'alle_4'];
const NEEDS_START = { alle_3: true, alle_4: true };

// Montag einer Woche als 'YYYY-MM-DD' <-> Wert für <input type="week"> ('YYYY-Www')
function isoWeekOf(dateStr) {
  const d = new Date(String(dateStr).slice(0, 10) + 'T00:00:00Z');
  const x = new Date(d); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7) + 3);
  const y = x.getUTCFullYear(), jan4 = new Date(Date.UTC(y, 0, 4));
  const w = 1 + Math.round(((x - jan4) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return { year: y, week: w };
}
function weekInputValue(dateStr) {
  if (!dateStr) return '';
  const { year, week } = isoWeekOf(dateStr);
  return year + '-W' + String(week).padStart(2, '0');
}
function mondayFromWeekInput(v) {
  const m = /^(\d{4})-W(\d{2})$/.exec(v || '');
  if (!m) return null;
  const jan4 = new Date(Date.UTC(+m[1], 0, 4));
  const mon1 = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86400000);
  return new Date(mon1.getTime() + (+m[2] - 1) * 7 * 86400000).toISOString().slice(0, 10);
}
function fmtNext(next) {
  if (!next) return '–';
  const d = new Date(next.monday + 'T00:00:00Z');
  return 'KW ' + next.week + ' (ab ' + d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }) + ')';
}
const EMPTY_ITEM = { productName:'', articleNumber:'', quantity:1, unitPriceNet:0, emptyReturn:0 };

function Modal({ title, children, onClose }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.85)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'var(--bg1)', border:'1px solid var(--border)', borderRadius:10, padding:'1.5rem', width:'90%', maxWidth:480, maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
          <span style={{ fontWeight:600, color:'var(--text1)', fontSize:'.95rem' }}>{title}</span>
          <button onClick={onClose} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:6, color:'var(--text2)', cursor:'pointer', padding:'.2rem .55rem', fontSize:'.8rem' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CustomerSearch({ onSelect, onClose }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  let timer;
  const search = (val) => {
    setQ(val);
    clearTimeout(timer);
    if (val.length < 2) { setResults([]); return; }
    timer = setTimeout(async () => {
      setBusy(true);
      const r = await fetch('/api/finance/customers?q=' + encodeURIComponent(val));
      const d = await r.json();
      setResults(d.customers || []);
      setBusy(false);
    }, 300);
  };
  return (
    <Modal title="Kunde hinzufügen" onClose={onClose}>
      <input autoFocus value={q} onChange={e => search(e.target.value)}
        placeholder="Name, Firma, Kundennummer…"
        style={{ background:'var(--bg0)', border:'1px solid var(--border)', borderRadius:6, padding:'.4rem .6rem', color:'var(--text1)', fontSize:'.85rem', outline:'none', width:'100%', marginBottom:'.75rem' }}/>
      {busy && <div style={{ fontSize:'.78rem', color:'var(--text3)' }}>Suche…</div>}
      {results.map(c => (
        <div key={c.id} onClick={() => onSelect(c)}
          style={{ padding:'.5rem .6rem', borderRadius:6, cursor:'pointer', marginBottom:'.3rem', background:'var(--bg2)', border:'1px solid var(--border)' }}>
          <div style={{ fontSize:'.85rem', color:'var(--text1)' }}>{c.company_name || c.name}</div>
          <div style={{ fontSize:'.72rem', color:'var(--text3)' }}>{c.customer_number} · {c.billing_zip} {c.billing_city}</div>
        </div>
      ))}
    </Modal>
  );
}

function AussetzenEditor({ entry, onSave, onCancel }) {
  const [von, setVon] = useState(entry.aussetzen_von ? entry.aussetzen_von.slice(0,10) : '');
  const [bis, setBis] = useState(entry.aussetzen_bis ? entry.aussetzen_bis.slice(0,10) : '');
  const [notiz, setNotiz] = useState(entry.notiz || '');
  return (
    <div style={{ background:'var(--bg0)', borderRadius:6, padding:'.5rem', marginTop:'.4rem' }}>
      <div style={{ display:'flex', gap:'.4rem', marginBottom:'.4rem' }}>
        <input type="date" value={von} onChange={e => setVon(e.target.value)} style={{ background:'var(--bg1)', border:'1px solid var(--border)', borderRadius:5, padding:'.25rem .4rem', color:'var(--text1)', fontSize:'.75rem', flex:1 }}/>
        <input type="date" value={bis} onChange={e => setBis(e.target.value)} style={{ background:'var(--bg1)', border:'1px solid var(--border)', borderRadius:5, padding:'.25rem .4rem', color:'var(--text1)', fontSize:'.75rem', flex:1 }}/>
      </div>
      <input value={notiz} onChange={e => setNotiz(e.target.value)} placeholder="Notiz (z. B. Urlaub)"
        style={{ background:'var(--bg1)', border:'1px solid var(--border)', borderRadius:5, padding:'.25rem .4rem', color:'var(--text1)', fontSize:'.75rem', width:'100%', marginBottom:'.4rem' }}/>
      <div style={{ display:'flex', gap:'.4rem', justifyContent:'flex-end' }}>
        <button onClick={onCancel} style={{ padding:'.25rem .6rem', borderRadius:5, fontSize:'.72rem', cursor:'pointer', background:'var(--bg2)', border:'1px solid var(--border)', color:'var(--text2)' }}>Abbrechen</button>
        <button onClick={() => onSave({ aussetzen_von: von || null, aussetzen_bis: bis || null, notiz: notiz || null })}
          style={{ padding:'.25rem .6rem', borderRadius:5, fontSize:'.72rem', cursor:'pointer', background:'var(--r)', border:'none', color:'#fff' }}>Speichern</button>
      </div>
    </div>
  );
}

function ItemsEditor({ items, onChange }) {
  const setItem = (i, k, v) => onChange(items.map((it, idx) => idx === i ? { ...it, [k]: v } : it));
  return (
    <div style={{ marginTop:'.4rem' }}>
      {items.map((item, i) => (
        <div key={i} style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr auto', gap:'.3rem', marginBottom:'.3rem', alignItems:'center' }}>
          <ProductSearch value={item.productName}
            onChange={v => setItem(i, 'productName', v)}
            onSelect={p => onChange(items.map((it,idx) => idx===i ? { ...it, product_id:p.articleNumber, productName:p.name, articleNumber:p.articleNumber, unitPriceNet:p.price } : it))}/>
          <input type="number" min="0" value={item.quantity} placeholder="Menge"
            onChange={e => setItem(i, 'quantity', parseInt(e.target.value)||0)}
            style={{ background:'var(--bg0)', border:'1px solid var(--border)', borderRadius:5, padding:'.25rem .4rem', color:'var(--text1)', fontSize:'.72rem' }}/>
          <input type="number" step="0.01" value={item.unitPriceNet} placeholder="Preis"
            onChange={e => setItem(i, 'unitPriceNet', parseFloat(e.target.value)||0)}
            style={{ background:'var(--bg0)', border:'1px solid var(--border)', borderRadius:5, padding:'.25rem .4rem', color:'var(--text1)', fontSize:'.72rem' }}/>
          <input type="number" min="0" value={item.emptyReturn} placeholder="Leergut"
            onChange={e => setItem(i, 'emptyReturn', parseInt(e.target.value)||0)}
            style={{ background:'var(--bg0)', border:'1px solid var(--border)', borderRadius:5, padding:'.25rem .4rem', color:'var(--text1)', fontSize:'.72rem' }}/>
          <button onClick={() => onChange(items.filter((_,idx) => idx!==i))}
            style={{ background:'transparent', border:'1px solid rgba(224,80,80,.3)', borderRadius:5, color:'var(--red2)', cursor:'pointer', padding:'.2rem .4rem', fontSize:'.7rem' }}>✕</button>
        </div>
      ))}
      <button onClick={() => onChange([...items, { ...EMPTY_ITEM }])}
        style={{ padding:'.2rem .5rem', borderRadius:5, fontSize:'.7rem', cursor:'pointer', background:'var(--bg0)', border:'1px solid var(--border)', color:'var(--text2)' }}>+ Artikel</button>
    </div>
  );
}

function CustomerCard({ entry, onUpdate, onRemove, onSend }) {
  const [editingAus, setEditingAus] = useState(false);
  const [editingItems, setEditingItems] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState('');
  const items = Array.isArray(entry.items) ? entry.items : (typeof entry.items === 'string' ? JSON.parse(entry.items || '[]') : []);
  const isAussetzend = entry.aussetzen_von && entry.aussetzen_bis;
  const totalNet = items.reduce((s,i) => s + (parseFloat(i.unitPriceNet)||0)*(parseInt(i.quantity)||0), 0);

  const handleSend = async () => {
    setSending(true); setSendMsg('');
    try {
      await onSend(entry.customer_id);
      setSendMsg('✓ Bestellung angelegt');
    } catch(e) { setSendMsg('✗ ' + e.message); }
    finally { setSending(false); }
  };

  return (
    <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:8, padding:'.6rem .7rem', marginBottom:'.5rem' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:'.5rem' }}>
        <div>
          <div style={{ fontSize:'.85rem', color:'var(--text1)', fontWeight:500 }}>{entry.company_name || entry.name}</div>
          <div style={{ fontSize:'.7rem', color:'var(--text3)' }}>{entry.customer_number} · {entry.billing_zip} {entry.billing_city}</div>
        </div>
        <button onClick={() => onRemove(entry.customer_id)} style={{ background:'transparent', border:'1px solid rgba(224,80,80,.3)', borderRadius:5, color:'var(--red2)', cursor:'pointer', padding:'.15rem .4rem', fontSize:'.7rem' }}>✕</button>
      </div>

      <div style={{ display:'flex', gap:'.4rem', marginTop:'.4rem', alignItems:'center', flexWrap:'wrap' }}>
        <select value={entry.rhythmus} onChange={e => onUpdate(entry.customer_id, { rhythmus: e.target.value })}
          style={{ background:'var(--bg0)', border:'1px solid var(--border)', borderRadius:5, padding:'.2rem .4rem', color:'var(--text1)', fontSize:'.72rem' }}>
          {RHYTHMUS_KEYS.map(k => <option key={k} value={k}>{RHYTHMUS_LABELS[k]}</option>)}
        </select>
        {NEEDS_START[entry.rhythmus] && (
          <label style={{ display:'flex', alignItems:'center', gap:'.3rem', fontSize:'.7rem', color:'var(--text3)' }}>
            ab
            <input type="week" value={weekInputValue(entry.start_kw)} onChange={e => { const m = mondayFromWeekInput(e.target.value); if (m) onUpdate(entry.customer_id, { start_kw: m }); }}
              style={{ background:'var(--bg0)', border:'1px solid var(--border)', borderRadius:5, padding:'.15rem .35rem', color:'var(--text1)', fontSize:'.72rem' }}/>
          </label>
        )}
        <button onClick={() => setEditingAus(e => !e)} style={{ background:'transparent', border:'1px solid var(--border)', borderRadius:5, color: isAussetzend ? 'var(--amber)' : 'var(--text3)', cursor:'pointer', padding:'.2rem .5rem', fontSize:'.7rem' }}>
          {isAussetzend ? '⏸ Aussetzend' : 'Aussetzen'}
        </button>
      </div>
      <div style={{ fontSize:'.72rem', color:'var(--text2)', marginTop:'.35rem' }}>
        Nächster Rhythmus: <strong style={{ color:'var(--text1)' }}>{fmtNext(entry.next)}</strong>
      </div>
      {entry.updated_source === 'shop' && (
        <div style={{ fontSize:'.68rem', color:'var(--amber)', marginTop:'.2rem' }}>
          vom Kunden geändert{entry.updated_at ? ' am ' + new Date(entry.updated_at).toLocaleString('de-DE', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : ''}
        </div>
      )}
      {isAussetzend && !editingAus && (
        <div style={{ fontSize:'.7rem', color:'var(--amber)', marginTop:'.3rem' }}>
          {entry.aussetzen_von?.slice(0,10)} – {entry.aussetzen_bis?.slice(0,10)}{entry.notiz ? ' · ' + entry.notiz : ''}
        </div>
      )}
      {editingAus && <AussetzenEditor entry={entry} onCancel={() => setEditingAus(false)}
        onSave={(data) => { onUpdate(entry.customer_id, data); setEditingAus(false); }}/>}

      <div style={{ borderTop:'1px solid var(--border)', marginTop:'.5rem', paddingTop:'.5rem' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <button onClick={() => setEditingItems(e => !e)} style={{ background:'transparent', border:'none', color:'var(--text2)', cursor:'pointer', fontSize:'.75rem', padding:0 }}>
            {editingItems ? '▲' : '▶'} Übliche Bestellung {items.length > 0 && `(${items.length})`}
          </button>
          {items.length > 0 && !editingItems && <span style={{ fontFamily:'DM Mono, monospace', fontSize:'.72rem', color:'var(--green)' }}>{totalNet.toFixed(2)} €</span>}
        </div>
        {!editingItems && items.length > 0 && (
          <div style={{ fontSize:'.72rem', color:'var(--text3)', marginTop:'.2rem' }}>
            {items.map((i,idx) => <div key={idx}>{i.quantity}× {i.productName}</div>)}
          </div>
        )}
        {editingItems && (
          <ItemsEditor items={items.length ? items : [{ ...EMPTY_ITEM }]}
            onChange={(newItems) => onUpdate(entry.customer_id, { items: newItems })}/>
        )}
        <div style={{ display:'flex', gap:'.5rem', alignItems:'center', marginTop:'.5rem' }}>
          <button disabled={sending || items.length === 0} onClick={handleSend}
            style={{ padding:'.25rem .6rem', borderRadius:5, fontSize:'.72rem', cursor:'pointer', background:'rgba(46,189,122,.1)', border:'1px solid rgba(46,189,122,.3)', color:'var(--green)', opacity: items.length === 0 ? .5 : 1 }}>
            {sending ? '…' : '▶ Senden'}
          </button>
          {sendMsg && <span style={{ fontSize:'.7rem', color: sendMsg.startsWith('✓') ? 'var(--green)' : 'var(--red2)' }}>{sendMsg}</span>}
        </div>
      </div>
    </div>
  );
}

export default function DeliveryRhythm() {
  const { user } = useAuth();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addingTo, setAddingTo] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/finance/delivery-rhythm');
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setEntries(d.entries || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const patchEntry = async (customerId, changes) => {
    const current = entries.find(e => e.customer_id === customerId) || {};
    const body = { rhythmus: current.rhythmus, start_kw: current.start_kw, aussetzen_von: current.aussetzen_von, aussetzen_bis: current.aussetzen_bis, notiz: current.notiz, ...changes };
    setEntries(prev => prev.map(e => e.customer_id === customerId ? { ...e, ...body } : e));
    const r = await fetch('/api/finance/delivery-rhythm/' + customerId, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    // Antwort enthält Start-KW und nächste Liefer-KW vom Server
    const d = await r.json().catch(() => ({}));
    if (d.entry) setEntries(prev => prev.map(e => e.customer_id === customerId ? { ...e, ...d.entry } : e));
  };

  const removeEntry = async (customerId) => {
    if (!confirm('Kunde aus der Rhythmus-Planung entfernen?')) return;
    setEntries(prev => prev.filter(e => e.customer_id !== customerId));
    await fetch('/api/finance/delivery-rhythm/' + customerId, { method:'DELETE' });
  };

  const addCustomer = async (customer, rhythmus) => {
    setAddingTo(null);
    const body = { rhythmus, aussetzen_von: null, aussetzen_bis: null, notiz: null, items: [] };
    const r = await fetch('/api/finance/delivery-rhythm/' + customer.id, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    const d = await r.json();
    if (!d.error) load();
  };

  const sendOrder = async (customerId) => {
    const createdBy = user?.username || user?.fullName || 'Mitarbeiter';
    const r = await fetch('/api/finance/delivery-rhythm/' + customerId + '/send', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ created_by: createdBy })
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error);
  };

  if (loading) return <div style={{ color:'var(--text2)', fontSize:'.85rem' }}>Lädt…</div>;

  return (
    <div>
      <h1 style={{ fontSize:'1.15rem', fontWeight:600, color:'var(--text1)', marginBottom:'.2rem' }}>Lieferrhythmus</h1>
      <p style={{ color:'var(--text2)', fontSize:'.8rem', marginBottom:'1.2rem' }}>Stammkunden nach Liefer-Rhythmus gruppiert · {entries.length} zugeordnet · 1. Woche = gerade KW, 2. Woche = ungerade KW · Kunden können ihren Rhythmus im Shop selbst ändern</p>
      {error && <div style={{ background:'rgba(224,80,80,.08)', border:'1px solid rgba(224,80,80,.3)', borderRadius:9, padding:'.75rem 1rem', color:'var(--red2)', fontSize:'.85rem', marginBottom:'1rem' }}>✗ {error}</div>}
      {addingTo && <CustomerSearch onClose={() => setAddingTo(null)} onSelect={(c) => addCustomer(c, addingTo)}/>}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))', gap:'1rem' }}>
        {RHYTHMUS_KEYS.map(key => (
          <div key={key} style={{ background:'var(--bg1)', border:'1px solid var(--border)', borderRadius:9, padding:'.9rem' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'.7rem' }}>
              <span style={{ fontWeight:600, color:'var(--text1)', fontSize:'.9rem' }}>{RHYTHMUS_LABELS[key]}{RHYTHMUS_HINTS[key] && <span style={{ fontWeight:400, color:'var(--text3)', fontSize:'.72rem', marginLeft:'.35rem' }}>{RHYTHMUS_HINTS[key]}</span>}</span>
              <button onClick={() => setAddingTo(key)} style={{ padding:'.25rem .6rem', borderRadius:6, fontSize:'.72rem', cursor:'pointer', background:'rgba(184,49,31,.1)', border:'1px solid rgba(184,49,31,.3)', color:'var(--r)' }}>+ Kunde</button>
            </div>
            {entries.filter(e => e.rhythmus === key).map(e => (
              <CustomerCard key={e.customer_id} entry={e} onUpdate={patchEntry} onRemove={removeEntry} onSend={sendOrder}/>
            ))}
            {entries.filter(e => e.rhythmus === key).length === 0 && (
              <div style={{ fontSize:'.78rem', color:'var(--text3)' }}>Keine Kunden.</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
