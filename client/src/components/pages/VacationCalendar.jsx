// client/src/components/pages/VacationCalendar.jsx
import { useState, useEffect, useCallback } from 'react';

const STATUS={pending:{label:'Ausstehend',color:'#e8a020',bg:'#2a2208',border:'#e8a02044'},approved:{label:'Genehmigt',color:'#2ebd7a',bg:'#0d2318',border:'#2ebd7a44'},rejected:{label:'Abgelehnt',color:'#e05050',bg:'#2a0e0e',border:'#e0505044'},cancelled:{label:'Storniert',color:'#52576a',bg:'#1a1c1f',border:'#52576a44'}};
const MONTHS=['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
const fmt=d=>d?new Date(d+'T00:00').toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric'}):'';
const fmtS=d=>d?new Date(d+'T00:00').toLocaleDateString('de-DE',{day:'2-digit',month:'short'}):'';
function Badge({status}){const s=STATUS[status]||STATUS.pending;return<span style={{padding:'2px 8px',borderRadius:10,fontSize:11,fontWeight:700,color:s.color,background:s.bg,border:`1px solid ${s.border}`,whiteSpace:'nowrap'}}>{s.label}</span>;}

export default function VacationCalendar() {
  const [view,setView]=useState('timeline');
  const [all,setAll]=useState([]);
  const [tl,setTl]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');
  const [actId,setActId]=useState(null);
  const [note,setNote]=useState('');
  const [cancelDlg,setCancelDlg]=useState(null);
  const [cancelR,setCancelR]=useState('');
  const now=new Date();
  const [tlY,setTlY]=useState(now.getFullYear());
  const [tlM,setTlM]=useState(now.getMonth());
  const VM=4;

  const loadAll=useCallback(async()=>{
    try{setLoading(true);const r=await fetch('/api/vacation/all');if(!r.ok)throw new Error();setAll(await r.json());}
    catch{setError('Laden fehlgeschlagen');}finally{setLoading(false);}
  },[]);

  const loadTl=useCallback(async()=>{
    const from=new Date(tlY,tlM,1).toISOString().split('T')[0];
    const lm=(tlM+VM-1)%12,ly=tlY+Math.floor((tlM+VM-1)/12);
    const to=new Date(ly,lm+1,0).toISOString().split('T')[0];
    try{const r=await fetch(`/api/vacation/timeline?from=${from}&to=${to}`);if(!r.ok)throw new Error();setTl(await r.json());}catch{}
  },[tlY,tlM]);

  useEffect(()=>{loadAll();},[loadAll]);
  useEffect(()=>{if(view==='timeline')loadTl();},[view,loadTl]);

  const doAction=async(id,action)=>{
    setActId(id);setError('');setSuccess('');
    try{const r=await fetch(`/api/vacation/${id}/${action}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({note})});
    if(!r.ok){const e=await r.json();throw new Error(e.error);}
    setSuccess(action==='approve'?'Genehmigt.':'Abgelehnt.');setNote('');
    await loadAll();if(view==='timeline')await loadTl();setTimeout(()=>setSuccess(''),4000);
    }catch(e){setError(e.message);}finally{setActId(null);}
  };

  const doCancel=async()=>{
    if(!cancelDlg)return;setActId(cancelDlg.id);
    try{const r=await fetch(`/api/vacation/${cancelDlg.id}/cancel`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({reason:cancelR})});
    if(!r.ok){const e=await r.json();throw new Error(e.error);}
    setSuccess('Storniert.');setCancelDlg(null);
    await loadAll();if(view==='timeline')await loadTl();setTimeout(()=>setSuccess(''),4000);
    }catch(e){setError(e.message);}finally{setActId(null);}
  };

  const tlPrev=()=>{if(tlM===0){setTlY(y=>y-1);setTlM(11);}else setTlM(m=>m-1);};
  const tlNext=()=>{if(tlM===11){setTlY(y=>y+1);setTlM(0);}else setTlM(m=>m+1);};
  const pending=all.filter(r=>r.status==='pending');

  return(
    <div className="vc-root">
      <div className="vc-hdr">
        <div><h1 className="vc-title">Urlaubskalender</h1>
          <p className="vc-sub">{pending.length>0?<span className="vc-badge-p">{pending.length} offene{pending.length!==1?' Anträge':'r Antrag'}</span>:'Keine offenen Anträge'}</p>
        </div>
        <div className="vc-tabs">
          <button className={`vc-tab${view==='timeline'?' vc-tab--on':''}`} onClick={()=>setView('timeline')}>Timeline</button>
          <button className={`vc-tab${view==='list'?' vc-tab--on':''}`} onClick={()=>setView('list')}>Antragsliste</button>
        </div>
      </div>
      {error&&<div className="alert alert--error">{error}</div>}
      {success&&<div className="alert alert--success">{success}</div>}
      {loading?<div className="vc-loading"><div className="spinner"/>Lade…</div>
      :view==='timeline'
        ?<TlView tl={tl} tlY={tlY} tlM={tlM} VM={VM} onPrev={tlPrev} onNext={tlNext} onToday={()=>{setTlY(now.getFullYear());setTlM(now.getMonth());}} onCancel={r=>{setCancelDlg(r);setCancelR('');}}/>
        :<ListView all={all} actId={actId} note={note} setNote={setNote} onApprove={id=>doAction(id,'approve')} onReject={id=>doAction(id,'reject')} onCancel={r=>{setCancelDlg(r);setCancelR('');}}/>
      }
      {cancelDlg&&(
        <div className="vc-overlay" onClick={e=>e.target===e.currentTarget&&setCancelDlg(null)}>
          <div className="vc-dialog">
            <div className="vc-dlg-hdr"><h2 className="vc-dlg-title">{cancelDlg.status==='pending'?'Urlaubsantrag':'Urlaub stornieren'}</h2><button className="vc-dlg-x" onClick={()=>setCancelDlg(null)}>✕</button></div>
            <div className="vc-dlg-body">
              <p style={{color:'var(--text2)',fontSize:13,margin:'0 0 14px'}}>
                <strong style={{color:'var(--text1)'}}>{cancelDlg.emp_display||cancelDlg.emp_full}</strong>: {fmt(cancelDlg.start_date)} – {fmt(cancelDlg.end_date)} ({cancelDlg.art==='gleitzeitabbau'?'Gleitzeitabbau, ':''}{cancelDlg.days_count}T)
              </p>
              {cancelDlg.status==='approved'&&<div className="alert alert--warn" style={{marginBottom:12}}>⚠ Bereits genehmigter Urlaub</div>}
              {cancelDlg.status==='pending'&&<div className="alert alert--warn" style={{marginBottom:12}}>⚠ Noch nicht genehmigt</div>}
              <label className="vc-lbl" style={{display:'block',marginBottom:4}}>Stornierungsgrund</label>
              <textarea className="vc-input vc-ta" value={cancelR} onChange={e=>setCancelR(e.target.value)} placeholder="Grund…" rows={2}/>
            </div>
            <div className="vc-dlg-footer">
              <button className="btn btn-ghost" onClick={()=>setCancelDlg(null)}>Abbrechen</button>
              {cancelDlg.status==='pending'&&<button className="btn btn-approve" onClick={async()=>{await doAction(cancelDlg.id,'approve');setCancelDlg(null);}} disabled={!!actId}>{actId===cancelDlg.id?'…':'✓ Genehmigen'}</button>}
              <button className="btn btn-danger" onClick={doCancel} disabled={!!actId}>{actId===cancelDlg.id?'Storniere…':'Stornieren'}</button>
            </div>
          </div>
        </div>
      )}
      <Styles/>
    </div>
  );
}

function TlView({tl,tlY,tlM,VM,onPrev,onNext,onToday,onCancel}){
  if(!tl)return<div className="vc-empty">Keine Timeline-Daten</div>;
  const {employees,requests}=tl;
  const months=[];
  for(let i=0;i<VM;i++){const m=(tlM+i)%12,y=tlY+Math.floor((tlM+i)/12),days=new Date(y,m+1,0).getDate();months.push({y,m,days,label:`${MONTHS[m]} ${y}`});}
  const total=months.reduce((s,m)=>s+m.days,0);
  const ws=new Date(months[0].y,months[0].m,1);
  const we=new Date(months[months.length-1].y,months[months.length-1].m,months[months.length-1].days);
  const geo=(s,e)=>{
    const cs=new Date(s+'T00:00')<ws?ws:new Date(s+'T00:00');
    const ce=new Date(e+'T00:00')>we?we:new Date(e+'T00:00');
    const sd=Math.round((cs-ws)/86400000),ed=Math.round((ce-ws)/86400000)+1;
    return{left:`${(sd/total)*100}%`,width:`${Math.max((ed-sd)/total*100,0.3)}%`};
  };
  const now=new Date();
  const todayOff=(now>=ws&&now<=we)?`${(Math.round((now-ws)/86400000)/total)*100}%`:null;
  const byEmp={};requests.forEach(r=>{if(!byEmp[r.emp_id])byEmp[r.emp_id]=[];byEmp[r.emp_id].push(r);});
  const sorted=[...employees].sort((a,b)=>(a.department||'').localeCompare(b.department||'')||(a.name||'').localeCompare(b.name||''));
  const LW=140;
  return(
    <div>
      <div className="tl-nav">
        <button className="btn btn-ghost" onClick={onPrev}>← Zurück</button>
        <button className="btn btn-ghost" onClick={onToday}>Heute</button>
        <span className="tl-nav-lbl">{MONTHS[tlM]} {tlY} – {months[months.length-1].label}</span>
        <button className="btn btn-ghost" onClick={onNext}>Weiter →</button>
      </div>
      {employees.length===0?<div className="vc-empty">Keine Urlaube im Zeitraum</div>:(
        <div className="card tl-wrap">
          <div className="tl-scroll">
            <div className="tl-mhdr" style={{paddingLeft:LW}}>
              {months.map((m,i)=><div key={i} className="tl-mhdr-cell" style={{width:`${(m.days/total)*100}%`}}>{m.label}</div>)}
            </div>
            {sorted.map(emp=>{
              const vs=byEmp[emp.id]||[];
              return(
                <div key={emp.id} className="tl-row">
                  <div className="tl-name" style={{width:LW,flexShrink:0}}><span className="tl-emp-name" title={emp.name}>{emp.name}</span></div>
                  <div style={{position:'relative',flex:1,height:'100%'}}>
                    {months.map((m,mi)=>{
                      const db=months.slice(0,mi).reduce((s,mm)=>s+mm.days,0);
                      return Array.from({length:m.days},(_,d)=>{
                        const date=new Date(m.y,m.m,d+1);
                        const isWe=date.getDay()===0||date.getDay()===6;
                        if(!isWe)return null;
                        return<div key={`${mi}-${d}`} style={{position:'absolute',left:`${((db+d)/total)*100}%`,width:`${(1/total)*100}%`,top:0,bottom:0,background:'rgba(255,255,255,0.02)'}}/>;
                      });
                    })}
                    {todayOff&&<div style={{position:'absolute',left:todayOff,top:0,bottom:0,width:1,background:'var(--r)',opacity:.8,zIndex:5}}/>}
                    {vs.filter(v=>v.status==='pending'||v.status==='approved').map(v=>{
                      const g=geo(v.start_date,v.end_date);
                      const s=STATUS[v.status]||STATUS.pending;
                      return<div key={v.id} title={`${v.art==='gleitzeitabbau'?'Gleitzeitabbau · ':''}${fmtS(v.start_date)}–${fmtS(v.end_date)} · ${v.days_count}T · ${s.label}${v.reason?` · ${v.reason}`:''} · Klicken für Details`}
                        onClick={()=>onCancel({...v, emp_display:v.emp_name})}
                        style={{position:'absolute',left:g.left,width:g.width,top:'8%',height:'84%',background:s.color+'33',border:`1.5px solid ${s.color}`,borderRadius:4,display:'flex',alignItems:'center',paddingLeft:4,overflow:'hidden',cursor:'pointer',zIndex:3}}>
                        <span style={{fontSize:9,fontWeight:700,color:s.color,whiteSpace:'nowrap'}}>{v.art==='gleitzeitabbau'?'GZ ':''}{v.days_count}T</span>
                      </div>;
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div className="tl-legend">
        {Object.entries(STATUS).map(([k,s])=>(
          <div key={k} className="tl-legend-item">
            <div style={{width:12,height:12,borderRadius:3,background:s.color+'33',border:`1.5px solid ${s.color}`,flexShrink:0}}/>
            <span>{s.label}</span>
          </div>
        ))}
        <div className="tl-legend-item"><div style={{width:2,height:14,background:'var(--r)',borderRadius:1,flexShrink:0}}/><span>Heute</span></div>
      </div>
    </div>
  );
}

function ListView({all,actId,note,setNote,onApprove,onReject,onCancel}){
  const [filter,setFilter]=useState('all');
  const [expand,setExpand]=useState(null);
  const filtered=filter==='all'?all:all.filter(r=>r.status===filter);
  return(
    <div>
      <div className="vc-filters">
        {['all','pending','approved','rejected','cancelled'].map(f=>(
          <button key={f} className={`vc-fb${filter===f?' vc-fb--on':''}`} onClick={()=>setFilter(f)}>
            {f==='all'?'Alle':STATUS[f]?.label}
            <span className="vc-fc">{f==='all'?all.length:all.filter(r=>r.status===f).length}</span>
          </button>
        ))}
      </div>
      {filtered.length===0?<div className="vc-empty">Keine Einträge</div>:(
        <div className="vc-list">
          {filtered.map(req=>{
            const on=expand===req.id;
            const eName=req.emp_display||req.emp_full||'–';
            return(
              <div key={req.id} className="card vc-item">
                <div className="vc-item-top" onClick={()=>setExpand(on?null:req.id)}>
                  <div className="vc-item-left">
                    <div className="vc-emp-av">{eName.split(' ').slice(0,2).map(s=>s[0]).join('')}</div>
                    <div className="vc-item-info"><span className="vc-emp-name">{eName}</span>{req.emp_department&&<span className="vc-emp-dept">{req.emp_department}</span>}</div>
                  </div>
                  <div className="vc-item-center"><span className="vc-dates">{fmt(req.start_date)} – {fmt(req.end_date)}</span><span className="vc-days">{req.art==='gleitzeitabbau'&&<strong>Gleitzeitabbau · </strong>}{req.days_count} Arbeitstag{req.days_count!==1?'e':''}</span></div>
                  <div className="vc-item-right"><Badge status={req.status}/><span className="vc-chev">{on?'▲':'▼'}</span></div>
                </div>
                {on&&(
                  <div className="vc-item-detail">
                    {req.reason&&<p className="vc-detail-note"><strong>Anmerkung:</strong> {req.reason}</p>}
                    {req.status==='approved'&&req.approver_display&&<p className="vc-detail-note vc-note-g">✓ Genehmigt von {req.approver_display}</p>}
                    {req.status==='cancelled'&&<p className="vc-detail-note vc-note-grey">Storniert{req.cancel_reason?`: ${req.cancel_reason}`:''}{ req.canceller_display?` (von ${req.canceller_display})`:''}</p>}
                    {req.status==='pending'&&(
                      <div className="vc-actions">
                        <input className="vc-input vc-note-input" placeholder="Anmerkung (optional)" value={note} onChange={e=>setNote(e.target.value)}/>
                        <button className="btn btn-approve" onClick={()=>onApprove(req.id)} disabled={!!actId}>{actId===req.id?'…':'✓ Genehmigen'}</button>
                        <button className="btn btn-reject"  onClick={()=>onReject(req.id)}  disabled={!!actId}>✗ Ablehnen</button>
                      </div>
                    )}
                    {['pending','approved'].includes(req.status)&&(
                      <div style={{marginTop:8}}><button className="btn btn-danger-outline btn--sm" onClick={()=>onCancel(req)}>Stornieren</button></div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Styles(){return<style>{`
  .vc-root{padding:18px;}
  .vc-hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;}
  .vc-title{font-size:20px;font-weight:700;color:var(--text1);margin:0 0 4px;}
  .vc-sub{font-size:13px;color:var(--text3);margin:0;}
  .vc-badge-p{color:var(--amber);font-weight:600;}
  .vc-loading{display:flex;gap:10px;align-items:center;color:var(--text2);padding:30px 0;}
  .vc-empty{color:var(--text3);font-size:13px;padding:30px 0;}
  .vc-tabs{display:flex;background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:2px;gap:2px;}
  .vc-tab{padding:5px 14px;border-radius:6px;border:none;background:transparent;color:var(--text2);font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .15s;}
  .vc-tab--on{background:var(--bg1);color:var(--text1);box-shadow:0 1px 3px rgba(0,0,0,.2);}
  .alert{padding:10px 14px;border-radius:7px;font-size:13px;margin-bottom:14px;}
  .alert--error{background:#3a1515;border:1px solid var(--red2);color:var(--red2);}
  .alert--success{background:#0e2e1e;border:1px solid var(--green);color:var(--green);}
  .alert--warn{background:#2a1e08;border:1px solid var(--amber);color:var(--amber);}
  .tl-nav{display:flex;align-items:center;gap:8px;margin-bottom:12px;}
  .tl-nav-lbl{flex:1;text-align:center;font-size:13px;font-weight:600;color:var(--text1);}
  .card{background:var(--bg1);border:1px solid var(--border);border-radius:9px;}
  .tl-wrap{overflow:hidden;}
  .tl-scroll{overflow-x:auto;}
  .tl-mhdr{display:flex;background:var(--bg2);border-bottom:1px solid var(--border);}
  .tl-mhdr-cell{padding:6px 8px;font-size:11px;font-weight:700;color:var(--text2);text-align:center;border-right:1px solid var(--border);flex-shrink:0;}
  .tl-row{display:flex;align-items:stretch;border-bottom:1px solid var(--border);height:38px;}
  .tl-row:last-child{border-bottom:none;}
  .tl-name{display:flex;align-items:center;padding:0 10px;border-right:1px solid var(--border);background:var(--bg1);}
  .tl-emp-name{font-size:12px;font-weight:500;color:var(--text1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px;}
  .tl-legend{display:flex;gap:14px;flex-wrap:wrap;margin-top:12px;}
  .tl-legend-item{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text3);}
  .vc-filters{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:14px;}
  .vc-fb{display:flex;align-items:center;gap:5px;padding:5px 12px;border-radius:7px;border:1px solid var(--border);background:var(--bg2);color:var(--text2);font-size:12px;font-weight:500;cursor:pointer;font-family:inherit;transition:all .15s;}
  .vc-fb:hover,.vc-fb--on{background:var(--bg3);color:var(--text1);}
  .vc-fc{background:var(--bg3);color:var(--text3);font-size:10px;padding:1px 5px;border-radius:8px;}
  .vc-list{display:flex;flex-direction:column;gap:8px;}
  .vc-item{padding:0;}
  .vc-item-top{display:flex;align-items:center;gap:12px;padding:12px 14px;cursor:pointer;border-radius:9px;transition:background .12s;}
  .vc-item-top:hover{background:var(--bg2);}
  .vc-item-left{display:flex;align-items:center;gap:9px;width:180px;flex-shrink:0;}
  .vc-emp-av{width:28px;height:28px;border-radius:50%;background:var(--bg3);border:1px solid var(--border);color:var(--text2);font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
  .vc-item-info{display:flex;flex-direction:column;gap:1px;min-width:0;}
  .vc-emp-name{font-size:13px;font-weight:600;color:var(--text1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .vc-emp-dept{font-size:11px;color:var(--text3);}
  .vc-item-center{flex:1;display:flex;flex-direction:column;gap:2px;}
  .vc-dates{font-size:13px;color:var(--text1);font-weight:500;}
  .vc-days{font-size:11px;color:var(--text3);}
  .vc-item-right{display:flex;align-items:center;gap:10px;}
  .vc-chev{font-size:9px;color:var(--text3);}
  .vc-item-detail{padding:10px 14px 14px;border-top:1px solid var(--border);}
  .vc-detail-note{font-size:12px;color:var(--text2);margin:0 0 8px;}
  .vc-note-g{color:var(--green);}
  .vc-note-grey{color:var(--text3);}
  .vc-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
  .vc-input{background:var(--bg2);border:1px solid var(--border);border-radius:7px;padding:6px 10px;color:var(--text1);font-size:12px;font-family:inherit;}
  .vc-input:focus{outline:none;border-color:var(--r);}
  .vc-ta{width:100%;resize:vertical;min-height:54px;box-sizing:border-box;}
  .vc-note-input{flex:1;min-width:160px;}
  .vc-lbl{font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;}
  .vc-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100;}
  .vc-dialog{background:var(--bg1);border:1px solid var(--border);border-radius:12px;width:420px;max-width:92vw;box-shadow:0 20px 60px rgba(0,0,0,.5);}
  .vc-dlg-hdr{display:flex;justify-content:space-between;align-items:center;padding:16px 18px;border-bottom:1px solid var(--border);}
  .vc-dlg-title{font-size:15px;font-weight:700;color:var(--text1);margin:0;}
  .vc-dlg-x{background:none;border:none;color:var(--text3);font-size:16px;cursor:pointer;padding:2px 6px;border-radius:5px;}
  .vc-dlg-x:hover{color:var(--text1);background:var(--bg2);}
  .vc-dlg-body{padding:18px;}
  .vc-dlg-footer{display:flex;justify-content:flex-end;gap:8px;padding:14px 18px;border-top:1px solid var(--border);}
  .btn{padding:6px 12px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;border:none;font-family:inherit;transition:background .15s;}
  .btn--sm{font-size:11px;padding:4px 9px;}
  .btn-approve{background:#0d3d22;color:var(--green);border:1px solid #2ebd7a44;}
  .btn-approve:hover:not(:disabled){background:#0f4d2a;}
  .btn-approve:disabled,.btn-reject:disabled{opacity:.5;}
  .btn-reject{background:#3a1515;color:var(--red2);border:1px solid #e0505044;}
  .btn-reject:hover:not(:disabled){background:#4a1a1a;}
  .btn-ghost{background:var(--bg2);color:var(--text2);border:1px solid var(--border);}
  .btn-ghost:hover{background:var(--bg3);color:var(--text1);}
  .btn-danger{background:#7a1515;color:#fff;border:1px solid var(--red2);}
  .btn-danger:hover:not(:disabled){background:#9a1b1b;}
  .btn-danger:disabled{opacity:.5;}
  .btn-danger-outline{background:transparent;color:var(--red2);border:1px solid var(--red2);}
  .btn-danger-outline:hover{background:#3a1515;}
  .spinner{width:16px;height:16px;border:2px solid var(--bg3);border-top-color:var(--r);border-radius:50%;animation:spin .6s linear infinite;}
  @keyframes spin{to{transform:rotate(360deg);}}
`}</style>;}
