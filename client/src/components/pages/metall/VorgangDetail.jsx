import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';

// Vorgangsdetail Metallarbeiten (#368): Statusleiste, Fertigung (Geplant / In Arbeit / Fertig),
// Belege mit „Lösen“ bei Fehlzuordnung, Mehrfachbestellung, Abbrechen/Fortsetzen.
// Alles außer der Fertigung kommt aus Lexware.

const fmt = d => d ? new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const eur = n => n == null ? '' : Number(n).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const ART = { quotation: 'Angebot', orderconfirmation: 'Auftragsbestätigung', deliverynote: 'Lieferschein', invoice: 'Rechnung' };
const BELEG_STATUS = { draft: 'Entwurf', open: 'offen', accepted: 'angenommen', rejected: 'abgelehnt', voided: 'storniert', paid: 'bezahlt', paidoff: 'ausgebucht', overdue: 'überfällig' };
const ZUORDNUNG = { api: 'vom Portal angelegt', verknuepfung: 'über Verknüpfung', einleitung: 'über Vorgangsnummer', auto: 'automatisch', manuell: 'von Hand' };
const STUFEN = [['geplant', 'Geplant'], ['in_arbeit', 'In Arbeit'], ['fertig', 'Fertig']];

async function json(r) {
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.detail ? `${data.error}: ${data.detail}` : (data.error || 'Fehler'));
  return data;
}

const send = (url, method = 'POST', body = {}) =>
  fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(json);

