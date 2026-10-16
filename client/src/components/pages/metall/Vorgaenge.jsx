import { useState, useEffect } from 'react';

// Alle Auftraege Metallarbeiten: Suche, Filter und Belegkette pro Zeile (#367), Vorgang anlegen
// (Auftrag per Telefon/Mail, #384) und den ersten Beleg „In Lexware anlegen“ (#365). Detail kommt mit #368.

const fmt = d => d ? new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const STATUS = { draft: 'Entwurf', open: 'offen', accepted: 'angenommen', rejected: 'abgelehnt', voided: 'storniert' };
const ARTEN = [['alle', 'Alle'], ['AN', 'Angebote'], ['AB', 'Auftragsbestätigungen'], ['LS', 'Lieferscheine'], ['RE', 'Rechnungen']];
const KETTE = [['AN', 'Angebot'], ['AB', 'Auftragsbestätigung'], ['LS', 'Lieferschein'], ['RE', 'Rechnung']];
const RE_STATUS = { ...STATUS, paid: 'bezahlt', paidoff: 'ausgebucht', overdue: 'überfällig' };

// Treffer markieren (erste Fundstelle, ohne Gross/Klein)
function Hl({ text, q }) {
  const t = String(text ?? '');
  const i = q ? t.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return t;
  return <>{t.slice(0, i)}<mark>{t.slice(i, i + q.length)}</mark>{t.slice(i + q.length)}</>;
}

// AN → AB → LS → RE; Nummern im Tooltip, bei mehreren LS/RE die Anzahl
function Kette({ v, q }) {
  const ql = q.toLowerCase();
  return (
    <div className="mv-chain">
      {KETTE.map(([k, name], i) => {
        const docs = v.kette[k];
        const hit = ql && docs.some(d => (d.nr || '').toLowerCase().includes(ql));
        const skip = k === 'AN' && v.an_entfaellt;
        const title = docs.length
          ? docs.map(d => `${name} ${d.nr || 'Entwurf'} · ${RE_STATUS[d.status] || d.status}`).join('\n')
          : `${name} ${skip ? 'entfällt (Nachbestellung)' : 'fehlt'}`;
        return (
          <span key={k} className="mv-chain-step">
            {i > 0 && <i />}
            <span className={hit ? 'hit' : docs.length ? 'on' : skip ? 'skip' : ''} title={title}>
              {k}{docs.length > 1 ? <sup>{docs.length}</sup> : null}
            </span>
          </span>
        );
      })}
    </div>
  );
}

const leer = () => ({ kunde_id: '', bezeichnung: '', kunden_bestellnr: '', grundlage: 'neu', angebot_beleg_id: '', vorlage_vorgang_id: '' });

async function json(r) {
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.detail ? `${data.error}: ${data.detail}` : (data.error || 'Fehler'));
  return data;
}

