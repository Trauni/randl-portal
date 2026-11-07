import { useState, useEffect } from 'react';

const STATUS={pending:{label:'Ausstehend',color:'#e8a020',bg:'#2a2208'},approved:{label:'Genehmigt',color:'#2ebd7a',bg:'#0d2318'},rejected:{label:'Abgelehnt',color:'#e05050',bg:'#2a0e0e'},cancelled:{label:'Storniert',color:'#52576a',bg:'#1a1c1f'}};
// Gleitzeitkonto (#490): Minuten als +12:30 / −3:05
const fmtMin=m=>{const v=m>0?'+':m<0?'−':'';const a=Math.abs(Math.round(m));return `${v}${Math.floor(a/60)}:${String(a%60).padStart(2,'0')}`;};
const ART_LABEL={urlaub:'Urlaub',gleitzeitabbau:'Gleitzeitabbau'};
// Stundenweiser Gleitzeitabbau (#490): '12:00:00' -> '12:00'
const hhmm=t=>t?String(t).slice(0,5):'';
const zeitText=r=>r.abbau_von?`${hhmm(r.abbau_von)}–${hhmm(r.abbau_bis)} Uhr`:null;
const LEER={art:'urlaub',start_date:'',end_date:'',stundenweise:false,zeit_von:'',zeit_bis:'',reason:''};
const fmt=d=>d?new Date(d+'T00:00').toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric'}):'';
function Badge({status}){const s=STATUS[status]||STATUS.pending;return<span style={{display:'inline-flex',alignItems:'center',padding:'2px 9px',borderRadius:10,fontSize:11,fontWeight:700,color:s.color,background:s.bg,border:`1px solid ${s.color}44`}}>{s.label}</span>;}