export default function VorgangDetail() {
  const { id } = useParams();
  const [v, setV] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(null);

  const basis = `/api/metallarbeiten/vorgaenge/${id}`;
  const melde = text => { setSuccess(text); setTimeout(() => setSuccess(''), 6000); };

  const load = async () => {
    try { setV(await json(await fetch(basis))); setError(''); }
    catch (e) { setError(`Laden fehlgeschlagen: ${e.message}`); }
    finally { setLoading(false); }
  };
  useEffect(() => { setLoading(true); setV(null); load(); }, [id]);

  // Aktion ausfuehren; liefert die Route das Detail zurueck, direkt uebernehmen, sonst neu laden
  const tu = async (key, fn, text) => {
    setBusy(key); setError(''); setSuccess('');
    try {
      const r = await fn();
      if (r && r.statusleiste) setV(r); else await load();
      if (text) melde(typeof text === 'function' ? text(r) : text);
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  };

  const fertigung = stufe => tu(`f-${stufe}`, () => send(`${basis}/fertigung`, 'PUT', { stufe }));

  const loesen = b => {
    const nr = b.belegnummer || 'Entwurf';
    if (!window.confirm(`${ART[b.belegart]} ${nr} von ${v.vorgangsnummer} lösen?\n\nDer Beleg steht danach wieder unter „Belege zuordnen“. Der Sync hängt ihn nicht automatisch an diesen Vorgang zurück.`)) return;
    tu(`l-${b.id}`, () => send(`${basis}/belege/${b.id}/loesen`),
      r => r.zurueck_in_eingang ? `${nr} gelöst – steht jetzt unter „Belege zuordnen“.` : `${nr} von diesem Vorgang gelöst (gehört weiter zu anderen Vorgängen).`);
  };

  const abbrechen = () => {
    const grund = window.prompt(`Warum wird ${v.vorgangsnummer} abgebrochen?`);
    if (grund === null) return;
    tu('abbrechen', () => send(`${basis}/abbrechen`, 'POST', { grund }), 'Vorgang abgebrochen.');
  };

  const inLexware = art => {
    const was = art === 'angebot' ? 'Angebot' : 'Auftragsbestätigung';
    if (!window.confirm(`${was} für ${v.vorgangsnummer} als Entwurf in Lexware anlegen?`)) return;
    tu(`lex-${art}`, () => send(`${basis}/lexware`, 'POST', { art }),
      b => `${was} ${b.belegnummer || ''} als Entwurf in Lexware angelegt – dort weiter bearbeiten.`);
  };

  if (loading) return <div className="vd-root"><div className="vd-loading"><div className="spinner" />Lade Vorgang…</div><style>{css}</style></div>;
  if (!v) return <div className="vd-root"><Link className="vd-back" to="/metallarbeiten/vorgaenge">‹ Alle Aufträge</Link><div className="alert alert--error">{error || 'Vorgang nicht gefunden'}</div><style>{css}</style></div>;

  const offen = !v.abgebrochen_am;
  const hatAb = v.kette.AB.length > 0;
  const andere = v.angebot_vorgaenge.filter(x => x.id !== v.id);

  return (
    <div className="vd-root">
      <Link className="vd-back" to="/metallarbeiten/vorgaenge">‹ Alle Aufträge</Link>
      <div className="vd-hdr">
        <div style={{ minWidth: 0 }}>
          <div className="vd-lbl">{v.kunde_name}{v.kdnr ? ` · KdNr ${v.kdnr}` : ''}</div>
          <h1 className="vd-title">{v.bezeichnung}</h1>
          <div className="vd-meta">
            <span className="vd-nr">{v.vorgangsnummer}</span>
            {v.kunden_bestellnr && <span>Bestellnr. des Kunden: <b>{v.kunden_bestellnr}</b></span>}
            <span>angelegt {fmt(v.erstellt_am)}{v.erstellt_von_name ? ` von ${v.erstellt_von_name}` : ''}</span>
          </div>
        </div>
        <span className={`vd-chip vd-chip--${v.status.ton}`}>{v.status.text}</span>
      </div>

      {error && <div className="alert alert--error">{error}</div>}
      {success && <div className="alert alert--success">{success}</div>}

      {!offen && (
        <div className="vd-note vd-note--warn">
          <span>Abgebrochen am {fmt(v.abgebrochen_am)}{v.abbruch_grund ? ` – ${v.abbruch_grund}` : ''}</span>
          <button className="btn btn-ghost" disabled={!!busy} onClick={() => tu('fort', () => send(`${basis}/fortsetzen`), 'Vorgang läuft wieder.')}>Fortsetzen</button>
        </div>
      )}
      {andere.length > 0 && (
        <div className="vd-note">
          Angebot {v.angebot_nr || 'Entwurf'} ist mehrfach bestellt: {v.angebot_vorgaenge.map((x, i) => (
            <span key={x.id}>{i > 0 && (i === v.angebot_vorgaenge.length - 1 ? ' und ' : ', ')}
              {x.id === v.id ? <b>{x.vorgangsnummer}</b> : <Link to={`/metallarbeiten/vorgaenge/${x.id}`}>{x.vorgangsnummer}</Link>}
              {x.abgebrochen_am ? ' (abgebrochen)' : ''}</span>
          ))}
        </div>
      )}
      {(v.vorlage_nr || v.nachbestellungen.length > 0) && (
        <div className="vd-note">
          {v.vorlage_nr && <span>Nachbestellung von <Link to={`/metallarbeiten/vorgaenge/${v.vorlage_vorgang_id}`}>{v.vorlage_nr}</Link>. </span>}
          {v.nachbestellungen.length > 0 && <span>Nachbestellt in {v.nachbestellungen.map((x, i) => (
            <span key={x.id}>{i > 0 && ', '}<Link to={`/metallarbeiten/vorgaenge/${x.id}`}>{x.vorgangsnummer}</Link></span>
          ))}.</span>}
        </div>
      )}
      {v.vorschlaege > 0 && (
        <div className="vd-note">
          {v.vorschlaege === 1 ? 'Ein offener Beleg schlägt' : `${v.vorschlaege} offene Belege schlagen`} diesen Vorgang vor – <Link to="/metallarbeiten/zuordnen">Belege zuordnen</Link>
        </div>
      )}

      <div className="card vd-card">
        <ol className="vd-steps">
          {v.statusleiste.map(s => (
            <li key={s.schritt} className={`vd-step vd-step--${s.zustand}`}>
              <span className="vd-dot">{s.zustand === 'done' ? '✓' : ''}</span>
              <span className="vd-step-n">{s.schritt}</span>
              <span className="vd-step-i">{s.info}</span>
            </li>
          ))}
        </ol>
        <div className="vd-fert">
          <span className="vd-lbl" style={{ margin: 0 }}>Fertigung</span>
          <div className="vd-seg" role="group" aria-label="Fertigung">
            {STUFEN.map(([k, l]) => (
              <button key={k} aria-pressed={v.fertigung === k} disabled={!!busy || !offen || (!hatAb && k !== 'geplant')}
                onClick={() => v.fertigung !== k && fertigung(k)}>{busy === `f-${k}` ? '…' : l}</button>
            ))}
          </div>
          <span className="vd-small">
            {!offen ? 'Vorgang abgebrochen.'
              : !hatAb ? 'Geht erst nach der Auftragsbestätigung.'
              : v.fertigung === 'fertig' ? `Fertig seit ${fmt(v.fertigung_am)}${v.fertigung_von_name ? ` · ${v.fertigung_von_name}` : ''}`
              : v.fertigung === 'in_arbeit' ? `In Arbeit seit ${fmt(v.fertigung_begonnen_am)}${v.fertigung_von_name ? ` · ${v.fertigung_von_name}` : ''}`
              : 'Der einzige Schritt, der nicht aus Lexware kommt.'}
          </span>
        </div>
      </div>

      <div className="card vd-card">
        <div className="vd-card-h"><h3>Belege</h3><span className="vd-small">aus Lexware · nur lesen</span></div>
        {v.belege.length === 0 ? <div className="vd-empty">Noch keine Belege.</div> : (
          <div className="vd-belege">
            {v.belege.map(b => (
              <div key={b.id} className={`vd-beleg${b.zaehlt ? '' : ' vd-beleg--aus'}`}>
                <span className="vd-art">{ART[b.belegart]}</span>
                <span className="vd-nr">{b.belegnummer || 'Entwurf'}</span>
                <span className="vd-small vd-d">{fmt(b.belegdatum)}</span>
                <span className="vd-small vd-d">{BELEG_STATUS[b.belegstatus] || b.belegstatus}{b.archiviert ? ' · archiviert' : ''}</span>
                <span className="vd-betrag">{eur(b.betrag_brutto)}</span>
                <span className="vd-small vd-d">{ZUORDNUNG[b.zuordnung] || b.zuordnung}</span>
                <span className="vd-small vd-m">{[fmt(b.belegdatum), (BELEG_STATUS[b.belegstatus] || b.belegstatus) + (b.archiviert ? ', archiviert' : ''), ZUORDNUNG[b.zuordnung] || b.zuordnung].filter(Boolean).join(' · ')}</span>
                <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => loesen(b)}
                  title="Falsch zugeordnet? Zurück nach „Belege zuordnen“">{busy === `l-${b.id}` ? '…' : 'Lösen'}</button>
              </div>
            ))}
          </div>
        )}
        {offen && !v.ab_nr && (
          <div className="vd-actions">
            {!v.angebot_nr && !v.vorlage_nr ? (
              <button className="btn btn-primary" disabled={!!busy} onClick={() => inLexware('angebot')}>
                {busy === 'lex-angebot' ? 'Wird angelegt…' : 'In Lexware: Angebot'}
              </button>
            ) : (
              <button className="btn btn-primary" disabled={!!busy}
                title={v.angebot_status === 'draft' ? 'Geht erst, wenn das Angebot in Lexware fertiggestellt ist' : ''}
                onClick={() => inLexware('ab')}>
                {busy === 'lex-ab' ? 'Wird angelegt…' : v.angebot_nr ? 'In Lexware: AB aus Angebot' : 'In Lexware: AB (Nachbestellung)'}
              </button>
            )}
          </div>
        )}
      </div>

      {offen && (
        <div className="vd-foot">
          <button className="btn btn-ghost" disabled={!!busy} onClick={abbrechen}>Vorgang abbrechen</button>
        </div>
      )}
      <style>{css}</style>
    </div>
  );
}