export default function Vorgaenge() {
  const [vorgaenge, setVorgaenge] = useState([]);
  const [info, setInfo] = useState({ gesamt: 0, mehr: false });
  const [q, setQ] = useState('');
  const [suche, setSuche] = useState(''); // verzoegert, damit nicht jeder Tastendruck laedt
  const [art, setArt] = useState('alle');
  const [status, setStatus] = useState('laufend');
  const [kunden, setKunden] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(leer());
  const [auswahl, setAuswahl] = useState({ angebote: [], vorgaenge: [] });
  const [submitting, setSubmitting] = useState(false);
  const [lexBusy, setLexBusy] = useState(null); // `${id}-${art}` waehrend „In Lexware anlegen“

  const melde = text => { setSuccess(text); setTimeout(() => setSuccess(''), 6000); };

  const load = async () => {
    try {
      setLoading(true);
      const p = new URLSearchParams({ q: suche, art, status });
      const r = await json(await fetch(`/api/metallarbeiten/vorgaenge?${p}`));
      setVorgaenge(r.treffer); setInfo({ gesamt: r.gesamt, mehr: r.mehr });
    } catch (e) { setError(`Laden fehlgeschlagen: ${e.message}`); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    const t = setTimeout(() => setSuche(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => { load(); }, [suche, art, status]);

  useEffect(() => {
    fetch('/api/metallarbeiten/vorgaenge/kunden').then(json).then(setKunden).catch(() => setKunden([]));
  }, []);

  // Angebote und fruehere Vorgaenge des gewaehlten Kunden
  useEffect(() => {
    setAuswahl({ angebote: [], vorgaenge: [] });
    if (!form.kunde_id) return;
    fetch(`/api/metallarbeiten/vorgaenge/auswahl?kunde_id=${form.kunde_id}`).then(json).then(setAuswahl).catch(() => {});
  }, [form.kunde_id]);

  const set = (feld, wert) => setForm(f => ({ ...f, [feld]: wert }));
  const setKunde = id => setForm(f => ({ ...f, kunde_id: id, angebot_beleg_id: '', vorlage_vorgang_id: '' }));

  const submit = async () => {
    if (!form.kunde_id) { setError('Bitte einen Metallkunden wählen'); return; }
    if (!form.bezeichnung.trim()) { setError('Bitte eine Bezeichnung eingeben'); return; }
    if (form.grundlage === 'angebot' && !form.angebot_beleg_id) { setError('Bitte ein Angebot wählen'); return; }
    if (form.grundlage === 'vorlage' && !form.vorlage_vorgang_id) { setError('Bitte den Vorgang wählen, der nachbestellt wird'); return; }
    setSubmitting(true); setError(''); setSuccess('');
    try {
      const v = await json(await fetch('/api/metallarbeiten/vorgaenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kunde_id: form.kunde_id,
          bezeichnung: form.bezeichnung,
          kunden_bestellnr: form.kunden_bestellnr,
          angebot_beleg_id: form.grundlage === 'angebot' ? form.angebot_beleg_id : null,
          vorlage_vorgang_id: form.grundlage === 'vorlage' ? form.vorlage_vorgang_id : null,
        }),
      }));
      melde(`Vorgang ${v.vorgangsnummer} angelegt.`);
      setShowForm(false); setForm(leer()); await load();
    } catch (e) { setError(e.message); }
    finally { setSubmitting(false); }
  };

  const inLexware = async (v, art) => {
    const was = art === 'angebot' ? 'Angebot' : 'Auftragsbestätigung';
    if (!window.confirm(`${was} für ${v.vorgangsnummer} als Entwurf in Lexware anlegen?`)) return;
    setLexBusy(`${v.id}-${art}`); setError(''); setSuccess('');
    try {
      const b = await json(await fetch(`/api/metallarbeiten/vorgaenge/${v.id}/lexware`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ art }),
      }));
      melde(`${was} ${b.belegnummer || ''} als Entwurf in Lexware angelegt – dort weiter bearbeiten.`);
      await load();
    } catch (e) { setError(e.message); }
    finally { setLexBusy(null); }
  };

  return (
    <div className="mv-root">
      <div className="mv-hdr">
        <div><h1 className="mv-title">Alle Aufträge</h1><p className="mv-sub">Metallarbeiten — Vorgänge mit Belegkette aus Lexware</p></div>
        <button className="btn btn-primary" onClick={() => { setShowForm(v => !v); setError(''); }}>
          {showForm ? 'Abbrechen' : '+ Neuer Vorgang'}
        </button>
      </div>

      {error && <div className="alert alert--error">{error}</div>}
      {success && <div className="alert alert--success">{success}</div>}

      {showForm && (
        <div className="card mv-form">
          <div className="mv-grid">
            <div className="mv-ff">
              <label className="mv-lbl">Metallkunde</label>
              <select className="mv-inp" value={form.kunde_id} onChange={e => setKunde(e.target.value)}>
                <option value="">– wählen –</option>
                {kunden.map(k => <option key={k.id} value={k.id}>{k.name}{k.kdnr ? ` (${k.kdnr})` : ''}</option>)}
              </select>
              {kunden.length === 0 && <div className="mv-hint">Noch keine Metallkunden – erst unter Metallkunden den Merker setzen.</div>}
            </div>
            <div className="mv-ff">
              <label className="mv-lbl">Bestellnr. des Kunden (optional)</label>
              <input className="mv-inp" value={form.kunden_bestellnr} maxLength={100} placeholder="z. B. 4711"
                onChange={e => set('kunden_bestellnr', e.target.value)} />
            </div>
          </div>

          <div className="mv-ff">
            <label className="mv-lbl">Bezeichnung</label>
            <input className="mv-inp" value={form.bezeichnung} maxLength={255} placeholder="z. B. Geländer Terrasse, verzinkt"
              onChange={e => set('bezeichnung', e.target.value)} />
          </div>

          <label className="mv-lbl" style={{ marginTop: 6 }}>Grundlage</label>
          <div className="mv-radio">
            {[['neu', 'Neu – Angebot folgt'], ['angebot', 'Aus Angebot'], ['vorlage', 'Nachbestellung']].map(([w, t]) => (
              <label key={w}><input type="radio" name="grundlage" checked={form.grundlage === w} onChange={() => set('grundlage', w)} /> {t}</label>
            ))}
          </div>

          {form.grundlage === 'angebot' && (
            <select className="mv-inp" value={form.angebot_beleg_id} onChange={e => set('angebot_beleg_id', e.target.value)} disabled={!form.kunde_id}>
              <option value="">{form.kunde_id ? (auswahl.angebote.length ? '– Angebot wählen –' : 'Keine Angebote in Lexware') : 'Erst Kunde wählen'}</option>
              {auswahl.angebote.map(a => (
                <option key={a.id} value={a.id}>
                  {a.belegnummer || 'Entwurf'} · {fmt(a.belegdatum)} · {STATUS[a.belegstatus] || a.belegstatus}{a.vorgaenge > 0 ? ` · schon ${a.vorgaenge}× bestellt` : ''}
                </option>
              ))}
            </select>
          )}
          {form.grundlage === 'vorlage' && (
            <select className="mv-inp" value={form.vorlage_vorgang_id} onChange={e => set('vorlage_vorgang_id', e.target.value)} disabled={!form.kunde_id}>
              <option value="">{form.kunde_id ? (auswahl.vorgaenge.length ? '– Vorgang wählen –' : 'Noch keine Vorgänge') : 'Erst Kunde wählen'}</option>
              {auswahl.vorgaenge.map(v => <option key={v.id} value={v.id}>{v.vorgangsnummer} · {v.bezeichnung}</option>)}
            </select>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
            <button className="btn btn-primary" onClick={submit} disabled={submitting}>
              {submitting ? 'Wird angelegt…' : 'Vorgang anlegen'}
            </button>
          </div>
        </div>
      )}

      <div className="mv-search">
        <input className="mv-inp mv-q" type="search" value={q} onChange={e => setQ(e.target.value)} aria-label="Suche"
          placeholder="Belegnummer, Vorgang, Bestellnr., Kunde, Bezeichnung …" />
        <select className="mv-inp mv-status" value={status} onChange={e => setStatus(e.target.value)} aria-label="Status">
          <option value="laufend">Laufend</option>
          <option value="abgeschlossen">Abgeschlossen</option>
          <option value="abgebrochen">Abgebrochen</option>
          <option value="alle">Alle Status</option>
        </select>
      </div>
      <div className="mv-chips" role="group" aria-label="Belegart">
        {ARTEN.map(([k, l]) => <button key={k} aria-pressed={art === k} onClick={() => setArt(k)}>{l}</button>)}
      </div>
      <div className="mv-count">
        {loading ? 'Lade …' : `${info.gesamt} ${info.gesamt === 1 ? 'Vorgang' : 'Vorgänge'}${suche ? ` für „${suche}“` : ''}`}
        {!loading && info.mehr && ' · nur die neuesten angezeigt, bitte Suche eingrenzen'}
      </div>

      {loading && vorgaenge.length === 0 ? <div className="mv-loading"><div className="spinner" />Lade Vorgänge…</div>
        : vorgaenge.length === 0 ? <div className="mv-empty">{suche || art !== 'alle' || status !== 'alle'
          ? 'Kein Vorgang gefunden. Nicht zugeordnete Belege stehen unter „Belege zuordnen“.'
          : 'Noch keine Vorgänge vorhanden.'}</div>
        : <div className="mv-table">
          <div className="mv-row mv-head"><span>Vorgang</span><span>Kunde</span><span>Bezeichnung</span><span>Belegkette</span><span>Status</span><span>Aktualisiert</span></div>
          {vorgaenge.map(v => {
            const offen = !v.abgebrochen_am;
            return (
              <div key={v.id} className="mv-item">
                <div className="mv-row">
                  <span className="mv-c-nr">
                    <span className="mv-nr"><Hl text={v.vorgangsnummer} q={suche} /></span>
                    {v.kunden_bestellnr && <span className="mv-small">Bestellnr. <Hl text={v.kunden_bestellnr} q={suche} /></span>}
                    {v.vorlage_nr && <span className="mv-small">Nachbestellung von {v.vorlage_nr}</span>}
                  </span>
                  <span className="mv-c-kunde">
                    <span><Hl text={v.kunde_name} q={suche} /></span>
                    {v.kdnr && <span className="mv-small">KdNr <Hl text={v.kdnr} q={suche} /></span>}
                  </span>
                  <span className="mv-bez"><Hl text={v.bezeichnung} q={suche} /></span>
                  <Kette v={v} q={suche} />
                  <span><span className={`mv-chip mv-chip--${v.status.ton}`}>{v.status.text}</span></span>
                  <span className="mv-date">{fmt(v.aktualisiert)}</span>
                </div>
                {offen && !v.ab_nr && (
                  <div className="mv-item-actions">
                    {/* Neuer Vorgang beginnt immer mit einem Angebot (Konzept Entscheidung 2);
                        AB nur aus dem Angebot oder bei einer Nachbestellung */}
                    {!v.angebot_nr && !v.vorlage_nr ? (
                      <button className="btn btn-primary" disabled={!!lexBusy} onClick={() => inLexware(v, 'angebot')}>
                        {lexBusy === `${v.id}-angebot` ? 'Wird angelegt…' : 'In Lexware: Angebot'}
                      </button>
                    ) : (
                      <button className="btn btn-primary" disabled={!!lexBusy}
                        title={v.angebot_status === 'draft' ? 'Geht erst, wenn das Angebot in Lexware fertiggestellt ist' : ''}
                        onClick={() => inLexware(v, 'ab')}>
                        {lexBusy === `${v.id}-ab` ? 'Wird angelegt…' : v.angebot_nr ? 'In Lexware: AB aus Angebot' : 'In Lexware: AB (Nachbestellung)'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>}

      <style>{`
        .mv-root{padding:18px;max-width:1180px;}
        .mv-hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;gap:12px;}
        .mv-title{font-size:20px;font-weight:700;color:var(--text1);margin:0 0 4px;}
        .mv-sub{font-size:13px;color:var(--text3);margin:0;}
        .mv-loading{display:flex;gap:10px;align-items:center;color:var(--text2);padding:30px 0;}
        .mv-empty{color:var(--text3);font-size:13px;padding:30px 0;}
        .alert{padding:10px 14px;border-radius:7px;font-size:13px;margin-bottom:14px;}
        .alert--error{background:#3a1515;border:1px solid var(--red2);color:var(--red2);}
        .alert--success{background:#0e2e1e;border:1px solid var(--green);color:var(--green);}
        .card{background:var(--bg1);border:1px solid var(--border);border-radius:9px;}
        .mv-form{padding:18px;margin-bottom:18px;}
        .mv-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
        @media (max-width:640px){.mv-grid{grid-template-columns:1fr;gap:0;}}
        .mv-ff{margin-bottom:6px;}
        .mv-lbl{font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px;}
        .mv-inp{background:var(--bg2);border:1px solid var(--border);border-radius:7px;padding:7px 10px;color:var(--text1);font-size:13px;font-family:inherit;width:100%;box-sizing:border-box;margin-bottom:6px;}
        .mv-inp:focus{outline:none;border-color:var(--r);}
        .mv-inp:disabled{opacity:.6;}
        .mv-hint{font-size:11px;color:var(--text3);margin:-2px 0 6px;}
        .mv-radio{display:flex;flex-wrap:wrap;gap:16px;font-size:13px;color:var(--text2);margin-bottom:8px;}
        .mv-radio label{display:flex;align-items:center;gap:6px;cursor:pointer;}
        .mv-search{display:flex;gap:10px;flex-wrap:wrap;}
        .mv-search .mv-inp{margin-bottom:10px;}
        .mv-q{flex:1 1 280px;width:auto;font-size:14px;padding:9px 12px;}
        .mv-status{flex:1 0 170px;max-width:220px;width:auto;}
        .mv-chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;}
        .mv-chips button{padding:5px 12px;border-radius:14px;font-size:12px;font-weight:600;font-family:inherit;cursor:pointer;background:var(--bg2);border:1px solid var(--border);color:var(--text2);}
        .mv-chips button[aria-pressed="true"]{background:var(--r);border-color:var(--r);color:#fff;}
        .mv-count{font-size:12px;color:var(--text3);margin-bottom:10px;}
        .mv-table{background:var(--bg1);border:1px solid var(--border);border-radius:9px;overflow:hidden;}
        .mv-row{display:grid;grid-template-columns:130px minmax(0,1.1fr) minmax(0,1.5fr) 150px 185px 95px;gap:12px;align-items:center;padding:11px 14px;}
        .mv-head{font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;background:var(--bg2);border-bottom:1px solid var(--border);}
        .mv-item{border-bottom:1px solid var(--border);}
        .mv-item:last-child{border-bottom:none;}
        .mv-item:hover{background:var(--bg2);}
        .mv-c-nr,.mv-c-kunde{display:flex;flex-direction:column;gap:2px;min-width:0;font-size:13px;color:var(--text1);}
        .mv-nr{font-size:12px;color:var(--text1);font-family:'DM Mono',monospace;}
        .mv-small{font-size:11px;color:var(--text3);}
        .mv-bez{font-size:13px;font-weight:600;color:var(--text1);min-width:0;overflow-wrap:anywhere;}
        .mv-row mark{background:#f5c54266;color:inherit;border-radius:2px;padding:0 1px;}
        .mv-chain{display:flex;align-items:center;}
        .mv-chain-step{display:flex;align-items:center;}
        .mv-chain-step i{display:block;width:8px;height:1px;background:var(--border);}
        .mv-chain-step span{font-size:10px;font-weight:700;font-family:'DM Mono',monospace;padding:3px 5px;border-radius:5px;border:1px dashed var(--border);color:var(--text3);cursor:default;}
        .mv-chain-step span.on{border-style:solid;border-color:#2ebd7a66;background:#0d2318;color:#2ebd7a;}
        .mv-chain-step span.hit{border-style:solid;border-color:#f5c542;background:#f5c54233;color:var(--text1);}
        .mv-chain-step span.skip{opacity:.45;text-decoration:line-through;}
        .mv-chain-step sup{font-size:8px;margin-left:1px;}
        .mv-chip{display:inline-block;white-space:nowrap;font-size:11px;font-weight:600;padding:3px 9px;border-radius:10px;background:var(--bg2);border:1px solid var(--border);color:var(--text2);}
        .mv-chip--ok{color:#2ebd7a;border-color:#2ebd7a44;background:#0d2318;}
        .mv-chip--warn{color:#f5a742;border-color:#f5a74244;background:#2b1f0d;}
        .mv-chip--rot{color:var(--red2);border-color:var(--red2);background:#3a1515;}
        .mv-date{font-size:12px;color:var(--text3);}
        @media (max-width:900px){
          .mv-head{display:none;}
          .mv-row{grid-template-columns:1fr auto;gap:6px 12px;}
          .mv-bez{grid-column:1 / -1;}
        }
        .mv-item-actions{margin:0 14px;padding:8px 0 11px;display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;}
        .btn{padding:7px 14px;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;border:none;font-family:inherit;transition:background .15s;text-decoration:none;display:inline-flex;align-items:center;}
        .btn-primary{background:var(--r);color:#fff;}
        .btn-primary:hover:not(:disabled){background:var(--r2);}
        .btn:disabled{opacity:.5;cursor:default;}
        .btn-ghost{background:var(--bg2);color:var(--text2);border:1px solid var(--border);}
        .btn-ghost:hover:not(:disabled){background:var(--bg3);color:var(--text1);}
        .spinner{width:16px;height:16px;border:2px solid var(--bg3);border-top-color:var(--r);border-radius:50%;animation:spin .6s linear infinite;}
        @keyframes spin{to{transform:rotate(360deg);}}
      `}</style>
    </div>
  );
}
