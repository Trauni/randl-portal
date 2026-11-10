import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import MailSignature from './MailSignature';

const fmt = d => d ? new Date(d).toLocaleDateString('de-DE',{day:'2-digit',month:'long',year:'numeric'}) : '–';
const Field = ({label,children}) => (
  <div className="pf-field"><label className="pf-field-label">{label}</label>{children}</div>
);
const RO = ({value}) => <span className="pf-readonly">{value||'–'}</span>;

export default function Profile() {
  const { user } = useAuth();
  const [profile,setProfile]=useState(null);
  const [form,setForm]=useState({});
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');
  const [editMode,setEditMode]=useState(false);
  const authName=user?.name||user?.preferred_username||'';
  const authEmail=user?.email||'';
  const groups=user?.groups||[];
  const roleLabel=['Geschäftsführung','Backoffice'].some(g=>groups.includes(g))?'Administrator':groups.includes('Gashandel')?'Gashandel':groups.includes('webeditor')?'Web Editor':'Mitarbeiter';
  const displayName=profile?.display_name||authName;
  const sigInitial=useMemo(()=>profile?{name:displayName,role:profile.position_title,mobil:profile.phone_mobile,tel:profile.phone,mail:profile.email||authEmail}:null,[profile,displayName,authEmail]);
  const initials=displayName.split(' ').filter(Boolean).slice(0,2).map(s=>s[0].toUpperCase()).join('');

  const load=useCallback(async()=>{
    try{setLoading(true);const r=await fetch('/api/profile');if(!r.ok)throw new Error('Fehler');
    const d=await r.json();setProfile(d);
    setForm({display_name:d.display_name||'',phone:d.phone||'',phone_mobile:d.phone_mobile||'',
             email:d.email||authEmail,address_street:d.address_street||'',address_zip:d.address_zip||'',
             address_city:d.address_city||'',address_country:d.address_country||'Deutschland'});
    }catch(e){setError(e.message);}finally{setLoading(false);}
  },[authEmail]);
  useEffect(()=>{load();},[load]);

  const save=async()=>{
    setSaving(true);setError('');setSuccess('');
    try{const r=await fetch('/api/profile',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)});
    if(!r.ok){const e=await r.json();throw new Error(e.error||'Fehler');}
    const u=await r.json();setProfile(u);setEditMode(false);
    setSuccess('Profil gespeichert.');setTimeout(()=>setSuccess(''),3500);
    }catch(e){setError(e.message);}finally{setSaving(false);}
  };
  const [pauseBusy,setPauseBusy]=useState(false);
  const setzePause=async(an)=>{
    setPauseBusy(true);setError('');
    try{const r=await fetch('/api/profile',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({auto_pause_30:an})});
    if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.error||'Speichern fehlgeschlagen');}
    setProfile(await r.json());
    }catch(e){setError(e.message);}finally{setPauseBusy(false);}
  };
  const cancel=()=>{setEditMode(false);setError('');load();};
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));

  if(loading) return <div style={{display:'flex',gap:10,alignItems:'center',padding:40,color:'var(--text2)'}}><div className="spinner"/>Lade Profil…</div>;

  return (
    <div className="pf-root">
      <div className="pf-header">
        <div className="pf-avatar-large">{initials}</div>
        <div className="pf-header-info">
          <h1 className="pf-headline">{displayName}</h1>
          <div className="pf-meta-row">
            <span className="chip chip--role">{roleLabel}</span>
            {groups.map(g=><span key={g} className="chip chip--group">{g}</span>)}
          </div>
          {profile?.start_date&&<span className="pf-since">Dabei seit {fmt(profile.start_date)}</span>}
        </div>
        <div className="pf-actions">
          {!editMode?<button className="btn btn-primary" onClick={()=>setEditMode(true)}>Bearbeiten</button>:
          <><button className="btn btn-ghost" onClick={cancel} disabled={saving}>Abbrechen</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving?'Speichere…':'Speichern'}</button></>}
        </div>
      </div>
      {error&&<div className="alert alert--error">{error}</div>}
      {success&&<div className="alert alert--success">{success}</div>}
      <div className="pf-grid">
        <div className="card pf-card">
          <div className="pf-card-header"><h2 className="pf-card-title">Identität</h2></div>
          <div className="pf-fields">
            <Field label="Anzeigename (öffentlich)">
              {editMode?<><input className="pf-input" value={form.display_name} onChange={e=>set('display_name',e.target.value)} placeholder={authName}/>
              <span className="pf-hint">Leer lassen = Authentik-Name wird verwendet</span></>:<RO value={profile?.display_name||authName}/>}
            </Field>
            <Field label="Authentik-Benutzername"><RO value={user?.preferred_username}/></Field>
            <Field label="Vollständiger Name (Authentik)"><RO value={authName}/></Field>
            <Field label="Abteilung"><RO value={profile?.department}/></Field>
            <Field label="Position"><RO value={profile?.position_title}/></Field>
          </div>
        </div>
        <div className="card pf-card">
          <div className="pf-card-header"><h2 className="pf-card-title">Kontakt & E-Mail</h2></div>
          <div className="pf-fields">
            <Field label="E-Mail-Adresse">
              {editMode?<><input className="pf-input" type="email" value={form.email} onChange={e=>set('email',e.target.value)}/>
              <span className="pf-hint">Wird mit Authentik synchronisiert</span></>:<RO value={profile?.email||authEmail}/>}
            </Field>
            <Field label="Telefon (Büro)">
              {editMode?<input className="pf-input" type="tel" value={form.phone} onChange={e=>set('phone',e.target.value)} placeholder="+49 8053 …"/>:<RO value={profile?.phone}/>}
            </Field>
            <Field label="Mobiltelefon">
              {editMode?<input className="pf-input" type="tel" value={form.phone_mobile} onChange={e=>set('phone_mobile',e.target.value)} placeholder="+49 151 …"/>:<RO value={profile?.phone_mobile}/>}
            </Field>
          </div>
        </div>
        <div className="card pf-card">
          <div className="pf-card-header"><h2 className="pf-card-title">Postanschrift</h2></div>
          <div className="pf-fields">
            <Field label="Straße & Hausnummer">
              {editMode?<input className="pf-input" value={form.address_street} onChange={e=>set('address_street',e.target.value)} placeholder="Musterstraße 1"/>:<RO value={profile?.address_street}/>}
            </Field>
            <div className="pf-row2">
              <Field label="PLZ">
                {editMode?<input className="pf-input" value={form.address_zip} onChange={e=>set('address_zip',e.target.value)} placeholder="83075" maxLength={10}/>:<RO value={profile?.address_zip}/>}
              </Field>
              <Field label="Ort">
                {editMode?<input className="pf-input" value={form.address_city} onChange={e=>set('address_city',e.target.value)} placeholder="Bad Endorf"/>:<RO value={profile?.address_city}/>}
              </Field>
            </div>
            <Field label="Land">
              {editMode?<input className="pf-input" value={form.address_country} onChange={e=>set('address_country',e.target.value)}/>:<RO value={profile?.address_country||'Deutschland'}/>}
            </Field>
            {!editMode&&profile?.address_street&&(
              <div className="pf-addr-preview">
                <div>{profile.address_street}</div>
                <div>{[profile.address_zip,profile.address_city].filter(Boolean).join(' ')}</div>
                <div>{profile.address_country||'Deutschland'}</div>
              </div>
            )}
          </div>
        </div>
        <div className="card pf-card">
          <div className="pf-card-header"><h2 className="pf-card-title">Zeiterfassung</h2></div>
          <div className="pf-fields">
            <label style={{display:'flex',alignItems:'center',gap:8,color:'var(--text1)',fontSize:13,cursor:pauseBusy?'wait':'pointer'}}>
              <input type="checkbox" checked={Boolean(Number(profile?.auto_pause_30))} disabled={pauseBusy} onChange={e=>setzePause(e.target.checked)}/>
              Automatisch 30 Minuten Pause buchen
            </label>
            <span className="pf-hint">Das Pausenfeld bei „Zeit nachtragen“ ist dann mit 30 Minuten vorbelegt, und beim Ausstempeln werden bei mehr als 6 Stunden mindestens 30 Minuten Pause abgezogen. Wirkt sofort, ohne Bearbeiten-Knopf.</span>
          </div>
        </div>
        <div className="card pf-card">
          <div className="pf-card-header"><h2 className="pf-card-title">System</h2></div>
          <div className="pf-fields">
            <Field label="Mitarbeiter-ID"><RO value={profile?.id}/></Field>
            <Field label="Authentik UID"><span className="pf-mono">{profile?.authentik_uid?.substring(0,18)}…</span></Field>
            <Field label="Eintrittsdatum"><RO value={fmt(profile?.start_date)}/></Field>
            <Field label="Profil angelegt"><RO value={fmt(profile?.created_at)}/></Field>
            <Field label="Zuletzt geändert"><RO value={fmt(profile?.updated_at)}/></Field>
          </div>
        </div>
      </div>
      <MailSignature initial={sigInitial}/>
      <style>{`
        .pf-root{padding:18px;max-width:900px;}
        .pf-header{display:flex;align-items:center;gap:16px;margin-bottom:20px;padding:20px;background:var(--bg1);border:1px solid var(--border);border-radius:9px;}
        .pf-avatar-large{width:56px;height:56px;border-radius:50%;background:var(--r);color:#fff;font-size:18px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
        .pf-header-info{flex:1;}
        .pf-headline{font-size:18px;font-weight:700;color:var(--text1);margin:0 0 6px;}
        .pf-meta-row{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:5px;}
        .pf-since{font-size:12px;color:var(--text3);}
        .pf-actions{display:flex;gap:8px;}
        .chip{font-size:11px;font-weight:600;padding:2px 8px;border-radius:10px;}
        .chip--role{background:var(--r);color:#fff;}
        .chip--group{background:var(--bg3);color:var(--text2);border:1px solid var(--border);}
        .alert{padding:10px 14px;border-radius:7px;font-size:13px;margin-bottom:14px;}
        .alert--error{background:#3a1515;border:1px solid var(--red2);color:var(--red2);}
        .alert--success{background:#0e2e1e;border:1px solid var(--green);color:var(--green);}
        .pf-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
        @media(max-width:700px){.pf-grid{grid-template-columns:1fr;}}
        .card{background:var(--bg1);border:1px solid var(--border);border-radius:9px;}
        .pf-card{padding:16px;}
        .pf-card-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;}
        .pf-card-title{font-size:13px;font-weight:700;color:var(--text1);margin:0;}
        .pf-fields{display:flex;flex-direction:column;gap:12px;}
        .pf-row2{display:grid;grid-template-columns:100px 1fr;gap:8px;}
        .pf-field{display:flex;flex-direction:column;gap:4px;}
        .pf-field-label{font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;}
        .pf-readonly{font-size:13px;color:var(--text1);}
        .pf-mono{font-family:'DM Mono',monospace;font-size:12px;color:var(--text2);}
        .pf-hint{font-size:11px;color:var(--text3);}
        .pf-input{background:var(--bg2);border:1px solid var(--border);border-radius:7px;padding:7px 10px;color:var(--text1);font-size:13px;font-family:inherit;width:100%;box-sizing:border-box;transition:border-color .15s;}
        .pf-input:focus{outline:none;border-color:var(--r);}
        .pf-addr-preview{margin-top:4px;padding:10px 12px;background:var(--bg2);border-radius:7px;font-size:13px;color:var(--text2);line-height:1.6;border:1px dashed var(--border);}
        .btn{padding:7px 14px;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;border:none;font-family:inherit;transition:background .15s;}
        .btn-primary{background:var(--r);color:#fff;}
        .btn-primary:hover:not(:disabled){background:var(--r2);}
        .btn-primary:disabled{opacity:.5;}
        .btn-ghost{background:var(--bg2);color:var(--text2);border:1px solid var(--border);}
        .btn-ghost:hover{background:var(--bg3);color:var(--text1);}
        .spinner{width:18px;height:18px;border:2px solid var(--bg3);border-top-color:var(--r);border-radius:50%;animation:spin .6s linear infinite;}
        @keyframes spin{to{transform:rotate(360deg);}}
      `}</style>
    </div>
  );
}