const css = `
  .vd-root{padding:18px;max-width:1000px;}
  .vd-back{display:inline-block;font-size:13px;color:var(--text2);text-decoration:none;margin-bottom:12px;}
  .vd-back:hover{color:var(--text1);}
  .vd-loading{display:flex;gap:10px;align-items:center;color:var(--text2);padding:30px 0;}
  .vd-hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px;flex-wrap:wrap;}
  .vd-lbl{font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;}
  .vd-title{font-size:20px;font-weight:700;color:var(--text1);margin:0 0 6px;overflow-wrap:anywhere;}
  .vd-meta{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px;color:var(--text3);}
  .vd-meta b{color:var(--text1);font-weight:600;}
  .vd-nr{font-family:'DM Mono',monospace;font-size:12px;color:var(--text1);}
  .vd-chip{display:inline-block;white-space:nowrap;font-size:12px;font-weight:600;padding:4px 11px;border-radius:12px;background:var(--bg2);border:1px solid var(--border);color:var(--text2);}
  .vd-chip--ok{color:#2ebd7a;border-color:#2ebd7a44;background:#0d2318;}
  .vd-chip--warn{color:#f5a742;border-color:#f5a74244;background:#2b1f0d;}
  .vd-chip--rot{color:var(--red2);border-color:var(--red2);background:#3a1515;}
  .alert{padding:10px 14px;border-radius:7px;font-size:13px;margin-bottom:14px;}
  .alert--error{background:#3a1515;border:1px solid var(--red2);color:var(--red2);}
  .alert--success{background:#0e2e1e;border:1px solid var(--green);color:var(--green);}
  .vd-note{display:block;font-size:13px;color:var(--text2);background:var(--bg1);border:1px solid var(--border);border-left:3px solid #4a8fe7;border-radius:7px;padding:9px 12px;margin-bottom:10px;}
  .vd-note--warn{border-left-color:#f5a742;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;}
  .vd-note a,.vd-root .vd-card a{color:#6aa8f0;}
  .card{background:var(--bg1);border:1px solid var(--border);border-radius:9px;}
  .vd-card{margin-bottom:14px;}
  .vd-card-h{display:flex;align-items:baseline;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border);}
  .vd-card-h h3{margin:0;font-size:14px;color:var(--text1);}
  .vd-steps{list-style:none;margin:0;padding:18px 16px 14px;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;}
  .vd-step{display:flex;flex-direction:column;align-items:center;text-align:center;gap:4px;position:relative;min-width:0;}
  .vd-step:not(:first-child)::before{content:'';position:absolute;top:11px;right:calc(50% + 14px);left:calc(-50% + 14px);height:2px;background:var(--border);}
  .vd-step--done:not(:first-child)::before,.vd-step--current:not(:first-child)::before{background:#2ebd7a88;}
  .vd-dot{width:22px;height:22px;border-radius:50%;border:2px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;background:var(--bg2);}
  .vd-step--done .vd-dot{background:#2ebd7a;border-color:#2ebd7a;}
  .vd-step--current .vd-dot{border-color:var(--r);box-shadow:0 0 0 3px #c0392b33;}
  .vd-step--skip{opacity:.5;}
  .vd-step--skip .vd-dot{border-style:dashed;}
  .vd-step-n{font-size:12px;font-weight:600;color:var(--text1);}
  .vd-step--todo .vd-step-n{color:var(--text3);}
  .vd-step-i{font-size:11px;color:var(--text3);overflow-wrap:anywhere;}
  .vd-fert{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 16px;border-top:1px solid var(--border);}
  .vd-seg{display:inline-flex;border:1px solid var(--border);border-radius:8px;overflow:hidden;}
  .vd-seg button{padding:7px 14px;font-size:13px;font-weight:600;font-family:inherit;background:var(--bg2);color:var(--text2);border:none;border-right:1px solid var(--border);cursor:pointer;}
  .vd-seg button:last-child{border-right:none;}
  .vd-seg button[aria-pressed="true"]{background:var(--r);color:#fff;}
  .vd-seg button:disabled{cursor:default;opacity:.55;}
  .vd-seg button[aria-pressed="true"]:disabled{opacity:.8;}
  .vd-small{font-size:12px;color:var(--text3);}
  .vd-empty{padding:14px 16px;font-size:13px;color:var(--text3);}
  .vd-belege{display:flex;flex-direction:column;}
  .vd-beleg{display:grid;grid-template-columns:170px 100px 100px minmax(0,1fr) 100px 140px auto;gap:10px;align-items:center;padding:9px 16px;border-bottom:1px solid var(--border);font-size:13px;color:var(--text1);}
  .vd-beleg:last-child{border-bottom:none;}
  .vd-beleg--aus{opacity:.5;}
  .vd-beleg--aus .vd-nr{text-decoration:line-through;}
  .vd-art{font-weight:600;}
  .vd-betrag{text-align:right;font-variant-numeric:tabular-nums;}
  .vd-m{display:none;}
  .vd-actions{display:flex;justify-content:flex-end;gap:8px;padding:10px 16px;border-top:1px solid var(--border);}
  .vd-foot{display:flex;justify-content:flex-end;}
  @media (max-width:760px){
    .vd-steps{grid-template-columns:1fr;gap:0;padding:12px 16px;}
    .vd-step{flex-direction:row;text-align:left;gap:10px;padding:5px 0;}
    .vd-step:not(:first-child)::before{display:none;}
    .vd-step-n{min-width:80px;}
    .vd-beleg{grid-template-columns:auto 1fr auto;grid-template-areas:"art art btn" "nr betrag btn" "m m m";gap:2px 10px;}
    .vd-beleg .vd-art{grid-area:art;}
    .vd-beleg .vd-nr{grid-area:nr;}
    .vd-beleg .vd-betrag{grid-area:betrag;}
    .vd-beleg button{grid-area:btn;align-self:center;}
    .vd-beleg .vd-d{display:none;}
    .vd-beleg .vd-m{display:block;grid-area:m;}
  }
  .btn{padding:7px 14px;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;border:none;font-family:inherit;transition:background .15s;text-decoration:none;display:inline-flex;align-items:center;}
  .btn-sm{padding:4px 10px;font-size:12px;}
  .btn-primary{background:var(--r);color:#fff;}
  .btn-primary:hover:not(:disabled){background:var(--r2);}
  .btn:disabled{opacity:.5;cursor:default;}
  .btn-ghost{background:var(--bg2);color:var(--text2);border:1px solid var(--border);}
  .btn-ghost:hover:not(:disabled){background:var(--bg3);color:var(--text1);}
  .spinner{width:16px;height:16px;border:2px solid var(--bg3);border-top-color:var(--r);border-radius:50%;animation:spin .6s linear infinite;}
  @keyframes spin{to{transform:rotate(360deg);}}
`;
