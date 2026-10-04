import { useAuth } from '../../../context/AuthContext';
import React, { useState, useEffect, useCallback, useRef } from "react";
import ProductSearch from "./ProductSearch";

function LexBadge({ in_lexware }) {
  return in_lexware
    ? <span style={{ fontSize:".68rem", padding:".1rem .4rem", borderRadius:3, background:"rgba(46,189,122,.12)", border:"1px solid rgba(46,189,122,.3)", color:"var(--green)", fontFamily:"DM Mono, monospace" }}>LEX</span>
    : <span style={{ fontSize:".68rem", padding:".1rem .4rem", borderRadius:3, background:"rgba(224,80,80,.08)", border:"1px solid rgba(224,80,80,.2)", color:"var(--text3)", fontFamily:"DM Mono, monospace" }}>—</span>;
}
function SerBadge({ in_ser_fvk }) {
  return in_ser_fvk
    ? <span style={{ fontSize:".68rem", padding:".1rem .4rem", borderRadius:3, background:"rgba(74,127,212,.12)", border:"1px solid rgba(74,127,212,.3)", color:"var(--blue)", fontFamily:"DM Mono, monospace" }}>SER</span>
    : <span style={{ fontSize:".68rem", padding:".1rem .4rem", borderRadius:3, background:"rgba(255,255,255,.04)", border:"1px solid var(--border)", color:"var(--text3)", fontFamily:"DM Mono, monospace" }}>—</span>;
}

function Modal({ title, children, onClose, wide }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.85)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ background:"var(--bg1)", border:"1px solid var(--border)", borderRadius:10, padding:"1.5rem", width:"90%", maxWidth: wide ? 780 : 520, maxHeight:"90vh", overflowY:"auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"1rem" }}>
          <span style={{ fontWeight:600, color:"var(--text1)", fontSize:".95rem" }}>{title}</span>
          <button onClick={onClose} style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:6, color:"var(--text2)", cursor:"pointer", padding:".2rem .55rem", fontSize:".8rem" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize:".68rem", color:"var(--text3)", textTransform:"uppercase", letterSpacing:".06em", marginBottom:".2rem" }}>{label}</div>
      <div style={{ fontSize:".85rem", color:"var(--text1)" }}>{children || "—"}</div>
    </div>
  );
}

