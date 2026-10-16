import { useState, useEffect } from 'react';

// Metallkunden (#369): Merker (#366) und Portalzugang. Konten liegen in der gas-db
// (ein Konto pro KdNr, Metall als Freigabe), das Portal spricht sie ueber die Gas-Shop-Admin-API an.
// Gaskunden erscheinen hier nur, wenn sie den Merker haben – sonst nur ueber die Suche.

const ZUGANG = {
  keiner: ['', 'Kein Zugang'],
  erstlogin: ['warn', 'Erstanmeldung offen'],
  aktiv: ['ok', 'Aktiv'],
  gesperrt: ['rot', 'Gesperrt'],
};

async function json(r) {
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.detail ? `${data.error}: ${data.detail}` : (data.error || 'Fehler'));
  return data;
}
const post = (url, method = 'POST') => fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(json);

export default function Metallkunden() {
  const [daten, setDaten] = useState({ kunden: [], konto_fehler: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(null);
  const [q, setQ] = useState('');
  const [treffer, setTreffer] = useState(null);
  const [suche, setSuche] = useState(false);

  const melde = t => { setSuccess(t); setTimeout(() => setSuccess(''), 7000); };
  const load = async () => {
    try { setDaten(await json(await fetch('/api/metallarbeiten/kunden'))); }
    catch (e) { setError(`Laden fehlgeschlagen: ${e.message}`); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const tu = async (key, fn, text) => {
    setBusy(key); setError(''); setSuccess('');
    try { const r = await fn(); await load(); if (text) melde(typeof text === 'function' ? text(r) : text); }
    catch (e) { setError(e.message); }
    finally { setBusy(null); }
  };

  const suchen = async e => {
    e?.preventDefault();
    if (q.trim().length < 2) { setError('Bitte mindestens 2 Zeichen eingeben'); return; }
    setSuche(true); setError('');
    try { setTreffer(await json(await fetch(`/api/metallarbeiten/kunden/suche?q=${encodeURIComponent(q.trim())}`))); }
    catch (err) { setError(err.message); setTreffer(null); }
    finally { setSuche(false); }
  };

  const markieren = t => tu(`m-${t.lexware_kontakt_id}`, async () => {
    const r = await json(await fetch('/api/metallarbeiten/kunden', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lexware_kontakt_id: t.lexware_kontakt_id }),
    }));
    setTreffer(list => list && list.map(x => x.lexware_kontakt_id === t.lexware_kontakt_id ? { ...x, ist_metallkunde: true } : x));
    return r;
  }, r => r.notiz_status === 'fehler' ? `${t.name} ist Metallkunde – die Lexware-Notiz konnte nicht geschrieben werden: ${r.notiz_fehler}` : `${t.name} ist jetzt Metallkunde.`);

  const basis = k => `/api/metallarbeiten/kunden/${k.id}`;
  const zugang = k => tu(`z-${k.id}`, () => post(`${basis(k)}/zugang`), `Zugang für ${k.name} angelegt – jetzt den Zugangsbrief drucken.`);
  const sperren = k => {
    if (!window.confirm(`Metall-Zugang für ${k.name} sperren?\n\nGas-Bestellungen sind davon nicht betroffen.`)) return;
    tu(`s-${k.id}`, () => post(`${basis(k)}/sperren`), `Metall-Zugang für ${k.name} gesperrt.`);
  };
  const entsperren = k => tu(`e-${k.id}`, () => post(`${basis(k)}/entsperren`), `Metall-Zugang für ${k.name} wieder offen.`);
  const reset = k => {
    if (!window.confirm(`${k.name} einen Link für ein neues Passwort per E-Mail schicken?\n\nDas bisherige Passwort gilt weiter, bis der Kunde ein neues festlegt (gilt auch für Gas).`)) return;
    tu(`r-${k.id}`, () => post(`${basis(k)}/reset-mail`), r => `Link für ein neues Passwort an ${r.gesendet_an} geschickt (${r.gueltig_stunden} Stunden gültig).`);
  };
  const entfernen = k => {
    if (!window.confirm(`${k.name} nicht mehr als Metallkunde führen?\n\n„METALL“ bleibt in der Lexware-Notiz stehen, ein Portalzugang bleibt bestehen.`)) return;
    tu(`x-${k.id}`, () => post(basis(k), 'DELETE'), `${k.name} ist kein Metallkunde mehr.`);
  };
  const notiz = k => tu(`n-${k.id}`, () => post(`${basis(k)}/notiz`), 'Notiz neu geschrieben.');

  const kunden = daten.kunden;

  return (
    <div className="mk-root">
      <div className="mk-hdr">
        <div><h1 className="mk-title">Metallkunden</h1>
          <p className="mk-sub">Lexware-Kunden mit Merker „Metall“ und ihr Zugang zum Kundenportal. Gaskunden bleiben unter Gashandel; Kunden mit beiden Bereichen haben ein gemeinsames Konto.</p></div>
      </div>

      {error && <div className="alert alert--error">{error}</div>}
      {success && <div className="alert alert--success">{success}</div>}
      {daten.konto_fehler && <div className="alert alert--warn">Portalzugänge gerade nicht abrufbar (Gas-Shop): {daten.konto_fehler}</div>}
      <div className="mk-note">Die Anmeldung für Metallkunden wird mit dem Kundenbereich freigeschaltet. Zugangsbriefe erst danach verschicken.</div>

      <form className="card mk-search" onSubmit={suchen}>
        <input className="mk-inp" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Lexware-Kunde suchen (Name oder Kundennummer) …" aria-label="Lexware-Kunde suchen" />
        <button className="btn btn-ghost" disabled={suche}>{suche ? 'Suche…' : 'Suchen'}</button>
        {treffer && (
          <div className="mk-treffer">
            {treffer.length === 0 ? <div className="mk-small">Kein Lexware-Kunde gefunden.</div> : treffer.map(t => (
              <div key={t.lexware_kontakt_id} className="mk-t">
                <span className="mk-nr">{t.kdnr || '–'}</span>
                <span className="mk-name">{t.name}</span>
                <span>{t.gaskunde && <span className="mk-chip">Gas</span>}{t.ist_metallkunde && <span className="mk-chip mk-chip--metall">Metall</span>}</span>
                {t.ist_metallkunde ? <span className="mk-small">schon Metallkunde</span>
                  : <button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => markieren(t)}>
                    {busy === `m-${t.lexware_kontakt_id}` ? '…' : 'Als Metallkunde führen'}</button>}
              </div>
            ))}
          </div>
        )}
      </form>

      {loading ? <div className="mk-loading"><div className="spinner" />Lade Metallkunden…</div>
        : kunden.length === 0 ? <div className="mk-empty">Noch keine Metallkunden – oben einen Lexware-Kunden suchen und als Metallkunde führen.</div>
        : <div className="mk-table">
          <div className="mk-row mk-head"><span>KdNr</span><span>Kunde</span><span>Bereiche</span><span>Portalzugang</span><span>Laufend</span><span /></div>
          {kunden.map(k => {
            const z = k.konto;
            const [ton, text] = z ? ZUGANG[z.status] || ['', z.status] : ['', 'unbekannt'];
            const b = key => busy === `${key}-${k.id}`;
            return (
              <div key={k.id} className="mk-row mk-item">
                <span className="mk-nr">{k.kdnr || '–'}</span>
                <span className="mk-kunde">
                  <span className="mk-name">{k.name}</span>
                  {k.notiz_status === 'fehler' && <span className="mk-small mk-warn">Lexware-Notiz fehlt · <button className="mk-link" onClick={() => notiz(k)} disabled={!!busy}>erneut schreiben</button></span>}
                  {k.belege_offen > 0 && <span className="mk-small">{k.belege_offen} Beleg{k.belege_offen === 1 ? '' : 'e'} zuzuordnen</span>}
                </span>
                <span>{z?.gas && <span className="mk-chip">Gas</span>}<span className="mk-chip mk-chip--metall">Metall</span></span>
                <span>
                  <span className={`mk-chip mk-chip--${ton}`}>{text}</span>
                  {z?.status === 'aktiv' && z.erster_login_am && <span className="mk-small mk-block">seit {new Date(z.erster_login_am).toLocaleDateString('de-DE')}</span>}
                  {z && z.status !== 'keiner' && !z.email && <span className="mk-small mk-block mk-warn">keine E-Mail</span>}
                </span>
                <span className="mk-num">{k.vorgaenge_laufend}<span className="mk-m"> laufend</span></span>
                <span className="mk-acts">
                  {z?.status === 'keiner' && <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => zugang(k)}>{b('z') ? '…' : 'Zugang anlegen'}</button>}
                  {z && ['erstlogin', 'aktiv'].includes(z.status) && <a className="btn btn-ghost btn-sm" href={`${basis(k)}/zugangsbrief.pdf`} target="_blank" rel="noopener">Zugangsbrief (PDF)</a>}
                  {z?.status === 'aktiv' && <button className="btn btn-ghost btn-sm" disabled={!!busy || !z.email} title={z.email ? '' : 'Keine E-Mail-Adresse – Zugangsbrief nutzen'} onClick={() => reset(k)}>{b('r') ? '…' : 'Zugang zurücksetzen'}</button>}
                  {z && ['erstlogin', 'aktiv'].includes(z.status) && <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => sperren(k)}>{b('s') ? '…' : 'Sperren'}</button>}
                  {z?.status === 'gesperrt' && <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => entsperren(k)}>{b('e') ? '…' : 'Entsperren'}</button>}
                  <button className="btn btn-ghost btn-sm mk-x" disabled={!!busy} title="Nicht mehr als Metallkunde führen" onClick={() => entfernen(k)}>✕</button>
                </span>
              </div>
            );
          })}
        </div>}

      <style>{`
        .mk-root{padding:18px;max-width:1180px;}
        .mk-hdr{margin-bottom:14px;}
        .mk-title{font-size:20px;font-weight:700;color:var(--text1);margin:0 0 4px;}
        .mk-sub{font-size:13px;color:var(--text3);margin:0;max-width:80ch;}
        .alert{padding:10px 14px;border-radius:7px;font-size:13px;margin-bottom:12px;}
        .alert--error{background:#3a1515;border:1px solid var(--red2);color:var(--red2);}
        .alert--success{background:#0e2e1e;border:1px solid var(--green);color:var(--green);}
        .alert--warn{background:#2b1f0d;border:1px solid #f5a74266;color:#f5a742;}
        .mk-note{font-size:12px;color:var(--text2);background:var(--bg1);border:1px solid var(--border);border-left:3px solid #4a8fe7;border-radius:7px;padding:8px 12px;margin-bottom:12px;}
        .card{background:var(--bg1);border:1px solid var(--border);border-radius:9px;}
        .mk-search{display:flex;flex-wrap:wrap;gap:10px;padding:12px;margin-bottom:14px;}
        .mk-inp{flex:1 1 260px;background:var(--bg2);border:1px solid var(--border);border-radius:7px;padding:8px 12px;color:var(--text1);font-size:14px;font-family:inherit;}
        .mk-inp:focus{outline:none;border-color:var(--r);}
        .mk-treffer{flex-basis:100%;display:flex;flex-direction:column;border-top:1px solid var(--border);padding-top:6px;}
        .mk-t{display:grid;grid-template-columns:80px minmax(0,1fr) auto auto;gap:10px;align-items:center;padding:6px 2px;font-size:13px;color:var(--text1);}
        .mk-loading{display:flex;gap:10px;align-items:center;color:var(--text2);padding:30px 0;}
        .mk-empty{color:var(--text3);font-size:13px;padding:30px 0;}
        .mk-table{background:var(--bg1);border:1px solid var(--border);border-radius:9px;overflow:hidden;}
        .mk-row{display:grid;grid-template-columns:80px minmax(0,1.4fr) 120px 170px 70px minmax(0,1.6fr);gap:12px;align-items:center;padding:10px 14px;}
        .mk-head{font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;background:var(--bg2);border-bottom:1px solid var(--border);}
        .mk-item{border-bottom:1px solid var(--border);}
        .mk-item:last-child{border-bottom:none;}
        .mk-nr{font-family:'DM Mono',monospace;font-size:12px;color:var(--text1);}
        .mk-kunde{display:flex;flex-direction:column;gap:2px;min-width:0;}
        .mk-name{font-size:13px;font-weight:600;color:var(--text1);overflow-wrap:anywhere;}
        .mk-small{font-size:11px;color:var(--text3);}
        .mk-block{display:block;margin-top:3px;}
        .mk-warn{color:#f5a742;}
        .mk-num{font-size:13px;color:var(--text1);font-variant-numeric:tabular-nums;}
        .mk-chip{display:inline-block;white-space:nowrap;font-size:11px;font-weight:600;padding:2px 8px;border-radius:10px;background:var(--bg2);border:1px solid var(--border);color:var(--text2);margin-right:4px;}
        .mk-chip--metall{color:#e66;border-color:#e6666655;}
        .mk-chip--ok{color:#2ebd7a;border-color:#2ebd7a44;background:#0d2318;}
        .mk-chip--warn{color:#f5a742;border-color:#f5a74244;background:#2b1f0d;}
        .mk-chip--rot{color:var(--red2);border-color:var(--red2);background:#3a1515;}
        .mk-acts{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end;}
        .mk-link{background:none;border:none;padding:0;color:#6aa8f0;cursor:pointer;font:inherit;text-decoration:underline;}
        .mk-x{color:var(--text3);}
        .mk-m{display:none;font-size:11px;color:var(--text3);}
        @media (max-width:900px){
          .mk-head{display:none;}
          .mk-row{grid-template-columns:auto 1fr auto;gap:6px 10px;}
          .mk-acts{grid-column:1 / -1;justify-content:flex-start;}
          .mk-m{display:inline;}
          .mk-t{grid-template-columns:auto 1fr;}
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
      `}</style>
    </div>
  );
}