import { useAuth } from '../../context/AuthContext';
export default function VacationRequest() {
  // user aus Context falls benötigt
  const [reqs,setReqs]=useState([]);
  const [loading,setLoading]=useState(true);
  const [submitting,setSubmitting]=useState(false);
  const [cancelling,setCancelling]=useState(null);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');
  const [showForm,setShowForm]=useState(false);
  const [cancelDlg,setCancelDlg]=useState(null);
  const [cancelReason,setCancelReason]=useState('');
  const [form,setForm]=useState(LEER);
  // Stundenweise nur beim Gleitzeitabbau an genau einem Tag
  const einTag=form.start_date&&(!form.end_date||form.end_date===form.start_date);
  const stunden=form.art==='gleitzeitabbau'&&form.stundenweise&&einTag;
  const zeitOk=!stunden||(form.zeit_von&&form.zeit_bis&&form.zeit_bis>form.zeit_von);
  const [konto,setKonto]=useState(null); // eigenes Gleitzeitkonto, null = keins aktiv
  useEffect(()=>{fetch('/api/vacation/gleitzeit').then(r=>r.ok?r.json():null).then(k=>setKonto(k&&k.aktiv?k:null)).catch(()=>{});},[]);

  const load=async()=>{try{setLoading(true);const r=await fetch('/api/vacation');if(!r.ok)throw new Error();setReqs(await r.json());}catch(e){setError('Laden fehlgeschlagen');}finally{setLoading(false);}};
  useEffect(()=>{load();},[]);

  // Arbeitstage vom Server: Mo–Fr ohne bayerische Feiertage (#490)
  const [preview,setPreview]=useState(null);
  useEffect(()=>{
    if(!form.start_date||!form.end_date||form.end_date<form.start_date||!zeitOk){setPreview(null);return;}
    let aktuell=true;
    const zeit=stunden?`&zeit_von=${form.zeit_von}&zeit_bis=${form.zeit_bis}`:'';
    fetch(`/api/vacation/arbeitstage?von=${form.start_date}&bis=${form.end_date}&art=${form.art}${zeit}`)
      .then(r=>r.ok?r.json():null).then(p=>{if(aktuell)setPreview(p);}).catch(()=>{if(aktuell)setPreview(null);});
    return()=>{aktuell=false;};
  },[form.start_date,form.end_date,form.art,stunden,form.zeit_von,form.zeit_bis,zeitOk]);

  const submit=async()=>{
    if(!form.start_date||!form.end_date){setError('Datum fehlt');return;}
    if(form.end_date<form.start_date){setError('Enddatum muss nach Startdatum liegen');return;}
    if(!zeitOk){setError('Uhrzeit bis muss nach von liegen');return;}
    setSubmitting(true);setError('');setSuccess('');
    const body={art:form.art,start_date:form.start_date,end_date:form.end_date,reason:form.reason,
      ...(stunden?{zeit_von:form.zeit_von,zeit_bis:form.zeit_bis}:{})};
    try{const r=await fetch('/api/vacation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(!r.ok){const e=await r.json();throw new Error(e.error);}
    setSuccess(form.art==='gleitzeitabbau'?'Gleitzeitabbau beantragt.':'Urlaubsantrag eingereicht.');setShowForm(false);setForm(LEER);await load();setTimeout(()=>setSuccess(''),4000);
    }catch(e){setError(e.message);}finally{setSubmitting(false);}
  };

  const doCancel=async()=>{
    if(!cancelDlg)return;setCancelling(cancelDlg.id);
    try{const r=await fetch(`/api/vacation/${cancelDlg.id}/cancel`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({reason:cancelReason})});
    if(!r.ok){const e=await r.json();throw new Error(e.error);}
    setSuccess('Urlaub storniert.');setCancelDlg(null);await load();setTimeout(()=>setSuccess(''),4000);
    }catch(e){setError(e.message);}finally{setCancelling(null);}
  };

  const d=preview?preview.tage:null;
  return (
    <div className="vr-root">
      <div className="vr-hdr"><div><h1 className="vr-title">Mein Urlaub</h1><p className="vr-sub">Anträge stellen und verwalten</p></div>
        <button className="btn btn-primary" onClick={()=>{setShowForm(v=>!v);setError('');}}>
          {showForm?'Abbrechen':'+ Antrag stellen'}
        </button>
      </div>
      {error&&<div className="alert alert--error">{error}</div>}
      {success&&<div className="alert alert--success">{success}</div>}
      {showForm&&(
        <div className="card vr-form">
          <h2 className="vr-sec-title">{form.art==='gleitzeitabbau'?'Neuer Gleitzeitabbau':'Neuer Urlaubsantrag'}</h2>
          {konto&&(
            <div className="vr-ff" style={{marginBottom:12}}><label className="vr-lbl">Art</label>
              <div style={{display:'flex',gap:6}}>
                {Object.entries(ART_LABEL).map(([k,l])=>(
                  <button key={k} type="button" className={`btn ${form.art===k?'btn-primary':'btn-ghost'}`} onClick={()=>setForm(f=>({...f,art:k}))}>{l}</button>
                ))}
              </div>
              {form.art==='gleitzeitabbau'&&<div className="vr-note" style={{marginTop:6}}>Gleitzeitkonto: <strong>{fmtMin(konto.minuten)} h</strong> · {stunden?'abgebucht wird die Dauer, höchstens das Tages-Soll. Den Rest des Tages normal stempeln.':'pro Tag wird das vereinbarte Tages-Soll abgebucht, kein Urlaubstag.'}</div>}
            </div>
          )}
          <div className="vr-form-grid">
            <div className="vr-ff"><label className="vr-lbl">Von</label><input type="date" className="vr-inp" value={form.start_date} onChange={e=>{const v=e.target.value;setForm(f=>({...f,start_date:v,...(f.stundenweise?{end_date:v}:{})}));}}/></div>
            <div className="vr-ff"><label className="vr-lbl">Bis (einschließlich)</label><input type="date" className="vr-inp" value={form.end_date} min={form.start_date} onChange={e=>setForm(f=>({...f,end_date:e.target.value}))}/></div>
            {d!==null&&!stunden&&<div className="vr-days-preview"><span className="vr-days-num">{d}</span><span className="vr-days-lbl">Arbeitstag{d!==1?'e':''}{preview.feiertage.length>0&&` · ohne ${preview.feiertage.map(f=>f.name).join(', ')}`}</span></div>}
            {stunden&&preview?.gleitzeit&&<div className="vr-days-preview"><span className="vr-days-num">{fmtMin(preview.gleitzeit.minuten).replace('+','')}</span><span className="vr-days-lbl">Stunden</span></div>}
          </div>
          {form.art==='gleitzeitabbau'&&(
            <div style={{marginTop:12}}>
              <div style={{display:'flex',gap:6}}>
                <button type="button" className={`btn ${!form.stundenweise?'btn-primary':'btn-ghost'}`} onClick={()=>setForm(f=>({...f,stundenweise:false}))}>Ganzer Tag</button>
                <button type="button" className={`btn ${form.stundenweise?'btn-primary':'btn-ghost'}`} disabled={!einTag} title={einTag?'':'Nur für einen einzelnen Tag'} onClick={()=>setForm(f=>({...f,stundenweise:true,end_date:f.start_date}))}>Stundenweise</button>
              </div>
              {form.stundenweise&&!einTag&&<div className="vr-note vr-note-red" style={{marginTop:6}}>Stundenweise geht nur für einen einzelnen Tag (Von = Bis).</div>}
              {stunden&&(
                <div className="vr-form-grid" style={{marginTop:10,gridTemplateColumns:'1fr 1fr'}}>
                  <div className="vr-ff"><label className="vr-lbl">Frei ab</label><input type="time" step="300" className="vr-inp" value={form.zeit_von} onChange={e=>setForm(f=>({...f,zeit_von:e.target.value}))}/></div>
                  <div className="vr-ff"><label className="vr-lbl">Frei bis</label><input type="time" step="300" className="vr-inp" value={form.zeit_bis} onChange={e=>setForm(f=>({...f,zeit_bis:e.target.value}))}/></div>
                </div>
              )}
            </div>
          )}
          {preview?.gleitzeit&&(
            <div className={`vr-note${preview.gleitzeit.danach<0?' vr-note-red':''}`} style={{marginTop:10}}>
              Abbau <strong>{fmtMin(-preview.gleitzeit.minuten)} h</strong>
              {preview.gleitzeit.geplant>0&&<> · bereits geplant {fmtMin(-preview.gleitzeit.geplant)} h</>}
              {' · '}Konto voraussichtlich <strong>{fmtMin(preview.gleitzeit.stand)} → {fmtMin(preview.gleitzeit.danach)} h</strong>
              {preview.gleitzeit.danach<0&&' (danach im Minus)'}
            </div>
          )}
          <div className="vr-ff" style={{marginTop:12}}><label className="vr-lbl">Anmerkung (optional)</label>
            <textarea className="vr-inp vr-ta" value={form.reason} onChange={e=>setForm(f=>({...f,reason:e.target.value}))} placeholder="z.B. Familienurlaub…" rows={2}/>
          </div>
          <div style={{display:'flex',justifyContent:'flex-end',marginTop:14}}>
            <button className="btn btn-primary" onClick={submit} disabled={submitting}>{submitting?'Wird eingereicht…':'Antrag einreichen'}</button>
          </div>
        </div>
      )}
      {loading?<div className="vr-loading"><div className="spinner"/>Lade Anträge…</div>
      :reqs.length===0?<div className="vr-empty">Noch keine Urlaubsanträge vorhanden.</div>
      :<div className="vr-list">
        {reqs.map(req=>(
          <div key={req.id} className={`card vr-item${req.status==='cancelled'?' vr-item--cancelled':''}`}>
            <div className="vr-item-main">
              <div className="vr-item-dates"><span className="vr-date-range">{fmt(req.start_date)} – {fmt(req.end_date)}</span><span className="vr-days-info">{req.art==='gleitzeitabbau'&&<strong>Gleitzeitabbau · </strong>}{zeitText(req)||`${req.days_count} Arbeitstag${req.days_count!==1?'e':''}`}</span></div>
              <div className="vr-item-meta"><Badge status={req.status}/><span className="vr-id">#{req.id}</span></div>
            </div>
            {req.reason&&<div className="vr-note"><span className="vr-note-lbl">Anmerkung:</span> {req.reason}</div>}
            {req.status==='approved'&&req.approver_display&&<div className="vr-note vr-note-green">✓ Genehmigt von {req.approver_display}</div>}
            {req.status==='rejected'&&req.note&&<div className="vr-note vr-note-red">✗ Abgelehnt: {req.note}</div>}
            {req.status==='cancelled'&&<div className="vr-note vr-note-grey">Storniert{req.cancel_reason?`: ${req.cancel_reason}`:''}{req.canceller_display?` (von ${req.canceller_display})`:''}</div>}
            {['pending','approved'].includes(req.status)&&(
              <div className="vr-item-actions"><button className="btn btn-danger-outline" onClick={()=>{setCancelDlg(req);setCancelReason('');}}>Stornieren</button></div>
            )}
          </div>
        ))}
      </div>}
      {cancelDlg&&(
        <div className="vr-overlay" onClick={e=>e.target===e.currentTarget&&setCancelDlg(null)}>
          <div className="vr-dialog">
            <div className="vr-dlg-hdr"><h2 className="vr-dlg-title">{cancelDlg.art==='gleitzeitabbau'?'Gleitzeitabbau':'Urlaub'} stornieren</h2><button className="vr-dlg-close" onClick={()=>setCancelDlg(null)}>✕</button></div>
            <div className="vr-dlg-body">
              <p style={{color:'var(--text2)',fontSize:13,margin:'0 0 14px'}}>
                {fmt(cancelDlg.start_date)} – {fmt(cancelDlg.end_date)} ({zeitText(cancelDlg)||`${cancelDlg.days_count} Tage`}) stornieren?
              </p>
              {cancelDlg.status==='approved'&&<div className="alert alert--warn" style={{marginBottom:12}}>⚠ {cancelDlg.art==='gleitzeitabbau'?'Dieser Gleitzeitabbau':'Dieser Urlaub'} ist bereits genehmigt.</div>}
              <label className="vr-lbl" style={{display:'block',marginBottom:4}}>Grund (optional)</label>
              <textarea className="vr-inp vr-ta" value={cancelReason} onChange={e=>setCancelReason(e.target.value)} placeholder="Stornierungsgrund…" rows={2}/>
            </div>
            <div className="vr-dlg-footer">
              <button className="btn btn-ghost" onClick={()=>setCancelDlg(null)}>Abbrechen</button>
              <button className="btn btn-danger" onClick={doCancel} disabled={!!cancelling}>{cancelling===cancelDlg.id?'Storniere…':'Stornieren bestätigen'}</button>
            </div>
          </div>
        </div>
      )}
      <style>{`
        .vr-root{padding:18px;max-width:760px;}
        .vr-hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;}
        .vr-title{font-size:20px;font-weight:700;color:var(--text1);margin:0 0 4px;}
        .vr-sub{font-size:13px;color:var(--text3);margin:0;}
        .vr-sec-title{font-size:14px;font-weight:700;color:var(--text1);margin:0 0 14px;}
        .vr-loading{display:flex;gap:10px;align-items:center;color:var(--text2);padding:30px 0;}
        .vr-empty{color:var(--text3);font-size:13px;padding:30px 0;}
        .alert{padding:10px 14px;border-radius:7px;font-size:13px;margin-bottom:14px;}
        .alert--error{background:#3a1515;border:1px solid var(--red2);color:var(--red2);}
        .alert--success{background:#0e2e1e;border:1px solid var(--green);color:var(--green);}
        .alert--warn{background:#2a1e08;border:1px solid var(--amber);color:var(--amber);}
        .card{background:var(--bg1);border:1px solid var(--border);border-radius:9px;}
        .vr-form{padding:18px;margin-bottom:18px;}
        .vr-form-grid{display:grid;grid-template-columns:1fr 1fr auto;gap:12px;align-items:end;}
        .vr-ff{display:flex;flex-direction:column;gap:5px;}
        .vr-lbl{font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;}
        .vr-inp{background:var(--bg2);border:1px solid var(--border);border-radius:7px;padding:7px 10px;color:var(--text1);font-size:13px;font-family:inherit;width:100%;box-sizing:border-box;}
        .vr-inp:focus{outline:none;border-color:var(--r);}
        .vr-ta{resize:vertical;min-height:58px;}
        .vr-days-preview{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px 14px;background:var(--bg2);border:1px solid var(--border);border-radius:7px;}
        .vr-days-num{font-size:22px;font-weight:700;color:var(--r);font-family:'DM Mono',monospace;line-height:1;}
        .vr-days-lbl{font-size:10px;color:var(--text3);}
        .vr-list{display:flex;flex-direction:column;gap:10px;}
        .vr-item{padding:14px 16px;}
        .vr-item--cancelled{opacity:.65;}
        .vr-item-main{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;}
        .vr-item-dates{display:flex;flex-direction:column;gap:3px;}
        .vr-date-range{font-size:14px;font-weight:600;color:var(--text1);}
        .vr-days-info{font-size:12px;color:var(--text3);}
        .vr-item-meta{display:flex;align-items:center;gap:10px;}
        .vr-id{font-size:11px;color:var(--text3);font-family:'DM Mono',monospace;}
        .vr-note{font-size:12px;color:var(--text2);margin-top:4px;}
        .vr-note-lbl{font-weight:600;color:var(--text3);}
        .vr-note-green{color:var(--green);}
        .vr-note-red{color:var(--red2);}
        .vr-note-grey{color:var(--text3);}
        .vr-item-actions{margin-top:10px;padding-top:10px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;}
        .btn{padding:7px 14px;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;border:none;font-family:inherit;transition:background .15s;}
        .btn-primary{background:var(--r);color:#fff;}
        .btn-primary:hover:not(:disabled){background:var(--r2);}
        .btn-primary:disabled{opacity:.5;}
        .btn-ghost{background:var(--bg2);color:var(--text2);border:1px solid var(--border);}
        .btn-ghost:hover{background:var(--bg3);color:var(--text1);}
        .btn-danger{background:#7a1515;color:#fff;border:1px solid var(--red2);}
        .btn-danger:hover:not(:disabled){background:#9a1b1b;}
        .btn-danger:disabled{opacity:.5;}
        .btn-danger-outline{background:transparent;color:var(--red2);border:1px solid var(--red2);font-size:12px;padding:5px 11px;}
        .btn-danger-outline:hover{background:#3a1515;}
        .vr-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100;}
        .vr-dialog{background:var(--bg1);border:1px solid var(--border);border-radius:12px;width:420px;max-width:92vw;box-shadow:0 20px 60px rgba(0,0,0,.5);}
        .vr-dlg-hdr{display:flex;justify-content:space-between;align-items:center;padding:16px 18px;border-bottom:1px solid var(--border);}
        .vr-dlg-title{font-size:15px;font-weight:700;color:var(--text1);margin:0;}
        .vr-dlg-close{background:none;border:none;color:var(--text3);font-size:16px;cursor:pointer;padding:2px 6px;border-radius:5px;}
        .vr-dlg-close:hover{color:var(--text1);background:var(--bg2);}
        .vr-dlg-body{padding:18px;}
        .vr-dlg-footer{display:flex;justify-content:flex-end;gap:8px;padding:14px 18px;border-top:1px solid var(--border);}
        .spinner{width:16px;height:16px;border:2px solid var(--bg3);border-top-color:var(--r);border-radius:50%;animation:spin .6s linear infinite;}
        @keyframes spin{to{transform:rotate(360deg);}}
      `}</style>
    </div>
  );
}
