import { useState, useEffect } from 'react';

// Vorgaenge Metallarbeiten (#384): Vorgang anlegen (Auftrag per Telefon/Mail) und den
// ersten Beleg „In Lexware anlegen“ (#365). Suche/Filter und Detail kommen mit #367/#368.

const fmt = d => d ? new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const STATUS = { draft: 'Entwurf', open: 'offen', accepted: 'angenommen', rejected: 'abgelehnt', voided: 'storniert' };
const leer = () => ({ kunde_id: '', bezeichnung: '', kunden_bestellnr: '', grundlage: 'neu', angebot_beleg_id: '', vorlage_vorgang_id: '' });

async function json(r) {
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.detail ? `${data.error}: ${data.detail}` : (data.error || 'Fehler'));
  return data;
}

export default function Vorgaenge() {
  const [vorgaenge, setVorgaenge] = useState([]);
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
      setVorgaenge(await json(await fetch('/api/metallarbeiten/vorgaenge')));
    } catch (e) { setError(`Laden fehlgeschlagen: ${e.message}`); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
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
        <div><h1 className="mv-title">Vorgänge</h1><p className="mv-sub">Metallarbeiten — Aufträge per Telefon oder Mail anlegen</p></div>
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

      {loading ? <div className="mv-loading"><div className="spinner" />Lade Vorgänge…</div>
        : vorgaenge.length === 0 ? <div className="mv-empty">Noch keine Vorgänge vorhanden.</div>
        : <div className="mv-list">
          {vorgaenge.map(v => {
            const offen = !v.abgebrochen_am;
            return (
              <div key={v.id} className="card mv-item">
                <div className="mv-item-main">
                  <div className="mv-item-info">
                    <span className="mv-nr">{v.vorgangsnummer}{v.kunden_bestellnr ? ` · Bestellnr. ${v.kunden_bestellnr}` : ''}</span>
                    <span className="mv-bez">{v.bezeichnung}</span>
                    <span className="mv-kunde">{v.kunde_name}</span>
                  </div>
                  <div className="mv-item-meta">
                    {v.angebot_nr && <span className="mv-doc">AN {v.angebot_nr}</span>}
                    {v.vorlage_nr && <span className="mv-doc">Nachbestellung von {v.vorlage_nr}</span>}
                    {v.ab_nr && <span className="mv-doc mv-doc--ab">AB {v.ab_nr}</span>}
                    {!offen && <span className="mv-doc">abgebrochen</span>}
                    <span className="mv-date">{fmt(v.erstellt_am)}</span>
                  </div>
                </div>
                {offen && !v.ab_nr && (
                  <div className="mv-item-actions">
                    {!v.angebot_nr && !v.vorlage_nr && (
                      <button className="btn btn-ghost" disabled={!!lexBusy} onClick={() => inLexware(v, 'angebot')}>
                        {lexBusy === `${v.id}-angebot` ? 'Wird angelegt…' : 'In Lexware: Angebot'}
                      </button>
                    )}
                    <button className="btn btn-primary" disabled={!!lexBusy || v.angebot_status === 'draft'}
                      title={v.angebot_status === 'draft' ? 'Angebot erst in Lexware fertigstellen' : ''}
                      onClick={() => inLexware(v, 'ab')}>
                      {lexBusy === `${v.id}-ab` ? 'Wird angelegt…' : v.angebot_nr ? 'In Lexware: AB aus Angebot' : 'In Lexware: AB'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>}

      <style>{`
        .mv-root{padding:18px;max-width:860px;}
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
        .mv-list{display:flex;flex-direction:column;gap:10px;}
        .mv-item{padding:14px 16px;}
        .mv-item-main{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;}
        .mv-item-info{display:flex;flex-direction:column;gap:3px;min-width:0;}
        .mv-nr{font-size:12px;color:var(--text3);font-family:'DM Mono',monospace;}
        .mv-bez{font-size:14px;font-weight:600;color:var(--text1);}
        .mv-kunde{font-size:12px;color:var(--text2);}
        .mv-item-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
        .mv-doc{font-size:11px;font-weight:600;padding:2px 8px;border-radius:10px;background:var(--bg2);border:1px solid var(--border);color:var(--text2);}
        .mv-doc--ab{color:#2ebd7a;border-color:#2ebd7a44;background:#0d2318;}
        .mv-date{font-size:12px;color:var(--text3);}
        .mv-item-actions{margin-top:10px;padding-top:10px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;}
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
