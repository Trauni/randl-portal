import { useState, useEffect, useRef } from 'react';

const STATUS = {
  offen:    { label: 'Offen',     color: '#e8a020', bg: '#2a2208' },
  erledigt: { label: 'Erledigt',  color: '#2ebd7a', bg: '#0d2318' },
};
function Badge({ status }) {
  const s = STATUS[status] || STATUS.offen;
  return <span style={{display:'inline-flex',alignItems:'center',padding:'2px 9px',borderRadius:10,fontSize:11,fontWeight:700,color:s.color,background:s.bg,border:`1px solid ${s.color}44`}}>{s.label}</span>;
}
const fmt = d => d ? new Date(d).toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric'}) : '';
const emptyPos = () => ({ stueckzahl: 1, bezeichnung: '', notiz: '' });

export default function Lieferantenauftrag() {
  const [auftraege, setAuftraege] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);

  // Lieferantensuche
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  const debounceRef = useRef(null);

  const [kopfhinweis, setKopfhinweis] = useState('');
  const [empfaenger, setEmpfaenger] = useState(['', '', '']); // Name, Straße, PLZ Ort
  const [positionen, setPositionen] = useState([emptyPos()]);

  const load = async () => {
    try {
      setLoading(true);
      const r = await fetch('/api/metallarbeiten/lieferantenauftraege');
      if (!r.ok) throw new Error();
      setAuftraege(await r.json());
    } catch { setError('Laden fehlgeschlagen'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/metallarbeiten/lieferanten?q=${encodeURIComponent(query)}`);
        setResults(r.ok ? await r.json() : []);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const pickVendor = (v) => {
    setSelected(v);
    setQuery(v.name);
    setResults([]);
    setEmpfaenger([
      v.name || '',
      v.address?.street || '',
      [v.address?.zip, v.address?.city].filter(Boolean).join(' '),
    ]);
  };

  const updatePos = (i, field, value) => {
    setPositionen(p => p.map((pos, idx) => idx === i ? { ...pos, [field]: value } : pos));
  };
  const addPos = () => setPositionen(p => [...p, emptyPos()]);
  const removePos = (i) => setPositionen(p => p.filter((_, idx) => idx !== i));

  const resetForm = () => {
    setSelected(null); setQuery(''); setResults([]);
    setKopfhinweis(''); setEmpfaenger(['', '', '']); setPositionen([emptyPos()]);
  };

  const submit = async () => {
    if (!selected) { setError('Bitte einen Lieferanten auswählen'); return; }
    const gueltigePos = positionen.filter(p => p.bezeichnung.trim());
    if (!gueltigePos.length) { setError('Mindestens eine Position mit Artikel erforderlich'); return; }
    setSubmitting(true); setError(''); setSuccess('');
    try {
      const r = await fetch('/api/metallarbeiten/lieferantenauftraege', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lieferant_lexware_id: selected.id,
          lieferant_name: selected.name,
          empfaenger_zeilen: empfaenger.filter(Boolean),
          kopfhinweis,
          positionen: gueltigePos,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Anlegen fehlgeschlagen');
      setSuccess(`Auftrag ${data.auftragsnummer} angelegt.`);
      setShowForm(false); resetForm(); await load();
      setTimeout(() => setSuccess(''), 5000);
    } catch (e) { setError(e.message); }
    finally { setSubmitting(false); }
  };

  const toggleStatus = async (id, newStatus) => {
    try {
      const r = await fetch(`/api/metallarbeiten/lieferantenauftraege/${id}/${newStatus}`, { method: 'PATCH' });
      if (!r.ok) throw new Error();
      await load();
    } catch { setError('Status konnte nicht geändert werden'); }
  };

  return (
    <div className="la-root">
      <div className="la-hdr">
        <div><h1 className="la-title">Lieferantenaufträge</h1><p className="la-sub">Maschinenbau — Bestellungen an Lieferanten</p></div>
        <button className="btn btn-primary" onClick={() => { setShowForm(v => !v); setError(''); }}>
          {showForm ? 'Abbrechen' : '+ Neuer Auftrag'}
        </button>
      </div>

      {error && <div className="alert alert--error">{error}</div>}
      {success && <div className="alert alert--success">{success}</div>}

      {showForm && (
        <div className="card la-form">
          <h2 className="la-sec-title">Lieferant</h2>
          <div className="la-vendor-search">
            <input
              className="la-inp"
              placeholder="Lieferant suchen…"
              value={query}
              onChange={e => { setQuery(e.target.value); setSelected(null); }}
            />
            {searching && <div className="la-search-hint">Suche…</div>}
            {results.length > 0 && (
              <div className="la-dropdown">
                {results.map(v => (
                  <div key={v.id} className="la-dropdown-item" onClick={() => pickVendor(v)}>
                    <span className="la-dropdown-name">{v.name}</span>
                    {v.address?.city && <span className="la-dropdown-city">{v.address.city}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {selected && (
            <div className="la-empfaenger">
              <label className="la-lbl">Empfänger (bei Bedarf anpassen)</label>
              {empfaenger.map((line, i) => (
                <input key={i} className="la-inp" value={line}
                  onChange={e => setEmpfaenger(arr => arr.map((l, idx) => idx === i ? e.target.value : l))} />
              ))}
            </div>
          )}

          <div className="la-ff" style={{ marginTop: 14 }}>
            <label className="la-lbl">Anweisungen / Sonderkonditionen (optional)</label>
            <textarea className="la-inp la-ta" rows={3} value={kopfhinweis}
              onChange={e => setKopfhinweis(e.target.value)}
              placeholder={'Arbeitsanweisung: Alle folgenden Teile verzinken in Blau (Fe/ZnB)\nSonderkondition: 48 Stunden Service'} />
          </div>

          <h2 className="la-sec-title" style={{ marginTop: 18 }}>Positionen</h2>
          <div className="la-pos-list">
            <div className="la-pos-row la-pos-row--head">
              <span>Stk</span><span>Artikel</span><span>Notiz</span><span/>
            </div>
            {positionen.map((pos, i) => (
              <div className="la-pos-row" key={i}>
                <input className="la-inp" type="number" min="1" value={pos.stueckzahl}
                  onChange={e => updatePos(i, 'stueckzahl', e.target.value)} />
                <input className="la-inp" value={pos.bezeichnung} placeholder="Artikelbezeichnung"
                  onChange={e => updatePos(i, 'bezeichnung', e.target.value)} />
                <input className="la-inp" value={pos.notiz} placeholder="Notiz (optional)"
                  onChange={e => updatePos(i, 'notiz', e.target.value)} />
                <button className="la-pos-remove" onClick={() => removePos(i)} disabled={positionen.length === 1} title="Zeile entfernen">✕</button>
              </div>
            ))}
          </div>
          <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={addPos}>+ Position</button>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
            <button className="btn btn-primary" onClick={submit} disabled={submitting}>
              {submitting ? 'Wird angelegt…' : 'Auftrag anlegen'}
            </button>
          </div>
        </div>
      )}

      {loading ? <div className="la-loading"><div className="spinner"/>Lade Aufträge…</div>
      : auftraege.length === 0 ? <div className="la-empty">Noch keine Lieferantenaufträge vorhanden.</div>
      : <div className="la-list">
        {auftraege.map(a => (
          <div key={a.id} className="card la-item">
            <div className="la-item-main">
              <div className="la-item-info">
                <span className="la-nr">{a.auftragsnummer}</span>
                <span className="la-lieferant">{a.lieferant_name}</span>
              </div>
              <div className="la-item-meta">
                <Badge status={a.status}/>
                <span className="la-date">{fmt(a.erstellt_am)}</span>
              </div>
            </div>
            <div className="la-item-actions">
              <a className="btn btn-ghost" href={`/api/metallarbeiten/lieferantenauftraege/${a.id}/pdf`} target="_blank" rel="noreferrer">PDF öffnen</a>
              {a.status === 'offen'
                ? <button className="btn btn-primary" onClick={() => toggleStatus(a.id, 'erledigt')}>Als erledigt markieren</button>
                : <button className="btn btn-ghost" onClick={() => toggleStatus(a.id, 'offen')}>Als offen markieren</button>}
            </div>
          </div>
        ))}
      </div>}

      <style>{`
        .la-root{padding:18px;max-width:860px;}
        .la-hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;}
        .la-title{font-size:20px;font-weight:700;color:var(--text1);margin:0 0 4px;}
        .la-sub{font-size:13px;color:var(--text3);margin:0;}
        .la-sec-title{font-size:14px;font-weight:700;color:var(--text1);margin:0 0 10px;}
        .la-loading{display:flex;gap:10px;align-items:center;color:var(--text2);padding:30px 0;}
        .la-empty{color:var(--text3);font-size:13px;padding:30px 0;}
        .alert{padding:10px 14px;border-radius:7px;font-size:13px;margin-bottom:14px;}
        .alert--error{background:#3a1515;border:1px solid var(--red2);color:var(--red2);}
        .alert--success{background:#0e2e1e;border:1px solid var(--green);color:var(--green);}
        .card{background:var(--bg1);border:1px solid var(--border);border-radius:9px;}
        .la-form{padding:18px;margin-bottom:18px;}
        .la-lbl{font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px;}
        .la-inp{background:var(--bg2);border:1px solid var(--border);border-radius:7px;padding:7px 10px;color:var(--text1);font-size:13px;font-family:inherit;width:100%;box-sizing:border-box;margin-bottom:6px;}
        .la-inp:focus{outline:none;border-color:var(--r);}
        .la-ta{resize:vertical;min-height:58px;}
        .la-vendor-search{position:relative;margin-bottom:4px;}
        .la-search-hint{font-size:11px;color:var(--text3);margin:-4px 0 6px;}
        .la-dropdown{position:absolute;top:100%;left:0;right:0;background:var(--bg2);border:1px solid var(--border);border-radius:7px;max-height:220px;overflow-y:auto;z-index:20;box-shadow:0 10px 30px rgba(0,0,0,.4);}
        .la-dropdown-item{padding:8px 12px;display:flex;justify-content:space-between;gap:10px;cursor:pointer;font-size:13px;color:var(--text1);}
        .la-dropdown-item:hover{background:var(--bg3);}
        .la-dropdown-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .la-dropdown-city{color:var(--text3);font-size:11px;flex-shrink:0;}
        .la-empfaenger{margin-top:10px;padding-top:10px;border-top:1px solid var(--border);}
        .la-pos-list{display:flex;flex-direction:column;gap:6px;}
        .la-pos-row{display:grid;grid-template-columns:60px 1fr 1fr 28px;gap:8px;align-items:center;}
        .la-pos-row--head{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text3);}
        .la-pos-row .la-inp{margin-bottom:0;}
        .la-pos-remove{background:transparent;border:1px solid var(--border);color:var(--text3);border-radius:6px;width:28px;height:28px;cursor:pointer;}
        .la-pos-remove:hover:not(:disabled){color:var(--red2);border-color:var(--red2);}
        .la-pos-remove:disabled{opacity:.3;cursor:default;}
        .la-list{display:flex;flex-direction:column;gap:10px;}
        .la-item{padding:14px 16px;}
        .la-item-main{display:flex;justify-content:space-between;align-items:center;}
        .la-item-info{display:flex;flex-direction:column;gap:3px;}
        .la-nr{font-size:12px;color:var(--text3);font-family:'DM Mono',monospace;}
        .la-lieferant{font-size:14px;font-weight:600;color:var(--text1);}
        .la-item-meta{display:flex;align-items:center;gap:10px;}
        .la-date{font-size:12px;color:var(--text3);}
        .la-item-actions{margin-top:10px;padding-top:10px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px;}
        .btn{padding:7px 14px;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;border:none;font-family:inherit;transition:background .15s;text-decoration:none;display:inline-flex;align-items:center;}
        .btn-primary{background:var(--r);color:#fff;}
        .btn-primary:hover:not(:disabled){background:var(--r2);}
        .btn-primary:disabled{opacity:.5;}
        .btn-ghost{background:var(--bg2);color:var(--text2);border:1px solid var(--border);}
        .btn-ghost:hover{background:var(--bg3);color:var(--text1);}
        .spinner{width:16px;height:16px;border:2px solid var(--bg3);border-top-color:var(--r);border-radius:50%;animation:spin .6s linear infinite;}
        @keyframes spin{to{transform:rotate(360deg);}}
      `}</style>
    </div>
  );
}