function DupModal({ portalCustomer, matches = [], onLink, onOverwrite, onForce, onCancel }) {
  const [idx, setIdx] = useState(0);
  const raw = matches[idx] || {};
  const lex = raw.lexwareContact || raw;
  const lexName  = lex.company?.name || [lex.person?.lastName, lex.person?.firstName].filter(Boolean).join(', ') || lex.name || '—';
  const lexBill  = lex.addresses?.billing?.[0] || lex.address || lex.billingAddress || {};
  const lexEmail = lex.emailAddresses?.business?.[0] || lex.email || '—';
  const lexPhone = lex.phoneNumbers?.business?.[0] || lex.phone || '—';
  const lexId    = lex.id;
  const portalName = portalCustomer?.company_name || portalCustomer?.name || [portalCustomer?.last_name, portalCustomer?.first_name].filter(Boolean).join(', ') || '—';
  const differs = (a, b) => !!a && a !== '—' && !!b && b !== '—' && a.toLowerCase().trim() !== b.toLowerCase().trim();
  const rows = [
    { label:'Name / Firma', p: portalName,                    l: lexName },
    { label:'Straße',       p: portalCustomer?.billing_street, l: lexBill.street },
    { label:'PLZ',          p: portalCustomer?.billing_zip,    l: lexBill.zip },
    { label:'Ort',          p: portalCustomer?.billing_city,   l: lexBill.city },
    { label:'E-Mail',       p: portalCustomer?.email,          l: lexEmail },
    { label:'Telefon',      p: portalCustomer?.phone,          l: lexPhone },
  ].map(r => ({ ...r, p: r.p || '—', l: r.l || '—' }));
  const btnBase = { flex:1, padding:'.6rem .5rem', borderRadius:7, cursor:'pointer', fontSize:'.78rem', fontWeight:500, display:'flex', flexDirection:'column', alignItems:'center', gap:'.18rem', lineHeight:1.3, minWidth:0 };
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.88)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}>
      <div style={{ background:'var(--bg1)', border:'1px solid rgba(232,160,32,.35)', borderRadius:11, width:'100%', maxWidth:760, maxHeight:'92vh', overflowY:'auto', boxShadow:'0 12px 48px rgba(0,0,0,.6)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'1rem 1.25rem', borderBottom:'1px solid var(--border)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'.6rem' }}>
            <span>⚠</span>
            <div>
              <div style={{ fontWeight:600, color:'var(--text1)', fontSize:'.92rem' }}>Mögliches Duplikat</div>
              <div style={{ fontSize:'.72rem', color:'var(--text3)' }}>{matches.length} Treffer in Lexware</div>
            </div>
          </div>
          <button onClick={onCancel} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:6, color:'var(--text2)', cursor:'pointer', padding:'.2rem .55rem', fontSize:'.8rem' }}>✕</button>
        </div>
        {matches.length > 1 && (
          <div style={{ display:'flex', alignItems:'center', gap:'.5rem', padding:'.5rem 1.25rem', borderBottom:'1px solid var(--border)', background:'var(--bg2)' }}>
            <span style={{ fontSize:'.72rem', color:'var(--text3)' }}>Treffer:</span>
            {matches.map((m, i) => (
              <button key={i} onClick={() => setIdx(i)} style={{ padding:'.18rem .5rem', borderRadius:5, fontSize:'.72rem', cursor:'pointer', background: i===idx ? 'var(--r)' : 'var(--bg3)', border:'1px solid var(--border)', color: i===idx ? '#fff' : 'var(--text2)' }}>
                {i+1}{m.score ? <span style={{ opacity:.7 }}> ({m.score}P)</span> : ''}
              </button>
            ))}
            {lexId && <span style={{ fontSize:'.68rem', color:'var(--text3)', fontFamily:'DM Mono, monospace', marginLeft:'.25rem' }}>ID: {lexId}</span>}
          </div>
        )}
        <div style={{ display:'flex', background:'var(--bg2)', borderBottom:'1px solid var(--border)' }}>
          <div style={{ width:90, flexShrink:0, padding:'.35rem .75rem' }}/>
          <div style={{ flex:1, padding:'.35rem .75rem', fontSize:'.65rem', textTransform:'uppercase', letterSpacing:'.08em', color:'var(--text3)', background:'rgba(184,49,31,.05)' }}>
            Portal / Shop{portalCustomer?.customer_number && <span style={{ marginLeft:'.5rem' }}>#{portalCustomer.customer_number}</span>}
          </div>
          <div style={{ flex:1, padding:'.35rem .75rem', fontSize:'.65rem', textTransform:'uppercase', letterSpacing:'.08em', color:'var(--text3)', borderLeft:'1px solid var(--border)' }}>
            Lexware{matches.length === 1 && lexId && <span style={{ marginLeft:'.5rem' }}>ID: {lexId}</span>}
          </div>
        </div>
        {rows.map(({ label, p, l }, i) => {
          const d = differs(p, l);
          return (
            <div key={label} style={{ display:'flex', alignItems:'stretch', borderBottom:'1px solid rgba(255,255,255,.04)', background: i%2===0 ? 'transparent' : 'rgba(255,255,255,.012)' }}>
              <div style={{ width:90, flexShrink:0, padding:'.45rem .75rem', fontSize:'.72rem', color:'var(--text3)' }}>{label}</div>
              <div style={{ flex:1, padding:'.45rem .75rem', fontSize:'.83rem', color:'var(--text1)', background:'rgba(184,49,31,.03)' }}>{p}</div>
              <div style={{ flex:1, padding:'.45rem .75rem', fontSize:'.83rem', borderLeft:'1px solid var(--border)', color: d ? 'var(--amber)' : 'var(--text1)', fontWeight: d ? 500 : 400, background: d ? 'rgba(232,160,32,.06)' : 'transparent' }}>
                {l}{d && <span style={{ fontSize:'.65rem', marginLeft:'.4rem', opacity:.6 }}>≠</span>}
              </div>
            </div>
          );
        })}
        <div style={{ display:'flex', gap:'.5rem', padding:'1rem 1.25rem', borderTop:'1px solid var(--border)', flexWrap:'wrap' }}>
          <button style={{ ...btnBase, border:'1px solid rgba(74,127,212,.35)', background:'rgba(74,127,212,.1)', color:'var(--blue)' }} onClick={() => onLink(lexId)}>
            <span>🔗 Verknüpfen</span><span style={{ fontSize:'.66rem', opacity:.7 }}>Nur ID-Mapping, keine Datenänderung</span>
          </button>
          <button style={{ ...btnBase, border:'1px solid rgba(232,160,32,.35)', background:'rgba(232,160,32,.08)', color:'var(--amber)' }} onClick={() => onOverwrite(lexId)}>
            <span>↺ Überschreiben</span><span style={{ fontSize:'.66rem', opacity:.7 }}>Portal-Daten → Lexware</span>
          </button>
          <button style={{ ...btnBase, border:'1px solid var(--border)', background:'rgba(255,255,255,.04)', color:'var(--text2)' }} onClick={onForce}>
            <span>+ Neu anlegen</span><span style={{ fontSize:'.66rem', opacity:.7 }}>Duplikat ignorieren</span>
          </button>
          <button style={{ ...btnBase, flex:'none', minWidth:100, border:'1px solid var(--border)', background:'transparent', color:'var(--text3)' }} onClick={onCancel}>
            <span>Abbrechen</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function CustomerDetail({ customer: init, onClose, onRefresh }) {
  const [customer, setCustomer] = useState(init);
  const [editing,  setEditing]  = useState(false);
  const [form,     setForm]     = useState({});
  const [busy,     setBusy]     = useState('');
  const [msg,      setMsg]      = useState('');
  const [orders,   setOrders]   = useState([]);
  const [newOrder, setNewOrder] = useState(false);
  const [dupData,  setDupData]  = useState(null);
  const [qrData,   setQrData]   = useState(null);
  const [qrBusy,   setQrBusy]   = useState(false);
  const [deliveryAddresses, setDeliveryAddresses] = useState([]);
  const [daLoading, setDaLoading] = useState(false);

  useEffect(() => {
    fetch('/api/finance/orders?q=' + encodeURIComponent(customer.customer_number || customer.name || ''))
      .then(r => r.json()).then(d => setOrders(d.orders || [])).catch(() => {});
  }, [customer.customer_number]);

  useEffect(() => {
    if (!customer.id) return;
    setDaLoading(true);
    fetch('/api/finance/customers/' + customer.id + '/delivery-addresses')
      .then(r => r.json())
      .then(d => setDeliveryAddresses(d.deliveryAddresses || []))
      .catch(() => {})
      .finally(() => setDaLoading(false));
  }, [customer.id]);

  const startEdit = () => { setForm({ ...customer }); setEditing(true); setMsg(''); };
  const saveEdit = async () => {
    setBusy('save'); setMsg('');
    try {
      const r = await fetch('/api/finance/customers/' + customer.id, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(form) });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setCustomer(d); setEditing(false); setMsg('✓ Gespeichert'); onRefresh();
    } catch(e) { setMsg('✗ ' + e.message); }
    finally { setBusy(''); }
  };
  const pushSer = async () => {
    if (!customer.customer_number) {
      setMsg('✗ Keine SER-Kundennummer vorhanden. Bitte zuerst in Lexware pushen oder manuell eintragen.');
      return;
    }
    setBusy('ser'); setMsg('');
    try {
      const r = await fetch('/api/finance/customers/' + customer.id + '/push-ser', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({}) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Fehler');
      setCustomer(c => ({ ...c, in_ser_fvk: true }));
      setMsg('✓ SER: ' + (d.filename || 'OK'));
      onRefresh();
    } catch(e) { setMsg('✗ ' + e.message); }
    finally { setBusy(''); }
  };
  const pushLexware = async (force = false) => {
    setBusy('lex'); setMsg('');
    try {
      const url = '/api/finance/customers/' + customer.id + '/push-to-lexware' + (force ? '?force=true' : '');
      const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'} });
      const d = await r.json();
      if (r.status === 409 || d.requiresConfirmation) { setDupData({ matches: d.duplicates || [] }); return; }
      if (d.error) throw new Error(d.error);
      setMsg('✓ Lexware: ' + (d.action || 'OK'));
      setCustomer(c => ({ ...c, in_lexware: true, lexware_id: d.lexware_id }));
      onRefresh();
    } catch(e) { setMsg('✗ ' + e.message); }
    finally { setBusy(''); }
  };
  const handleDupLink = async (lexId) => {
    setDupData(null); setBusy('lex'); setMsg('');
    try {
      const r = await fetch(`/api/finance/customers/${customer.id}/link-to-lexware?linkOnly=true`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ lexwareId: lexId }) });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setMsg('✓ Verknüpft (ID-Mapping)');
      setCustomer(c => ({ ...c, in_lexware: true, lexware_id: lexId }));
      onRefresh();
    } catch(e) { setMsg('✗ ' + e.message); }
    finally { setBusy(''); }
  };
  const handleDupOverwrite = async (lexId) => {
    setDupData(null); setBusy('lex'); setMsg('');
    try {
      const r = await fetch(`/api/finance/customers/${customer.id}/link-to-lexware`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ lexwareId: lexId }) });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setMsg('✓ Überschrieben & verknüpft');
      setCustomer(c => ({ ...c, in_lexware: true, lexware_id: lexId }));
      onRefresh();
    } catch(e) { setMsg('✗ ' + e.message); }
    finally { setBusy(''); }
  };
  const loadQr = async () => {
    setQrBusy(true);
    try {
      const r = await fetch('/api/finance/customers/' + customer.id + '/qr-code');
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setQrData(d);
    } catch(e) { setMsg('QR-Fehler: ' + e.message); }
    finally { setQrBusy(false); }
  };
  const handleDupForce = () => { setDupData(null); pushLexware(true); };
  const saveDeliveryAddress = async (da) => {
    setBusy('da-' + da.id);
    try {
      const method = da._new ? 'POST' : 'PUT';
      const url = da._new
        ? `/api/finance/customers/${customer.id}/delivery-addresses`
        : `/api/finance/customers/${customer.id}/delivery-addresses/${da.id}`;
      const r = await fetch(url, { method, headers:{'Content-Type':'application/json'}, body: JSON.stringify(da) });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setDeliveryAddresses(prev => prev.map(a => (a._new || a.id === da.id) ? d.deliveryAddress : a));
      setMsg('✓ Lieferadresse gespeichert');
    } catch(e) { setMsg('✗ ' + e.message); }
    finally { setBusy(''); }
  };

  const deleteDeliveryAddress = async (daId) => {
    if (!window.confirm('Lieferadresse wirklich löschen?')) return;
    try {
      const r = await fetch(`/api/finance/customers/${customer.id}/delivery-addresses/${daId}`, { method:'DELETE' });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setDeliveryAddresses(prev => prev.filter(a => a.id !== daId));
      setMsg('✓ Lieferadresse gelöscht');
    } catch(e) { setMsg('✗ ' + e.message); }
  };

  const addDeliveryAddress = () => {
    setDeliveryAddresses(prev => [...prev, { id:'new-'+Date.now(), _new:true, name1:'', name2:'', strasse:'', plz:'', ort:'', land:'DE', tel:'' }]);
  };

  const inp = (k) => ({
    value: form[k] || '',
    onChange: e => setForm(p => ({ ...p, [k]: e.target.value })),
    style:{ background:'var(--bg0)', border:'1px solid var(--border)', borderRadius:6, padding:'.3rem .6rem', color:'var(--text1)', fontSize:'.82rem', outline:'none', width:'100%' }
  });

  return (
    <Modal title={customer.company_name || customer.name || customer.customer_number} onClose={onClose} wide>
      {qrData && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.85)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'var(--bg1)', border:'1px solid var(--border)', borderRadius:10, padding:'1.5rem', maxWidth:340, width:'90%', textAlign:'center' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
              <span style={{ fontWeight:600, color:'var(--text1)', fontSize:'.9rem' }}>QR-Code: {qrData.customer}</span>
              <button onClick={() => setQrData(null)} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:6, color:'var(--text2)', cursor:'pointer', padding:'.2rem .55rem', fontSize:'.8rem' }}>✕</button>
            </div>
            <img src={qrData.qr} alt="QR-Code" style={{ width:240, height:240, borderRadius:8, background:'#fff', padding:8 }}/>
            <div style={{ fontSize:'.7rem', color:'var(--text3)', marginTop:'.75rem', wordBreak:'break-all', fontFamily:'DM Mono, monospace' }}>{qrData.url}</div>
            <div style={{ display:'flex', gap:'.5rem', marginTop:'1rem', justifyContent:'center' }}>
              <a href={qrData.qr} download={'QR-' + (qrData.customer || 'kunde') + '.png'} style={{ padding:'.4rem .8rem', borderRadius:7, fontSize:'.78rem', background:'var(--r)', border:'none', color:'#fff', textDecoration:'none', cursor:'pointer' }}>Download PNG</a>
              <button onClick={() => navigator.clipboard.writeText(qrData.url)} style={{ padding:'.4rem .8rem', borderRadius:7, fontSize:'.78rem', cursor:'pointer', background:'var(--bg2)', border:'1px solid var(--border)', color:'var(--text2)' }}>URL kopieren</button>
            </div>
          </div>
        </div>
      )}
      {dupData && <DupModal portalCustomer={customer} matches={dupData.matches} onLink={handleDupLink} onOverwrite={handleDupOverwrite} onForce={handleDupForce} onCancel={() => setDupData(null)}/>}
      {!editing ? (<>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.6rem .75rem', marginBottom:'1rem' }}>
          <Field label="KD-Nr">{customer.customer_number}</Field>
          <Field label="Name">{customer.name}</Field>
          <Field label="Firma">{customer.company_name}</Field>
          <Field label="Name2">{customer.name2}</Field>
          <Field label="Empfänger">{customer.name2}</Field>
          <Field label="Quelle">{customer.source}</Field>
          <Field label="Straße">{customer.billing_street}</Field>
          <Field label="PLZ / Ort">{customer.billing_zip} {customer.billing_city}</Field>
          <Field label="E-Mail">{customer.email}</Field>
          <Field label="Telefon">{customer.phone}</Field>
          <Field label="Letzte Bestellung">{customer.datum_letzte_lieferung ? new Date(customer.datum_letzte_lieferung).toLocaleDateString('de-DE') : '—'}</Field>
          <div style={{ display:'flex', gap:'.4rem', alignItems:'center' }}>
            <LexBadge in_lexware={customer.in_lexware}/> <SerBadge in_ser_fvk={customer.in_ser_fvk}/>
            {customer.in_lexware && <span style={{ fontSize:'.72rem', color:'var(--text3)' }}>ID: {customer.lexware_id}</span>}
          </div>
        </div>
        {customer.info_sped && <div style={{ background:'rgba(74,127,212,.08)', border:'1px solid rgba(74,127,212,.2)', borderRadius:7, padding:'.5rem .75rem', marginBottom:'1rem', fontSize:'.8rem', color:'var(--text2)' }}>📋 {customer.info_sped}</div>}
        {(daLoading || deliveryAddresses.length > 0) && (
          <div style={{ marginBottom:'1rem' }}>
            <div style={{ fontSize:'.78rem', fontWeight:600, color:'var(--text1)', marginBottom:'.4rem' }}>
              Abweichende Lieferadressen ({daLoading ? '…' : deliveryAddresses.length})
            </div>
            {daLoading ? (
              <div style={{ color:'var(--text3)', fontSize:'.78rem' }}>Lade…</div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:'.4rem' }}>
                {deliveryAddresses.map(da => (
                  <div key={da.id} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:7, padding:'.5rem .75rem', fontSize:'.8rem' }}>
                    <div style={{ fontWeight:600, color:'var(--text1)', marginBottom:'.15rem' }}>
                      {da.lieferadrnr && <span style={{ fontFamily:'DM Mono, monospace', fontSize:'.7rem', color:'var(--text3)', marginRight:'.4rem' }}>#{da.lieferadrnr}</span>}
                      {da.name1}
                      {da.name2 && <span style={{ color:'var(--text3)', marginLeft:'.3rem' }}>{da.name2}</span>}
                    </div>
                    {da.strasse && <div style={{ color:'var(--text2)' }}>{da.strasse}</div>}
                    {(da.plz || da.ort) && <div style={{ color:'var(--text2)' }}>{da.plz} {da.ort}</div>}
                    {da.tel && <div style={{ color:'var(--text3)', fontSize:'.75rem' }}>📞 {da.tel}</div>}
                    {da.info && <div style={{ color:'var(--blue)', fontSize:'.75rem', marginTop:'.2rem' }}>📋 {da.info}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {msg && <div style={{ padding:'.4rem .75rem', borderRadius:7, marginBottom:'.75rem', fontSize:'.82rem', background: msg.startsWith('✓') ? 'rgba(46,189,122,.08)' : 'rgba(224,80,80,.08)', border:`1px solid ${msg.startsWith('✓') ? 'rgba(46,189,122,.3)' : 'rgba(224,80,80,.3)'}`, color: msg.startsWith('✓') ? 'var(--green)' : 'var(--red2)' }}>{msg}</div>}
        <div style={{ display:'flex', gap:'.5rem', marginBottom:'1.5rem', flexWrap:'wrap' }}>
          <button onClick={startEdit} style={{ padding:'.4rem .8rem', borderRadius:7, fontSize:'.78rem', cursor:'pointer', background:'var(--bg2)', border:'1px solid var(--border)', color:'var(--text2)' }}>✏ Bearbeiten</button>
          {!customer.in_lexware && <button disabled={!!busy} onClick={() => pushLexware(false)} style={{ padding:'.4rem .8rem', borderRadius:7, fontSize:'.78rem', cursor:'pointer', background:'rgba(46,189,122,.1)', border:'1px solid rgba(46,189,122,.3)', color:'var(--green)' }}>{busy==='lex' ? '…' : '→ Lexware'}</button>}
          <button disabled={!!busy} onClick={pushSer} style={{ padding:'.4rem .8rem', borderRadius:7, fontSize:'.78rem', cursor:'pointer', background: customer.in_ser_fvk ? 'rgba(74,127,212,.06)' : 'rgba(74,127,212,.1)', border:'1px solid rgba(74,127,212,.3)', color:'var(--blue)' }}>
            {busy==='ser' ? '…' : customer.in_ser_fvk ? '↻ SER update' : '→ SER'}
          </button>
          {customer.in_lexware  && <button disabled={!!busy} onClick={() => pushLexware(true)}  style={{ padding:'.4rem .8rem', borderRadius:7, fontSize:'.78rem', cursor:'pointer', background:'rgba(46,189,122,.08)', border:'1px solid rgba(46,189,122,.2)', color:'var(--green)' }}>{busy==='lex' ? '…' : '↺ Lexware aktualisieren'}</button>}
          <button onClick={() => setNewOrder(true)} style={{ padding:'.4rem .8rem', borderRadius:7, fontSize:'.78rem', cursor:'pointer', background:'rgba(184,49,31,.1)', border:'1px solid rgba(184,49,31,.3)', color:'var(--r)' }}>+ Bestellung</button>
          <button disabled={qrBusy} onClick={loadQr} style={{ padding:'.4rem .8rem', borderRadius:7, fontSize:'.78rem', cursor:'pointer', background:'rgba(74,127,212,.1)', border:'1px solid rgba(74,127,212,.3)', color:'var(--blue)' }}>{qrBusy ? '…' : 'QR-Code'}</button>
        </div>
        <div style={{ fontSize:'.78rem', fontWeight:600, color:'var(--text1)', marginBottom:'.5rem' }}>Bestellhistorie ({orders.length})</div>
        {orders.length === 0 ? <div style={{ color:'var(--text3)', fontSize:'.8rem' }}>Keine Bestellungen.</div> : (
          <div style={{ background:'var(--bg2)', borderRadius:8, overflow:'hidden' }}>
            {orders.slice(0,10).map(o => {
              const net = (o.items||[]).reduce((s,i) => s+(i.quantity*i.unitPriceNet),0);
              return (
                <div key={o.id} style={{ display:'flex', justifyContent:'space-between', padding:'.45rem .75rem', borderBottom:'1px solid rgba(255,255,255,.04)', alignItems:'center' }}>
                  <div>
                    <span style={{ fontFamily:'DM Mono, monospace', fontSize:'.7rem', color:'var(--text3)' }}>#{o.id.slice(-8).toUpperCase()}</span>
                    <span style={{ fontSize:'.78rem', color:'var(--text2)', marginLeft:'.5rem' }}>{new Date(o.created_at).toLocaleDateString('de-DE')}</span>
                  </div>
                  <div style={{ fontFamily:'DM Mono, monospace', fontSize:'.8rem', color:'var(--green)' }}>{net.toFixed(2)} €</div>
                </div>
              );
            })}
          </div>
        )}
      </>) : (<>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.5rem .75rem', marginBottom:'1rem' }}>
          {[['name','Name'],['name2','Name2'],['name3','Name3'],['company_name','Firma'],['name_empfaenger','Empfänger'],['first_name','Vorname'],['last_name','Nachname'],['billing_street','Straße'],['billing_zip','PLZ'],['billing_city','Ort'],['email','E-Mail'],['phone','Telefon'],['mobile','Mobil'],['info_sped','Speditionsinfo']].map(([k,l]) => (
            <div key={k} style={{ gridColumn: k==='info_sped' ? '1/-1' : undefined }}>
              <div style={{ fontSize:'.68rem', color:'var(--text3)', marginBottom:'.2rem' }}>{l}</div>
              <input {...inp(k)}/>
            </div>
          ))}
        </div>
        {msg && <div style={{ padding:'.4rem .75rem', borderRadius:7, marginBottom:'.75rem', fontSize:'.82rem', background:'rgba(224,80,80,.08)', border:'1px solid rgba(224,80,80,.3)', color:'var(--red2)' }}>{msg}</div>}
        <div style={{ borderTop:'1px solid var(--border)', marginTop:'1rem', paddingTop:'1rem' }}>
          <div style={{ fontSize:'.78rem', fontWeight:600, color:'var(--text1)', marginBottom:'.6rem' }}>Abweichende Lieferadressen</div>
          {deliveryAddresses.map((da, idx) => (
            <div key={da.id} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:7, padding:'.6rem .75rem', marginBottom:'.5rem' }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.4rem .6rem', marginBottom:'.4rem' }}>
                {[['name1','Name*'],['name2','Name2'],['strasse','Straße'],['plz','PLZ'],['ort','Ort'],['tel','Telefon']].map(([k,l]) => (
                  <div key={k}>
                    <div style={{ fontSize:'.68rem', color:'var(--text3)', marginBottom:'.15rem' }}>{l}</div>
                    <input value={da[k] || ''} onChange={e => setDeliveryAddresses(prev => prev.map((a,i) => i===idx ? {...a,[k]:e.target.value} : a))}
                      style={{ background:'var(--bg0)', border:'1px solid var(--border)', borderRadius:6, padding:'.3rem .6rem', color:'var(--text1)', fontSize:'.82rem', outline:'none', width:'100%' }}/>
                  </div>
                ))}
              </div>
              <div style={{ display:'flex', gap:'.4rem', justifyContent:'flex-end' }}>
                <button onClick={() => saveDeliveryAddress(da)} disabled={!!busy}
                  style={{ padding:'.25rem .6rem', borderRadius:6, fontSize:'.72rem', cursor:'pointer', background:'rgba(46,189,122,.1)', border:'1px solid rgba(46,189,122,.3)', color:'var(--green)' }}>
                  {busy==='da-'+da.id ? '…' : '✓ Speichern'}
                </button>
                {!da._new && <button onClick={() => deleteDeliveryAddress(da.id)}
                  style={{ padding:'.25rem .6rem', borderRadius:6, fontSize:'.72rem', cursor:'pointer', background:'rgba(224,80,80,.08)', border:'1px solid rgba(224,80,80,.3)', color:'var(--red2)' }}>
                  ✕ Löschen
                </button>}
              </div>
            </div>
          ))}
          <button onClick={addDeliveryAddress}
            style={{ padding:'.3rem .7rem', borderRadius:7, fontSize:'.75rem', cursor:'pointer', background:'var(--bg2)', border:'1px solid var(--border)', color:'var(--text2)', marginTop:'.25rem' }}>
            + Lieferadresse hinzufügen
          </button>
        </div>
        <div style={{ display:'flex', gap:'.5rem', marginTop:'1rem' }}>
          <button disabled={!!busy} onClick={saveEdit} style={{ padding:'.4rem .9rem', borderRadius:7, fontSize:'.78rem', cursor:'pointer', background:'var(--r)', border:'none', color:'#fff' }}>{busy==='save' ? '…' : '✓ Speichern'}</button>
          <button onClick={() => setEditing(false)} style={{ padding:'.4rem .8rem', borderRadius:7, fontSize:'.78rem', cursor:'pointer', background:'var(--bg2)', border:'1px solid var(--border)', color:'var(--text2)' }}>Abbrechen</button>
        </div>
      </>)}
      {newOrder && <NewOrderModal customer={customer} deliveryAddresses={deliveryAddresses} onClose={() => setNewOrder(false)} onSaved={() => { setNewOrder(false); onRefresh(); }}/>}
    </Modal>
  );
}

function NewOrderModal({ customer, deliveryAddresses = [], initialItems, initialDeliveryAddressId = '', notice = '', onClose, onSaved }) {
  const { user } = useAuth();
  const [items,  setItems]  = useState(() => (initialItems && initialItems.length > 0) ? initialItems : [{ productName:'', articleNumber:'', quantity:1, unitPriceNet:0, emptyReturn:0 }]);
  const [note,   setNote]   = useState('');
  const [deliveryAddressId, setDeliveryAddressId] = useState(initialDeliveryAddressId);
  const [busy,   setBusy]   = useState(false);
  const [msg,    setMsg]    = useState('');
  const [lastOrder, setLastOrder] = useState(null);
  const [reorderBusy, setReorderBusy] = useState(false);
  const [reorderNotice, setReorderNotice] = useState('');
  const isEmpty = items.length === 0 || (items.length === 1 && !items[0].articleNumber);
  useEffect(() => {
    if (initialItems && initialItems.length > 0) return; // schon vorbefuellt (F47-Reorder), keine Doppel-Anzeige
    fetch('/api/finance/orders?q=' + encodeURIComponent(customer.customer_number || ''))
      .then(r => r.json())
      .then(d => {
        const list = d.orders || [];
        const sorted = [...list].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
        setLastOrder(sorted[0] || null);
      })
      .catch(() => setLastOrder(null));
  }, [customer?.id]);
  const doReorder = async (order) => {
    setReorderBusy(true); setReorderNotice('');
    try {
      const orderItems = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []);
      const lookups = await Promise.all(orderItems.map(it =>
        fetch('/api/finance/products?q=' + encodeURIComponent(it.articleNumber)).then(r => r.json())
      ));
      const validItems = orderItems.map((it, idx) => {
        const current = (lookups[idx].products || []).find(p => p.articleNumber === it.articleNumber);
        if (!current) return null;
        return { productName: current.name, articleNumber: current.articleNumber, product_id: current.articleNumber, quantity: it.quantity, unitPriceNet: current.price, emptyReturn: it.emptyReturn ?? it.quantity };
      }).filter(Boolean);
      const dropped = orderItems.length - validItems.length;
      setItems(validItems);
      setReorderNotice(dropped > 0 ? `${dropped} Artikel nicht mehr verf\u00fcgbar und entfernt.` : '');
    } catch (e) { setReorderNotice('\u2717 Erneut bestellen fehlgeschlagen.'); }
    finally { setReorderBusy(false); }
  };
  const setItem  = (i,k,v) => setItems(prev => prev.map((it,idx) => idx===i ? {...it,[k]:v} : it));
  const totalNet = items.reduce((s,i) => s+(parseFloat(i.unitPriceNet)||0)*(parseInt(i.quantity)||0),0);
  const submit = async () => {
    setBusy(true); setMsg('');
    try {
      const createdBy = user?.username || user?.fullName || 'Mitarbeiter';
      const r = await fetch('/api/finance/orders', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ customer_id:customer.id, customer_number:customer.customer_number, customer_name:customer.company_name||customer.name, customer_email:customer.email||'', items, total_net:totalNet, total_gross:Math.round(totalNet*1.19*100)/100, delivery_note:note, delivery_address_id: deliveryAddressId || null, status:'new', channel:'portal', created_by: createdBy })
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setMsg('✓ Bestellung angelegt'); setTimeout(onSaved, 800);
    } catch(e) { setMsg('✗ ' + e.message); }
    finally { setBusy(false); }
  };
  return (
    <Modal title={'Neue Bestellung: ' + (customer.company_name||customer.name)} onClose={onClose} wide>
      {notice && <div style={{ background:'rgba(232,160,32,.08)', border:'1px solid rgba(232,160,32,.3)', borderRadius:7, padding:'.5rem .75rem', color:'var(--amber)', fontSize:'.78rem', marginBottom:'.75rem' }}>{notice}</div>}
      {isEmpty && lastOrder && (
        <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:7, padding:'.5rem .75rem', marginBottom:'.75rem', fontSize:'.78rem', color:'var(--text2)', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'.4rem' }}>
          <span>Letzte Bestellung: {new Date(lastOrder.created_at).toLocaleDateString('de-DE')} \u00b7 {(typeof lastOrder.items === 'string' ? JSON.parse(lastOrder.items) : (lastOrder.items||[])).length} Position(en)</span>
          <button type="button" disabled={reorderBusy} onClick={() => doReorder(lastOrder)}
            style={{ background:'transparent', border:'1px solid rgba(184,49,31,.3)', borderRadius:5, color:'var(--r)', cursor:'pointer', padding:'.2rem .5rem', fontSize:'.75rem' }}>
            {reorderBusy ? '\u2026' : '\u21ba Erneut bestellen'}
          </button>
        </div>
      )}
      {reorderNotice && <div style={{ fontSize:'.75rem', color:'var(--amber)', marginBottom:'.5rem' }}>{reorderNotice}</div>}
      {items.map((item,i) => (
        <div key={i} style={{ background:'var(--bg2)', borderRadius:8, padding:'.75rem', marginBottom:'.5rem' }}>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr auto', gap:'.5rem', alignItems:'end' }}>
            <div>
              <div style={{ fontSize:'.68rem', color:'var(--text3)', marginBottom:'.2rem' }}>Artikel</div>
              <ProductSearch value={item.productName} onChange={v => setItem(i,'productName',v)}
                onSelect={p => setItems(prev => prev.map((it,idx) => idx===i ? {...it, product_id:p.articleNumber, productName:p.name, articleNumber:p.articleNumber, unitPriceNet:p.price} : it))}/>
            </div>
            <div><div style={{ fontSize:'.68rem', color:'var(--text3)', marginBottom:'.2rem' }}>Menge</div>
              <input type="number" min="0" value={item.quantity} onChange={e => setItem(i,'quantity',parseInt(e.target.value)||0)} style={{ background:'var(--bg0)', border:'1px solid var(--border)', borderRadius:6, padding:'.3rem .5rem', color:'var(--text1)', fontSize:'.8rem', outline:'none', width:'100%' }}/></div>
            <div><div style={{ fontSize:'.68rem', color:'var(--text3)', marginBottom:'.2rem' }}>Preis netto</div>
              <input type="number" step="0.01" value={item.unitPriceNet} onChange={e => setItem(i,'unitPriceNet',parseFloat(e.target.value)||0)} style={{ background:'var(--bg0)', border:'1px solid var(--border)', borderRadius:6, padding:'.3rem .5rem', color:'var(--text1)', fontSize:'.8rem', outline:'none', width:'100%' }}/></div>
            <div><div style={{ fontSize:'.68rem', color:'var(--text3)', marginBottom:'.2rem' }}>Leergut</div>
              <input type="number" min="0" value={item.emptyReturn} onChange={e => setItem(i,'emptyReturn',parseInt(e.target.value)||0)} style={{ background:'var(--bg0)', border:'1px solid var(--border)', borderRadius:6, padding:'.3rem .5rem', color:'var(--text1)', fontSize:'.8rem', outline:'none', width:'100%' }}/></div>
            {items.length > 1 && <button onClick={() => setItems(prev => prev.filter((_,idx) => idx!==i))} style={{ background:'transparent', border:'1px solid rgba(224,80,80,.3)', borderRadius:6, color:'var(--red2)', cursor:'pointer', padding:'.3rem .5rem', fontSize:'.8rem' }}>✕</button>}
          </div>
        </div>
      ))}
      <button onClick={() => setItems(p => [...p, { productName:'', articleNumber:'', quantity:1, unitPriceNet:0, emptyReturn:0 }])} style={{ padding:'.3rem .7rem', borderRadius:7, fontSize:'.78rem', cursor:'pointer', background:'var(--bg2)', border:'1px solid var(--border)', color:'var(--text2)', marginBottom:'1rem' }}>+ Artikel</button>
      {deliveryAddresses.length > 0 && (
        <div style={{ marginBottom:'1rem' }}>
          <div style={{ fontSize:'.68rem', color:'var(--text3)', marginBottom:'.2rem' }}>Lieferadresse</div>
          <select value={deliveryAddressId} onChange={e => setDeliveryAddressId(e.target.value)} style={{ background:'var(--bg0)', border:'1px solid var(--border)', borderRadius:6, padding:'.35rem .6rem', color:'var(--text1)', fontSize:'.82rem', outline:'none', width:'100%' }}>
            <option value="">Hauptadresse ({customer.billing_street}, {customer.billing_zip} {customer.billing_city})</option>
            {deliveryAddresses.map(da => (
              <option key={da.id} value={da.id}>{da.name1} – {da.strasse}, {da.plz} {da.ort}</option>
            ))}
          </select>
        </div>
      )}
      <div style={{ marginBottom:'1rem' }}>
        <div style={{ fontSize:'.68rem', color:'var(--text3)', marginBottom:'.2rem' }}>Lieferhinweis</div>
        <input value={note} onChange={e => setNote(e.target.value)} style={{ background:'var(--bg0)', border:'1px solid var(--border)', borderRadius:6, padding:'.35rem .6rem', color:'var(--text1)', fontSize:'.82rem', outline:'none', width:'100%' }}/>
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontFamily:'DM Mono, monospace', fontSize:'.9rem', color:'var(--green)' }}>Gesamt netto: {totalNet.toFixed(2)} €</span>
        <div style={{ display:'flex', gap:'.5rem' }}>
          {msg && <span style={{ fontSize:'.8rem', color: msg.startsWith('✓') ? 'var(--green)' : 'var(--red2)' }}>{msg}</span>}
          <button disabled={busy} onClick={submit} style={{ padding:'.4rem .9rem', borderRadius:7, fontSize:'.78rem', cursor:'pointer', background:'var(--r)', border:'none', color:'#fff' }}>{busy ? '…' : '✓ Bestellung anlegen'}</button>
        </div>
      </div>
    </Modal>
  );
}

export { NewOrderModal };

function BulkResult({ job, pendingDups, onResolveDup, onResolveForce, onForceAll, onClose }) {
  const [showErrors, setShowErrors] = useState(true);
  return (
    <div style={{ background:'var(--bg1)', border:'1px solid var(--border)', borderRadius:9, padding:'1rem', marginBottom:'1rem' }}>
      <div style={{ display:'flex', gap:'1rem', marginBottom:'.75rem', flexWrap:'wrap', alignItems:'center' }}>
        <div style={{ display:'flex', gap:'1.25rem' }}>
          {[
            { label:'Erfolgreich',  val: job.success              ?? 0, color:'var(--green)' },
            { label:'Schon in LEX', val: job.skippedAlreadyLinked ?? 0, color:'var(--text3)' },
            { label:'Duplikate',    val: pendingDups?.length       ?? 0, color:'var(--amber)' },
            { label:'Fehler',       val: job.errors               ?? 0, color:'var(--red2)'  },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ textAlign:'center' }}>
              <div style={{ fontSize:'1.15rem', fontWeight:700, color, fontFamily:'DM Mono, monospace' }}>{val}</div>
              <div style={{ fontSize:'.65rem', color:'var(--text3)' }}>{label}</div>
            </div>
          ))}
        </div>
        <div style={{ marginLeft:'auto', display:'flex', gap:'.5rem', alignItems:'center' }}>
          {job.processed < job.total && <span style={{ fontSize:'.72rem', color:'var(--text2)' }}>{job.processed}/{job.total} verarbeitet</span>}
          {pendingDups?.length > 0 && <button onClick={onForceAll} style={{ padding:'.3rem .7rem', borderRadius:6, fontSize:'.75rem', cursor:'pointer', background:'rgba(255,255,255,.05)', border:'1px solid var(--border)', color:'var(--text3)' }}>Alle {pendingDups.length} neu anlegen</button>}
          <button onClick={onClose} style={{ padding:'.3rem .65rem', borderRadius:6, fontSize:'.75rem', cursor:'pointer', background:'var(--bg2)', border:'1px solid var(--border)', color:'var(--text2)' }}>✕</button>
        </div>
      </div>
      {pendingDups?.length > 0 && (
        <div style={{ marginBottom:'.75rem' }}>
          <div style={{ fontSize:'.72rem', color:'var(--amber)', fontWeight:600, marginBottom:'.4rem', textTransform:'uppercase', letterSpacing:'.06em' }}>⚠ Duplikate — Entscheidung ausstehend</div>
          {pendingDups.map(d => (
            <div key={d.customerId} style={{ background:'rgba(232,160,32,.06)', border:'1px solid rgba(232,160,32,.2)', borderRadius:7, padding:'.5rem .75rem', marginBottom:'.35rem', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'1rem', flexWrap:'wrap' }}>
              <div>
                <span style={{ fontSize:'.82rem', color:'var(--text1)', fontWeight:500 }}>{d.customerName}</span>
                {(d.customerZip || d.customerCity) && <span style={{ fontSize:'.72rem', color:'var(--text3)', marginLeft:'.5rem' }}>{d.customerZip} {d.customerCity}</span>}
                <span style={{ fontSize:'.7rem', color:'var(--amber)', marginLeft:'.5rem' }}>{d.duplicates?.length ?? 0} Treffer</span>
              </div>
              <div style={{ display:'flex', gap:'.35rem' }}>
                <button onClick={() => onResolveDup(d)} style={{ padding:'.28rem .65rem', borderRadius:5, fontSize:'.73rem', cursor:'pointer', background:'rgba(74,127,212,.12)', border:'1px solid rgba(74,127,212,.3)', color:'var(--blue)' }}>Vergleichen</button>
                <button onClick={() => onResolveForce(d.customerId)} style={{ padding:'.28rem .65rem', borderRadius:5, fontSize:'.73rem', cursor:'pointer', background:'rgba(255,255,255,.05)', border:'1px solid var(--border)', color:'var(--text3)' }}>Neu anlegen</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {job.errorList?.length > 0 && (
        <div>
          <button onClick={() => setShowErrors(s => !s)} style={{ background:'transparent', border:'none', cursor:'pointer', color:'var(--red2)', fontSize:'.75rem', padding:0, marginBottom:'.4rem' }}>
            {showErrors ? '▲' : '▶'} {job.errorList.length} Fehler
          </button>
          {showErrors && job.errorList.map((e, i) => (
            <div key={i} style={{ background:'rgba(224,80,80,.06)', border:'1px solid rgba(224,80,80,.2)', borderRadius:6, padding:'.4rem .75rem', marginBottom:'.3rem', fontSize:'.78rem', display:'flex', gap:'.75rem', flexWrap:'wrap' }}>
              <span style={{ color:'var(--text1)' }}>{e.name || e.id}</span>
              <span style={{ color:'var(--red2)' }}>{e.reason || e.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ─── F11: Neuer Kunde Modal ──────────────────────────────────────
function NewCustomerModal({ onClose, onCreated }) {
  const [form, setForm] = React.useState({
    company_name: '', first_name: '', last_name: '', name2: '', name3: '', billing_street: '', billing_zip: '', billing_city: '',
    billing_country: 'DE', phone: '', email: '', customer_number: '',
    ser_kategorie: 'F', info_sped: '',
    pfjn: true, mwstkz: true, belegart: 'L',
  });
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState('');

  const inp = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const inputStyle = { width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, padding: '.4rem .6rem', color: 'var(--text1)', fontSize: '.85rem', boxSizing: 'border-box' };
  const labelStyle = { fontSize: '.68rem', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: '.2rem' };
  const rowStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginBottom: '.75rem' };

  async function handleSubmit() {
    setErr('');
    if ((!form.company_name && !form.first_name && !form.last_name) || !form.billing_street || !form.billing_zip || !form.billing_city) {
      setErr('Firma oder Vorname/Nachname sowie Straße, PLZ und Ort sind Pflichtfelder.');
      return;
    }
    setBusy(true);
    try {
      const r = await fetch('/api/finance/customers/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await r.json();
      if (!r.ok) { setErr(data.error || 'Fehler beim Anlegen'); return; }
      onCreated(data);
    } catch(e) {
      setErr('Netzwerkfehler: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Neuer Kunde anlegen" onClose={onClose} wide>
      <div style={{ display: 'grid', gap: '.75rem' }}>
        <div style={rowStyle}>
          <div>
            <label style={labelStyle}>Firma</label>
            <input style={inputStyle} value={form.company_name} onChange={inp('company_name')} placeholder="Mustermann GmbH" />
          </div>
          <div>
            <label style={labelStyle}>Name 2 (Zusatz)</label>
            <input style={inputStyle} value={form.name2} onChange={inp('name2')} placeholder="z.B. c/o ..." />
          </div>
        </div>
        <div style={rowStyle}>
          <div>
            <label style={labelStyle}>Vorname</label>
            <input style={inputStyle} value={form.first_name} onChange={inp('first_name')} placeholder="nur falls keine Firma" />
          </div>
          <div>
            <label style={labelStyle}>Nachname</label>
            <input style={inputStyle} value={form.last_name} onChange={inp('last_name')} placeholder="nur falls keine Firma" />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Name 3 (Ansprechpartner, optional)</label>
          <input style={inputStyle} value={form.name3} onChange={inp('name3')} placeholder="z.Hd. Herr/Frau ..." />
        </div>
        <div>
          <label style={labelStyle}>Straße + Nr *</label>
          <input style={inputStyle} value={form.billing_street} onChange={inp('billing_street')} placeholder="Hauptstr. 1" />
        </div>
        <div style={rowStyle}>
          <div>
            <label style={labelStyle}>PLZ *</label>
            <input style={inputStyle} value={form.billing_zip} onChange={inp('billing_zip')} placeholder="83022" />
          </div>
          <div>
            <label style={labelStyle}>Ort *</label>
            <input style={inputStyle} value={form.billing_city} onChange={inp('billing_city')} placeholder="Rosenheim" />
          </div>
        </div>
        <div style={rowStyle}>
          <div>
            <label style={labelStyle}>Telefon</label>
            <input style={inputStyle} value={form.phone} onChange={inp('phone')} placeholder="08031 123456" />
          </div>
          <div>
            <label style={labelStyle}>E-Mail</label>
            <input style={inputStyle} value={form.email} onChange={inp('email')} placeholder="info@firma.de" />
          </div>
        </div>
        <div style={rowStyle}>
          <div>
            <label style={labelStyle}>SER-Kundennummer</label>
            <input style={{...inputStyle, background:'var(--bg3,#1a1a1a)', color:'var(--text3)', cursor:'default'}} value="wird automatisch vergeben" readOnly />
          </div>
          <div>
            <label style={labelStyle}>Belegart</label>
            <select style={inputStyle} value={form.belegart} onChange={inp('belegart')}>
              <option value="L">L – Lieferschein</option>
              <option value="R">R – Rechnung</option>
              <option value="Q">Q – Quittung</option>
            </select>
          </div>
        </div>
        <div style={rowStyle}>
          <div>
            <label style={labelStyle}>Kategorie</label>
            <select style={inputStyle} value={form.ser_kategorie} onChange={inp('ser_kategorie')}>
              <option value="F">F – Festkunde</option>
              <option value="T">T – Tauschkunde</option>
              <option value="FT">FT – Fest/Tausch</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Info für Fahrer (max 80 Z.)</label>
            <input style={inputStyle} value={form.info_sped} onChange={inp('info_sped')} maxLength={80} placeholder="Zufahrt über Hintereingang" />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', padding: '.5rem 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.82rem', color: 'var(--text2)', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.pfjn} onChange={inp('pfjn')} /> Pfand (pfjn)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.82rem', color: 'var(--text2)', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.mwstkz} onChange={inp('mwstkz')} /> MwSt (mwstkz)
          </label>
        </div>
        {err && <div style={{ background: 'rgba(224,80,80,.08)', border: '1px solid rgba(224,80,80,.3)', borderRadius: 7, padding: '.6rem .8rem', color: 'var(--red2)', fontSize: '.82rem' }}>✗ {err}</div>}
        <div style={{ display: 'flex', gap: '.6rem', justifyContent: 'flex-end', marginTop: '.25rem' }}>
          <button onClick={onClose} style={{ padding: '.5rem 1rem', borderRadius: 7, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer', fontSize: '.85rem' }}>Abbrechen</button>
          <button onClick={handleSubmit} disabled={busy} style={{ padding: '.5rem 1.2rem', borderRadius: 7, background: 'var(--blue)', border: 'none', color: '#fff', cursor: busy ? 'not-allowed' : 'pointer', fontSize: '.85rem', fontWeight: 600, opacity: busy ? .7 : 1 }}>
            {busy ? '⏳ Speichern…' : '✓ Kunde anlegen'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function LexwareDupModal({ lexwareCandidate, onLink, onOverwrite, onForce, onCancel }) {
  const btnBase = { display:'flex', flexDirection:'column', alignItems:'flex-start', gap:'.15rem', padding:'.5rem .75rem', borderRadius:7, fontSize:'.8rem', cursor:'pointer', flex:1, minWidth:150 };
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.85)', zIndex:260, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'var(--bg1)', border:'1px solid var(--border)', borderRadius:10, width:'92%', maxWidth:640, maxHeight:'85vh', overflow:'auto' }}>
        <div style={{ padding:'1rem 1.25rem', borderBottom:'1px solid var(--border)' }}>
          <div style={{ fontSize:'.95rem', fontWeight:600, color:'var(--text1)' }}>Moegliches Duplikat</div>
          <div style={{ fontSize:'.78rem', color:'var(--text3)', marginTop:'.2rem' }}>Lexware: <strong style={{ color:'var(--text2)' }}>{lexwareCandidate.lexwareName}</strong></div>
        </div>
        <div style={{ padding:'.5rem 1.25rem' }}>
          {lexwareCandidate.duplicates.map((d, i) => (
            <div key={d.portalCustomerId} style={{ padding:'.6rem 0', borderBottom: i < lexwareCandidate.duplicates.length-1 ? '1px solid rgba(255,255,255,.06)' : 'none' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'.3rem' }}>
                <span style={{ fontSize:'.85rem', color:'var(--text1)', fontWeight:500 }}>{d.portalCustomerName}</span>
                <span style={{ fontSize:'.7rem', color:'var(--text3)' }}>#{d.portalCustomerNumber} · Score {d.score}</span>
              </div>
              <div style={{ marginBottom:'.4rem', border:'1px solid var(--border)', borderRadius:6, overflow:'hidden' }}>
                {d.matches.map((m, mi) => (
                  <div key={m.field} style={{ display:'flex', fontSize:'.75rem', borderTop: mi>0 ? '1px solid rgba(255,255,255,.06)' : 'none' }}>
                    <div style={{ width:70, flexShrink:0, padding:'.35rem .5rem', color:'var(--text3)', background:'var(--bg2)' }}>{m.field}</div>
                    <div style={{ flex:1, padding:'.35rem .5rem', color:'var(--text2)' }}>{m.local || '—'}</div>
                    <div style={{ flex:1, padding:'.35rem .5rem', color:'var(--amber)', borderLeft:'1px solid var(--border)' }}>{m.lex || '—'}</div>
                  </div>
                ))}
              </div>
              <div style={{ display:'flex', gap:'.4rem', flexWrap:'wrap' }}>
                <button style={{ ...btnBase, border:'1px solid rgba(74,127,212,.35)', background:'rgba(74,127,212,.1)', color:'var(--blue)' }} onClick={() => onLink(d.portalCustomerId)}>
                  <span>🔗 Verknuepfen</span><span style={{ fontSize:'.63rem', opacity:.7 }}>Nur ID-Mapping</span>
                </button>
                <button style={{ ...btnBase, border:'1px solid rgba(232,160,32,.35)', background:'rgba(232,160,32,.08)', color:'var(--amber)' }} onClick={() => onOverwrite(d.portalCustomerId)}>
                  <span>↺ Ueberschreiben</span><span style={{ fontSize:'.63rem', opacity:.7 }}>Lexware-Daten → Portal</span>
                </button>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display:'flex', gap:'.5rem', padding:'1rem 1.25rem', borderTop:'1px solid var(--border)' }}>
          <button style={{ padding:'.4rem .8rem', borderRadius:7, fontSize:'.78rem', cursor:'pointer', background:'rgba(255,255,255,.04)', border:'1px solid var(--border)', color:'var(--text2)' }} onClick={onForce}>+ Trotzdem neu anlegen</button>
          <button style={{ padding:'.4rem .8rem', borderRadius:7, fontSize:'.78rem', cursor:'pointer', background:'transparent', border:'1px solid var(--border)', color:'var(--text3)' }} onClick={onCancel}>Abbrechen</button>
        </div>
      </div>
    </div>
  );
}

function ImportBulkResult({ job, pendingLexDups, onResolveDup, onResolveForce, onForceAll, onClose }) {
  return (
    <div style={{ background:'var(--bg1)', border:'1px solid var(--border)', borderRadius:9, padding:'1rem', marginBottom:'1rem' }}>
      <div style={{ display:'flex', gap:'1rem', marginBottom:'.75rem', flexWrap:'wrap', alignItems:'center' }}>
        <div style={{ display:'flex', gap:'1.25rem' }}>
          {[
            { label:'Neu angelegt',  val: job.success ?? 0, color:'var(--green)' },
            { label:'Schon verknuepft', val: job.alreadyLinked ?? 0, color:'var(--text3)' },
            { label:'Duplikate',    val: pendingLexDups?.length ?? 0, color:'var(--amber)' },
            { label:'Fehler',       val: job.errors ?? 0, color:'var(--red2)' },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ textAlign:'center' }}>
              <div style={{ fontSize:'1.15rem', fontWeight:700, color, fontFamily:'DM Mono, monospace' }}>{val}</div>
              <div style={{ fontSize:'.65rem', color:'var(--text3)' }}>{label}</div>
            </div>
          ))}
        </div>
        <div style={{ marginLeft:'auto', display:'flex', gap:'.5rem', alignItems:'center' }}>
          {job.processed < job.total && <span style={{ fontSize:'.72rem', color:'var(--text2)' }}>{job.processed}/{job.total} verarbeitet</span>}
          {pendingLexDups?.length > 0 && <button onClick={onForceAll} style={{ padding:'.3rem .7rem', borderRadius:6, fontSize:'.75rem', cursor:'pointer', background:'rgba(255,255,255,.05)', border:'1px solid var(--border)', color:'var(--text3)' }}>Alle {pendingLexDups.length} neu anlegen</button>}
          <button onClick={onClose} style={{ padding:'.3rem .65rem', borderRadius:6, fontSize:'.75rem', cursor:'pointer', background:'var(--bg2)', border:'1px solid var(--border)', color:'var(--text2)' }}>✕</button>
        </div>
      </div>
      {pendingLexDups?.length > 0 && (
        <div>
          <div style={{ fontSize:'.72rem', color:'var(--amber)', fontWeight:600, marginBottom:'.4rem', textTransform:'uppercase', letterSpacing:'.06em' }}>⚠ Duplikate — Entscheidung ausstehend</div>
          {pendingLexDups.map(d => (
            <div key={d.lexwareId} style={{ background:'rgba(232,160,32,.06)', border:'1px solid rgba(232,160,32,.2)', borderRadius:7, padding:'.5rem .75rem', marginBottom:'.35rem', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'1rem', flexWrap:'wrap' }}>
              <div>
                <span style={{ fontSize:'.82rem', color:'var(--text1)', fontWeight:500 }}>{d.lexwareName}</span>
                {(d.lexwareZip || d.lexwareCity) && <span style={{ fontSize:'.72rem', color:'var(--text3)', marginLeft:'.5rem' }}>{d.lexwareZip} {d.lexwareCity}</span>}
                <span style={{ fontSize:'.7rem', color:'var(--amber)', marginLeft:'.5rem' }}>{d.duplicates?.length ?? 0} Treffer</span>
              </div>
              <div style={{ display:'flex', gap:'.35rem' }}>
                <button onClick={() => onResolveDup(d)} style={{ padding:'.28rem .65rem', borderRadius:5, fontSize:'.73rem', cursor:'pointer', background:'rgba(74,127,212,.12)', border:'1px solid rgba(74,127,212,.3)', color:'var(--blue)' }}>Vergleichen</button>
                <button onClick={() => onResolveForce(d.lexwareId)} style={{ padding:'.28rem .65rem', borderRadius:5, fontSize:'.73rem', cursor:'pointer', background:'rgba(255,255,255,.05)', border:'1px solid var(--border)', color:'var(--text3)' }}>Neu anlegen</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {job.errorList?.length > 0 && (
        <div style={{ marginTop:'.5rem', fontSize:'.75rem', color:'var(--red2)' }}>
          {job.errorList.length} Fehler beim Import (Details im Backend-Log).
        </div>
      )}
    </div>
  );
}

export default
function Customers() {
  const [customers,    setCustomers]    = useState([]);
  const [total,        setTotal]        = useState(0);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [detail,       setDetail]       = useState(null);
  const [page,         setPage]         = useState(0);
  const [filters,      setFilters]      = useState({ q:'', in_lexware:'' });
  const [showInactive, setShowInactive] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy,   setDeleteBusy]   = useState(false);
  const LIMIT = 50;

  const [selected,    setSelected]    = useState(new Set());
  const [bulkBusy,    setBulkBusy]    = useState(false);
  const [bulkJob,     setBulkJob]     = useState(null);
  const [pendingDups, setPendingDups] = useState([]);
  const [dupModal,    setDupModal]    = useState(null);
  const pollRef = useRef(null);
  const [importBusy,     setImportBusy]     = useState(false);
  const [importJob,      setImportJob]      = useState(null);
  const [pendingLexDups, setPendingLexDups] = useState([]);
  const [lexDupModal,    setLexDupModal]    = useState(null);
  const importPollRef = useRef(null);

  const load = useCallback(async (f, p, inactive = false) => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ limit: LIMIT, page: p });
      if (f.q) params.set('q', f.q);
      if (f.in_lexware !== '') params.set('in_lexware', f.in_lexware);
      if (inactive) params.set('showInactive', 'true');
      const r = await fetch('/api/finance/customers?' + params);
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setCustomers(d.customers || []); setTotal(d.total || 0);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(filters, page, showInactive); }, []);
  useEffect(() => { setSelected(new Set()); }, [page, filters]);

  const applyFilter = (key, val) => {
    const f = { ...filters, [key]: val };
    setFilters(f); setPage(0); load(f, 0, showInactive);
  };

  const toggleInactive = () => {
    const ni = !showInactive;
    setShowInactive(ni);
    load(filters, page, ni);
  };

  // ── Soft-Delete ──
  const softDelete = async (customer) => {
    setDeleteBusy(true);
    try {
      const r = await fetch('/api/finance/customers/' + customer.id, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_name: customer.company_name, name: customer.name }),
      });
      const d = await r.json();
      if (!d.success) throw new Error('Fehler');
      setDeleteTarget(null);
      load(filters, page, showInactive);
    } catch(e) { setError('Fehler: ' + e.message); setDeleteTarget(null); }
    finally { setDeleteBusy(false); }
  };

  const restoreCustomer = async (customer) => {
    try {
      await fetch('/api/finance/customers/' + customer.id + '/restore', { method: 'PATCH' });
      load(filters, page, showInactive);
    } catch(e) { setError('Fehler: ' + e.message); }
  };

  // ── Selektion ──
  const visibleIds = customers.filter(c => !c.deleted_at).map(c => c.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every(id => selected.has(id));
  const toggleAll = () => {
    if (allSelected) setSelected(prev => { const n=new Set(prev); visibleIds.forEach(id=>n.delete(id)); return n; });
    else             setSelected(prev => { const n=new Set(prev); visibleIds.forEach(id=>n.add(id));    return n; });
  };
  const toggleOne = (id) => setSelected(prev => { const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n; });
  const selectNonLex = () => setSelected(prev => { const n=new Set(prev); customers.filter(c=>!c.in_lexware&&!c.deleted_at).forEach(c=>n.add(c.id)); return n; });

  // ── Bulk Push ──
  const startBulkPush = async (skipDuplicateCheck = false, overrideIds = null, isRetry = false) => {
    const ids = overrideIds ?? [...selected];
    if (!ids.length) return;
    setBulkBusy(true); setBulkJob(null);
    if (!isRetry) setPendingDups([]);
    try {
      const r = await fetch('/api/finance/customers/bulk-push', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ customerIds: ids, skipDuplicateCheck }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      pollJob(d.jobId, ids);
    } catch(e) {
      setError('Bulk Push Fehler: ' + e.message);
      setBulkBusy(false);
    }
    setSelected(new Set());
  };

  const pollJob = (jobId, submittedIds) => {
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      if (++attempts > 180) { clearInterval(pollRef.current); setError('Timeout'); setBulkBusy(false); return; }
      try {
        const r = await fetch(`/api/finance/customers/bulk-push/${jobId}/status`);
        const d = await r.json();
        if (d.status === 'done') { clearInterval(pollRef.current); handleJobDone(d, submittedIds); }
        else if (d.status === 'error') { clearInterval(pollRef.current); setError(d.fatalError || 'Job fehlgeschlagen'); setBulkBusy(false); }
        else { setBulkJob(d); }
      } catch(e) { clearInterval(pollRef.current); setError(e.message); setBulkBusy(false); }
    }, 1200);
  };

  const handleJobDone = (job, submittedIds) => {
    setBulkBusy(false); setBulkJob(job);
    const dups = (job.duplicatesToReview || []).map(dup => {
      const portalCustomer = customers.find(c => c.id === dup.customerId)
        || { id: dup.customerId, name: dup.customerName, billing_zip: dup.customerZip, billing_city: dup.customerCity };
      return { ...dup, portalCustomer };
    });
    setPendingDups(prev => {
      const newIds = new Set(dups.map(d => d.customerId));
      return [...prev.filter(d => !newIds.has(d.customerId)), ...dups];
    });
    load(filters, page, showInactive);
  };

  const openDupModal = (dup) => setDupModal({ customer: dup.portalCustomer, matches: dup.duplicates || [], customerId: dup.customerId, customerName: dup.customerName });

  const handleBulkDupLink = async (lexId) => {
    const { customerId } = dupModal; setDupModal(null);
    try {
      await fetch(`/api/finance/customers/${customerId}/link-to-lexware?linkOnly=true`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ lexwareId: lexId }) });
      setPendingDups(prev => prev.filter(d => d.customerId !== customerId));
      setBulkJob(prev => prev ? { ...prev, success: (prev.success||0)+1 } : prev);
    } catch(e) { setError('Link-Fehler: ' + e.message); }
    load(filters, page, showInactive);
  };

  const handleBulkDupOverwrite = async (lexId) => {
    const { customerId } = dupModal; setDupModal(null);
    try {
      await fetch(`/api/finance/customers/${customerId}/link-to-lexware`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ lexwareId: lexId }) });
      setPendingDups(prev => prev.filter(d => d.customerId !== customerId));
      setBulkJob(prev => prev ? { ...prev, success: (prev.success||0)+1 } : prev);
    } catch(e) { setError('Overwrite-Fehler: ' + e.message); }
    load(filters, page, showInactive);
  };

  const handleBulkDupForce = async () => {
    const { customerId } = dupModal; setDupModal(null);
    setPendingDups(prev => prev.filter(d => d.customerId !== customerId));
    await startBulkPush(true, [customerId], true);
  };

  const handleResolveForce = (customerId) => {
    setPendingDups(prev => prev.filter(d => d.customerId !== customerId));
    startBulkPush(true, [customerId], true);
  };

  const handleForceAll = () => {
    const ids = pendingDups.map(d => d.customerId);
    setPendingDups([]);
    startBulkPush(true, ids);
  };

  // ── F12: Lexware-Import ──
  const startLexwareImport = async () => {
    if (!window.confirm('Alle Lexware-Kontakte einlesen und mit dem Portal abgleichen? Das kann je nach Anzahl mehrere Minuten dauern.')) return;
    setImportBusy(true); setImportJob(null); setPendingLexDups([]);
    try {
      const r = await fetch('/api/finance/customers/import-from-lexware', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ dryRun: false }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      pollImportJob(d.jobId);
    } catch(e) {
      setError('Lexware-Import Fehler: ' + e.message);
      setImportBusy(false);
    }
  };

  const pollImportJob = (jobId) => {
    let attempts = 0;
    importPollRef.current = setInterval(async () => {
      if (++attempts > 300) { clearInterval(importPollRef.current); setError('Timeout beim Lexware-Import'); setImportBusy(false); return; }
      try {
        const r = await fetch(`/api/finance/customers/import-from-lexware/${jobId}/status`);
        const d = await r.json();
        if (d.status === 'done') { clearInterval(importPollRef.current); handleImportJobDone(d); }
        else if (d.status === 'error') { clearInterval(importPollRef.current); setError(d.fatalError || 'Import-Job fehlgeschlagen'); setImportBusy(false); }
        else { setImportJob(d); }
      } catch(e) { clearInterval(importPollRef.current); setError(e.message); setImportBusy(false); }
    }, 1500);
  };

  const handleImportJobDone = (job) => {
    setImportBusy(false); setImportJob(job);
    setPendingLexDups(job.duplicatesToReview || []);
    load(filters, page, showInactive);
  };

  const openLexDupModal = (dup) => setLexDupModal(dup);

  const handleLexLink = async (portalCustomerId) => {
    const { lexwareId } = lexDupModal; setLexDupModal(null);
    try {
      const r = await fetch('/api/finance/customers/import-from-lexware/resolve', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ lexwareId, action:'link', portalCustomerId }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Verknuepfen fehlgeschlagen (Status ' + r.status + ')');
      setPendingLexDups(prev => prev.filter(d2 => d2.lexwareId !== lexwareId));
      setImportJob(prev => prev ? { ...prev, alreadyLinked: (prev.alreadyLinked||0)+1 } : prev);
    } catch(e) { setError('Verknuepfen-Fehler: ' + e.message); }
    load(filters, page, showInactive);
  };

  const handleLexOverwrite = async (portalCustomerId) => {
    const { lexwareId } = lexDupModal; setLexDupModal(null);
    try {
      const r = await fetch('/api/finance/customers/import-from-lexware/resolve', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ lexwareId, action:'overwrite', portalCustomerId }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Ueberschreiben fehlgeschlagen (Status ' + r.status + ')');
      setPendingLexDups(prev => prev.filter(d2 => d2.lexwareId !== lexwareId));
      setImportJob(prev => prev ? { ...prev, alreadyLinked: (prev.alreadyLinked||0)+1 } : prev);
    } catch(e) { setError('Ueberschreiben-Fehler: ' + e.message); }
    load(filters, page, showInactive);
  };

  const handleLexForceFromModal = async () => {
    const { lexwareId } = lexDupModal; setLexDupModal(null);
    await resolveLexForce(lexwareId);
  };

  const resolveLexForce = async (lexwareId) => {
    setPendingLexDups(prev => prev.filter(d => d.lexwareId !== lexwareId));
    try {
      await fetch('/api/finance/customers/import-from-lexware/resolve', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ lexwareId, action:'force' }),
      });
      setImportJob(prev => prev ? { ...prev, success: (prev.success||0)+1 } : prev);
    } catch(e) { setError('Neu-anlegen-Fehler: ' + e.message); }
    load(filters, page, showInactive);
  };

  const handleLexForceAll = () => {
    const ids = pendingLexDups.map(d => d.lexwareId);
    setPendingLexDups([]);
    ids.forEach(id => resolveLexForce(id));
  };

  useEffect(() => () => clearInterval(pollRef.current), []);
  useEffect(() => () => clearInterval(importPollRef.current), []);

  const totalPages = Math.ceil(total / LIMIT);
  const cbStyle = { cursor:'pointer', accentColor:'var(--r)', width:14, height:14 };

  return (
    <div>
      {detail && <CustomerDetail customer={detail} onClose={() => setDetail(null)} onRefresh={() => load(filters, page, showInactive)}/>}
      {dupModal && <DupModal portalCustomer={dupModal.customer} matches={dupModal.matches} onLink={handleBulkDupLink} onOverwrite={handleBulkDupOverwrite} onForce={handleBulkDupForce} onCancel={() => setDupModal(null)}/>}
      {lexDupModal && <LexwareDupModal lexwareCandidate={lexDupModal} onLink={handleLexLink} onOverwrite={handleLexOverwrite} onForce={handleLexForceFromModal} onCancel={() => setLexDupModal(null)}/>}

      {/* Delete-Bestätigungs-Modal */}
      {deleteTarget && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.85)', zIndex:250, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'var(--bg1)', border:'1px solid rgba(224,80,80,.3)', borderRadius:10, padding:'1.5rem', width:'90%', maxWidth:420 }}>
            <div style={{ fontWeight:600, color:'var(--text1)', marginBottom:'.6rem', fontSize:'.95rem' }}>Kunde ausblenden?</div>
            <p style={{ fontSize:'.85rem', color:'var(--text2)', marginBottom:'1.25rem', lineHeight:1.5 }}>
              <strong style={{ color:'var(--text1)' }}>{deleteTarget.company_name || deleteTarget.name}</strong> wird als inaktiv markiert und aus der normalen Liste ausgeblendet. Keine Daten werden gelöscht.
            </p>
            <div style={{ display:'flex', gap:'.5rem' }}>
              <button disabled={deleteBusy} onClick={() => softDelete(deleteTarget)}
                style={{ padding:'.4rem .9rem', borderRadius:7, fontSize:'.78rem', cursor:'pointer', background:'var(--r)', border:'none', color:'#fff' }}>
                {deleteBusy ? '…' : 'Ausblenden'}
              </button>
              <button onClick={() => setDeleteTarget(null)}
                style={{ padding:'.4rem .8rem', borderRadius:7, fontSize:'.78rem', cursor:'pointer', background:'var(--bg2)', border:'1px solid var(--border)', color:'var(--text2)' }}>Abbrechen</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'1.2rem', flexWrap:'wrap', gap:'.75rem' }}>
        <div>
          <h1 style={{ fontSize:'1.15rem', fontWeight:600, color:'var(--text1)' }}>Kunden</h1>
          <p style={{ color:'var(--text2)', fontSize:'.8rem', marginTop:'.2rem' }}>{total} gesamt</p>
        </div>
        <div style={{ display:'flex', gap:'.5rem', flexWrap:'wrap', alignItems:'center' }}>
          <input value={filters.q} onChange={e => applyFilter('q', e.target.value)} placeholder="Name, PLZ, Ort, E-Mail…"
            style={{ background:'var(--bg0)', border:'1px solid var(--border)', borderRadius:7, padding:'.3rem .7rem', color:'var(--text1)', fontSize:'.8rem', outline:'none', width:220 }}/>
          <select value={filters.in_lexware} onChange={e => applyFilter('in_lexware', e.target.value)}
            style={{ background:'var(--bg0)', border:'1px solid var(--border)', borderRadius:7, padding:'.3rem .6rem', color: filters.in_lexware ? 'var(--text1)' : 'var(--text3)', fontSize:'.8rem', outline:'none' }}>
            <option value="">Alle Kunden</option>
            <option value="true">In Lexware</option>
            <option value="false">Nicht in Lexware</option>
          </select>
          {/* Toggle: Inaktive anzeigen */}
          <button onClick={toggleInactive}
            style={{ padding:'.3rem .65rem', borderRadius:7, fontSize:'.75rem', cursor:'pointer',
              background: showInactive ? 'rgba(232,160,32,.12)' : 'var(--bg2)',
              border: showInactive ? '1px solid rgba(232,160,32,.35)' : '1px solid var(--border)',
              color: showInactive ? 'var(--amber)' : 'var(--text3)' }}>
            {showInactive ? '⊘ Inaktive ausblenden' : '⊘ Inaktive anzeigen'}
          </button>
          <button onClick={startLexwareImport} disabled={importBusy}
            style={{ padding:'.4rem .8rem', background: importBusy ? 'var(--bg3)' : 'rgba(74,127,212,.1)', border:'1px solid rgba(74,127,212,.35)', borderRadius:8, color:'var(--blue)', fontSize:'.8rem', cursor: importBusy ? 'default' : 'pointer', opacity: importBusy ? .6 : 1 }}>
            {importBusy ? '⏳ Import läuft…' : '⬇ Aus Lexware importieren'}
          </button>
          <button onClick={() => load(filters, page, showInactive)} style={{ padding:'.4rem .8rem', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text2)', fontSize:'.8rem', cursor:'pointer' }}>↻</button>
        </div>
      </div>

      {/* Bulk-Progress */}
      {bulkBusy && bulkJob && (
        <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:8, padding:'.6rem 1rem', marginBottom:'.75rem', display:'flex', alignItems:'center', gap:'1rem', fontSize:'.82rem' }}>
          <span style={{ color:'var(--text3)' }}>⏳</span>
          <span style={{ color:'var(--text2)' }}>Push läuft… {bulkJob.processed}/{bulkJob.total}</span>
          <div style={{ flex:1, height:4, background:'var(--bg3)', borderRadius:2, overflow:'hidden' }}>
            <div style={{ height:'100%', background:'var(--r)', width: `${Math.round((bulkJob.processed/bulkJob.total)*100)}%`, transition:'width .5s' }}/>
          </div>
        </div>
      )}
      {bulkBusy && !bulkJob && (
        <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:8, padding:'.6rem 1rem', marginBottom:'.75rem', fontSize:'.82rem', color:'var(--text2)' }}>⏳ Starte Bulk-Push…</div>
      )}

      {/* Bulk-Ergebnis */}
      {bulkJob && !bulkBusy && (
        <BulkResult job={bulkJob} pendingDups={pendingDups} onResolveDup={openDupModal} onResolveForce={handleResolveForce} onForceAll={handleForceAll} onClose={() => { setBulkJob(null); setPendingDups([]); }}/>
      )}

      {/* Lexware-Import Progress */}
      {importBusy && importJob && (
        <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:8, padding:'.6rem 1rem', marginBottom:'.75rem', display:'flex', alignItems:'center', gap:'1rem', fontSize:'.82rem' }}>
          <span style={{ color:'var(--text3)' }}>⏳</span>
          <span style={{ color:'var(--text2)' }}>Lexware-Import läuft… {importJob.processed}/{importJob.total}</span>
          <div style={{ flex:1, height:4, background:'var(--bg3)', borderRadius:2, overflow:'hidden' }}>
            <div style={{ height:'100%', background:'var(--r)', width: `${Math.round((importJob.processed/importJob.total)*100)}%`, transition:'width .5s' }}/>
          </div>
        </div>
      )}
      {importBusy && !importJob && (
        <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:8, padding:'.6rem 1rem', marginBottom:'.75rem', fontSize:'.82rem', color:'var(--text2)' }}>⏳ Starte Lexware-Import…</div>
      )}

      {/* Lexware-Import Ergebnis */}
      {importJob && !importBusy && (
        <ImportBulkResult job={importJob} pendingLexDups={pendingLexDups} onResolveDup={openLexDupModal} onResolveForce={resolveLexForce} onForceAll={handleLexForceAll} onClose={() => { setImportJob(null); setPendingLexDups([]); }}/>
      )}

      {/* Bulk Action Bar */}
      {selected.size > 0 && (
        <div style={{ display:'flex', alignItems:'center', gap:'.75rem', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:8, padding:'.5rem .85rem', marginBottom:'.75rem', flexWrap:'wrap' }}>
          <span style={{ fontSize:'.82rem', color:'var(--text2)' }}>
            <span style={{ color:'var(--text1)', fontWeight:600 }}>{selected.size}</span> ausgewählt
          </span>
          <button onClick={() => startBulkPush(false)} disabled={bulkBusy}
            style={{ padding:'.35rem .8rem', borderRadius:7, fontSize:'.78rem', cursor:'pointer', background: bulkBusy ? 'var(--bg3)' : 'var(--r)', border:'none', color:'#fff', opacity: bulkBusy?.6:1 }}>
            {bulkBusy ? '⏳ Läuft…' : '→ In Lexware pushen'}
          </button>
          <button onClick={() => setSelected(new Set())} style={{ padding:'.3rem .6rem', borderRadius:6, fontSize:'.75rem', cursor:'pointer', background:'transparent', border:'1px solid var(--border)', color:'var(--text3)' }}>Auswahl aufheben</button>
          <button onClick={selectNonLex} style={{ padding:'.3rem .6rem', borderRadius:6, fontSize:'.75rem', cursor:'pointer', background:'transparent', border:'1px solid var(--border)', color:'var(--text3)' }}>Alle ohne LEX</button>
        </div>
      )}

      {error && <div style={{ background:'rgba(224,80,80,.08)', border:'1px solid rgba(224,80,80,.3)', borderRadius:9, padding:'.75rem 1rem', color:'var(--red2)', fontSize:'.85rem', marginBottom:'1rem' }}>✗ {error}</div>}

      {loading ? <div style={{ color:'var(--text3)', textAlign:'center', padding:'3rem' }}>Lade Kunden…</div> : (
        <div style={{ background:'var(--bg1)', border:'1px solid var(--border)', borderRadius:9, overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'var(--bg2)', borderBottom:'1px solid var(--border)' }}>
                  <th style={{ padding:'.5rem .65rem', width:32 }}>
                    <input type="checkbox" style={cbStyle} checked={allSelected} onChange={toggleAll} title="Alle auf dieser Seite"/>
                  </th>
                  {['Name','PLZ / Ort','KD-Nr','SER','LEX','Letzte Best.',''].map(h => (
                    <th key={h} style={{ textAlign:'left', padding:'.5rem .65rem', fontSize:'.65rem', textTransform:'uppercase', letterSpacing:'.08em', color:'var(--text3)', fontFamily:'DM Mono, monospace', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {customers.map(c => {
                  const isInactive = !!c.deleted_at;
                  return (
                    <tr key={c.id}
                      style={{ borderBottom:'1px solid rgba(255,255,255,.04)', cursor: isInactive ? 'default' : 'pointer',
                        background: isInactive ? 'rgba(255,255,255,.01)' : selected.has(c.id) ? 'rgba(184,49,31,.06)' : 'transparent',
                        opacity: isInactive ? 0.45 : 1 }}
                      onClick={() => !isInactive && setDetail(c)}>
                      <td style={{ padding:'.5rem .65rem' }} onClick={e => { e.stopPropagation(); if (!isInactive) toggleOne(c.id); }}>
                        {!isInactive && <input type="checkbox" style={cbStyle} checked={selected.has(c.id)} onChange={() => toggleOne(c.id)}/>}
                      </td>
                      <td style={{ padding:'.5rem .65rem', fontSize:'.85rem', color: isInactive ? 'var(--text3)' : 'var(--text1)', fontWeight:500, maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {c.company_name||c.name||`${c.last_name||''} ${c.first_name||''}`.trim()}
                        {isInactive && <span style={{ marginLeft:'.4rem', fontSize:'.65rem', color:'var(--text3)', fontFamily:'DM Mono, monospace' }}>inaktiv</span>}
                      </td>
                      <td style={{ padding:'.5rem .65rem', fontSize:'.8rem', color:'var(--text2)' }}>{c.billing_zip} {c.billing_city}</td>
                      <td style={{ padding:'.5rem .65rem', fontFamily:'DM Mono, monospace', fontSize:'.75rem', color:'var(--text3)' }}>{c.customer_number}</td>
                      <td style={{ padding:'.5rem .65rem' }}><SerBadge in_ser_fvk={c.in_ser_fvk}/></td>
                      <td style={{ padding:'.5rem .65rem' }}><LexBadge in_lexware={c.in_lexware}/></td>
                      <td style={{ padding:'.5rem .65rem', fontSize:'.78rem', color:'var(--text2)' }}>{c.datum_letzte_lieferung ? new Date(c.datum_letzte_lieferung).toLocaleDateString('de-DE') : '—'}</td>
                      <td style={{ padding:'.5rem .65rem', display:'flex', gap:'.35rem', alignItems:'center' }}>
                        {!isInactive && (
                          <>
                            <button onClick={e => { e.stopPropagation(); setDetail(c); }} style={{ padding:'.2rem .5rem', borderRadius:5, fontSize:'.75rem', background:'transparent', border:'1px solid var(--border)', color:'var(--text2)', cursor:'pointer' }}>Detail</button>
                            <button onClick={e => { e.stopPropagation(); setDeleteTarget(c); }} style={{ padding:'.2rem .45rem', borderRadius:5, fontSize:'.75rem', background:'transparent', border:'1px solid rgba(224,80,80,.2)', color:'var(--text3)', cursor:'pointer' }} title="Ausblenden">🗑</button>
                          </>
                        )}
                        {isInactive && (
                          <button onClick={e => { e.stopPropagation(); restoreCustomer(c); }} style={{ padding:'.2rem .5rem', borderRadius:5, fontSize:'.75rem', background:'rgba(46,189,122,.08)', border:'1px solid rgba(46,189,122,.25)', color:'var(--green)', cursor:'pointer' }}>↺ Wiederherstellen</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {customers.length === 0 && <tr><td colSpan={8} style={{ padding:'2rem', textAlign:'center', color:'var(--text3)', fontSize:'.82rem' }}>Keine Kunden gefunden.</td></tr>}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div style={{ display:'flex', justifyContent:'center', gap:'.5rem', padding:'.75rem', borderTop:'1px solid var(--border)' }}>
              <button disabled={page===0} onClick={() => { setPage(p=>{const n=p-1; load(filters,n,showInactive); return n;})}} style={{ padding:'.3rem .7rem', borderRadius:6, background:'var(--bg2)', border:'1px solid var(--border)', color:'var(--text2)', cursor:'pointer', fontSize:'.8rem' }}>← Zurück</button>
              <span style={{ fontSize:'.8rem', color:'var(--text3)', padding:'.3rem .5rem' }}>{page+1} / {totalPages}</span>
              <button disabled={page>=totalPages-1} onClick={() => { setPage(p=>{const n=p+1; load(filters,n,showInactive); return n;})}} style={{ padding:'.3rem .7rem', borderRadius:6, background:'var(--bg2)', border:'1px solid var(--border)', color:'var(--text2)', cursor:'pointer', fontSize:'.8rem' }}>Weiter →</button>
            </div>
          )}
        </div>
      )}

      {showNewCustomer && <NewCustomerModal onClose={() => setShowNewCustomer(false)} onCreated={(c) => { setShowNewCustomer(false); load(filters, page, showInactive); }} />}

      {selected.size === 0 && !bulkBusy && (
        <div style={{ marginTop:'.75rem' }}>
          <button onClick={selectNonLex} style={{ padding:'.3rem .65rem', borderRadius:6, fontSize:'.75rem', cursor:'pointer', background:'var(--bg2)', border:'1px solid var(--border)', color:'var(--text3)' }}>Alle ohne LEX auswählen</button>
          <button onClick={() => setShowNewCustomer(true)} style={{ padding:'.3rem .75rem', borderRadius:6, fontSize:'.75rem', cursor:'pointer', background:'var(--blue)', border:'none', color:'#fff', fontWeight:600 }}>+ Neuer Kunde</button>
        </div>
      )}
    </div>
  );
}
