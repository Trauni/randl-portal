import { useState, useEffect } from 'react';

// „Belege zuordnen“ (#370): Belege, die der Sync nicht sicher zuordnen konnte.
// Vorschlag bestaetigen, anderen Vorgang waehlen, neuen Vorgang anlegen oder „Kein Metallauftrag“.

const fmt = d => d ? new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const eur = x => x == null ? '' : Number(x).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const STATUS = { draft: 'Entwurf', open: 'offen', accepted: 'angenommen', rejected: 'abgelehnt', voided: 'storniert', paid: 'bezahlt', paidoff: 'bezahlt', overdue: 'überfällig' };
const KUERZEL = { quotation: 'AN', orderconfirmation: 'AB', deliverynote: 'LS', invoice: 'RE' };

// Sidebar-Zaehler neu laden lassen
const meldeAenderung = () => window.dispatchEvent(new Event('metall-zuordnen-geaendert'));

async function json(r) {
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Fehler');
  return data;
}
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then(json);

export default function Zuordnen() {
  const [daten, setDaten] = useState({ offen: [], doppelt: [], ignoriert: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(null);       // Beleg-ID waehrend einer Aktion
  const [offen, setOffen] = useState(null);     // { id, modus: 'anderer' | 'neu' }
  const [vorgaenge, setVorgaenge] = useState([]);
  const [wahl, setWahl] = useState('');
  const [neu, setNeu] = useState({ bezeichnung: '', kunden_bestellnr: '' });
  const [zeigeIgnoriert, setZeigeIgnoriert] = useState(false);

  const melde = text => { setSuccess(text); setTimeout(() => setSuccess(''), 6000); };

  const load = async () => {
    try {
      setLoading(true);
      setDaten(await json(await fetch('/api/metallarbeiten/zuordnen')));
    } catch (e) { setError(`Laden fehlgeschlagen: ${e.message}`); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const tue = async (b, fn, text) => {
    setBusy(b.id); setError(''); setSuccess('');
    try {
      const r = await fn();
      melde(text(r));
      setOffen(null);
      await load();
      meldeAenderung();
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  };

  const oeffne = async (b, modus) => {
    if (offen?.id === b.id && offen.modus === modus) { setOffen(null); return; }
    setOffen({ id: b.id, modus }); setWahl(''); setError('');
    if (modus === 'anderer') {
      setVorgaenge([]);
      try { setVorgaenge((await json(await fetch(`/api/metallarbeiten/vorgaenge/auswahl?kunde_id=${b.kunde_id}`))).vorgaenge); }
      catch (e) { setError(e.message); }
    } else {
      setNeu({ bezeichnung: '', kunden_bestellnr: '' });
    }
  };

  const zuordnen = (b, vorgangId, nr) => tue(b,
    () => post(`/api/metallarbeiten/zuordnen/${b.id}/zuordnen`, { vorgang_id: vorgangId }),
    () => `${b.belegnummer || 'Beleg'} wurde ${nr} zugeordnet.`);

  const neuerVorgang = b => {
    if (!neu.bezeichnung.trim()) { setError('Bitte eine Bezeichnung für den neuen Vorgang eingeben'); return; }
    tue(b, () => post(`/api/metallarbeiten/zuordnen/${b.id}/neuer-vorgang`, neu),
      r => `Vorgang ${r.vorgangsnummer} angelegt, ${b.belegnummer || 'Beleg'} zugeordnet.`);
  };

  const ignorieren = b => tue(b, () => post(`/api/metallarbeiten/zuordnen/${b.id}/ignorieren`),
    () => `${b.belegnummer || 'Beleg'} als „Kein Metallauftrag“ markiert.`);

  const zurueckholen = b => tue(b, () => post(`/api/metallarbeiten/zuordnen/${b.id}/zurueckholen`),
    () => `${b.belegnummer || 'Beleg'} ist wieder im Eingang.`);

  return (
    <div className="mz-root">
      <div className="mz-hdr">
        <div><h1 className="mz-title">Belege zuordnen</h1><p className="mz-sub">Metallarbeiten — Belege aus Lexware, die der Abgleich nicht sicher einem Vorgang zuordnen konnte</p></div>
        <button className="btn btn-ghost" onClick={load} disabled={loading}>Neu laden</button>
      </div>

      {error && <div className="alert alert--error">{error}</div>}
      {success && <div className="alert alert--success">{success}</div>}

      {daten.doppelt.length > 0 && (
        <div className="card mz-warn">
          <div className="mz-warn-title">Doppelte AB prüfen</div>
          {daten.doppelt.map(d => (
            <div key={d.id} className="mz-warn-row"><b>{d.vorgangsnummer}</b> · {d.kunde_name} · {d.bezeichnung} — {d.anzahl} ABs: {d.abs}</div>
          ))}
          <div className="mz-hint">Eine davon in Lexware stornieren oder archivieren; stornierte und archivierte ABs zählen nicht.</div>
        </div>
      )}

      {loading ? <div className="mz-loading"><div className="spinner" />Lade Belege…</div>
        : daten.offen.length === 0 ? <div className="card mz-empty">Alles zugeordnet.</div>
        : <div className="mz-list">
          {daten.offen.map(b => {
            const auf = offen?.id === b.id ? offen.modus : null;
            const gesperrt = busy !== null;
            return (
              <div key={b.id} className="card mz-item">
                <div className="mz-main">
                  <span className={`mz-ic mz-ic--${KUERZEL[b.belegart]}`}>{KUERZEL[b.belegart]}</span>
                  <div className="mz-info">
                    <div><b>{b.art} {b.belegnummer || '(Entwurf)'}</b> · {b.kunde_name || 'unbekannter Kunde'}</div>
                    <div className="mz-meta">
                      {fmt(b.belegdatum)}{b.betrag_netto != null ? ` · ${eur(b.betrag_netto)} netto` : ''} · {STATUS[b.belegstatus] || b.belegstatus}
                      {b.archiviert ? ' · archiviert' : ''}{b.aus_angebot_nr ? ` · aus ${b.aus_angebot_nr}` : ''}
                    </div>
                    {b.einleitung_zeile && <div className="mz-meta">„{b.einleitung_zeile}“</div>}
                    <div className={`mz-sugg${b.vorschlag_nr ? '' : ' mz-sugg--none'}`}>
                      {b.vorschlag_nr ? <>Vorschlag: <b>{b.vorschlag_nr}</b> {b.vorschlag_bez ? `· ${b.vorschlag_bez} ` : ''}({b.grund})</> : <>Kein Vorschlag: {b.grund}</>}
                    </div>
                  </div>
                </div>

                <div className="mz-acts">
                  {b.vorschlag_nr && (
                    <button className="btn btn-primary" disabled={gesperrt} onClick={() => zuordnen(b, b.vorschlag_id, b.vorschlag_nr)}>
                      {busy === b.id ? 'Wird zugeordnet…' : `Zu ${b.vorschlag_nr}`}
                    </button>
                  )}
                  <button className={`btn btn-ghost${auf === 'anderer' ? ' btn--on' : ''}`} disabled={gesperrt || !b.kunde_id} onClick={() => oeffne(b, 'anderer')}>Anderer Vorgang</button>
                  <button className={`btn btn-ghost${auf === 'neu' ? ' btn--on' : ''}`} disabled={gesperrt || !b.kunde_id} onClick={() => oeffne(b, 'neu')}>Neuer Vorgang</button>
                  <button className="btn btn-ghost mz-ign" disabled={gesperrt} onClick={() => ignorieren(b)}>Kein Metallauftrag</button>
                </div>

                {auf === 'anderer' && (
                  <div className="mz-sub-form">
                    <select className="mz-inp" value={wahl} onChange={e => setWahl(e.target.value)}>
                      <option value="">{vorgaenge.length ? '– Vorgang des Kunden wählen –' : 'Keine offenen Vorgänge für diesen Kunden'}</option>
                      {vorgaenge.map(v => <option key={v.id} value={v.id}>{v.vorgangsnummer} · {v.bezeichnung}</option>)}
                    </select>
                    <button className="btn btn-primary" disabled={!wahl || gesperrt}
                      onClick={() => zuordnen(b, Number(wahl), vorgaenge.find(v => String(v.id) === wahl)?.vorgangsnummer)}>Zuordnen</button>
                  </div>
                )}
                {auf === 'neu' && (
                  <div className="mz-sub-form">
                    <input className="mz-inp" placeholder="Bezeichnung, z. B. Geländer Terrasse" maxLength={255} value={neu.bezeichnung}
                      onChange={e => setNeu(n => ({ ...n, bezeichnung: e.target.value }))} />
                    <input className="mz-inp mz-inp--kurz" placeholder="Bestellnr. (optional)" maxLength={100} value={neu.kunden_bestellnr}
                      onChange={e => setNeu(n => ({ ...n, kunden_bestellnr: e.target.value }))} />
                    <button className="btn btn-primary" disabled={gesperrt} onClick={() => neuerVorgang(b)}>Anlegen und zuordnen</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>}

      {daten.ignoriert.length > 0 && (
        <div className="mz-ignoriert">
          <button className="mz-link" onClick={() => setZeigeIgnoriert(v => !v)}>
            {zeigeIgnoriert ? '▾' : '▸'} Als „Kein Metallauftrag“ markiert (letzte 30 Tage): {daten.ignoriert.length}
          </button>
          {zeigeIgnoriert && daten.ignoriert.map(b => (
            <div key={b.id} className="mz-ign-row">
              <span>{b.art} {b.belegnummer || '(Entwurf)'} · {b.kunde_name || '–'} · {fmt(b.belegdatum)}</span>
              <button className="btn btn-ghost" disabled={busy !== null} onClick={() => zurueckholen(b)}>Zurückholen</button>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .mz-root{padding:18px;max-width:900px;}
        .mz-hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;gap:12px;}
        .mz-title{font-size:20px;font-weight:700;color:var(--text1);margin:0 0 4px;}
        .mz-sub{font-size:13px;color:var(--text3);margin:0;}
        .mz-loading{display:flex;gap:10px;align-items:center;color:var(--text2);padding:30px 0;}
        .mz-empty{padding:24px;text-align:center;color:var(--text3);font-size:13px;}
        .alert{padding:10px 14px;border-radius:7px;font-size:13px;margin-bottom:14px;}
        .alert--error{background:#3a1515;border:1px solid var(--red2);color:var(--red2);}
        .alert--success{background:#0e2e1e;border:1px solid var(--green);color:var(--green);}
        .card{background:var(--bg1);border:1px solid var(--border);border-radius:9px;}
        .mz-warn{padding:12px 16px;margin-bottom:14px;border-color:#e8a02066;}
        .mz-warn-title{font-weight:700;color:#e8a020;font-size:13px;margin-bottom:6px;}
        .mz-warn-row{font-size:13px;color:var(--text1);margin:3px 0;}
        .mz-hint{font-size:11px;color:var(--text3);margin-top:6px;}
        .mz-list{display:flex;flex-direction:column;gap:10px;}
        .mz-item{padding:14px 16px;}
        .mz-main{display:flex;gap:12px;align-items:flex-start;}
        .mz-ic{flex-shrink:0;width:34px;height:34px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;background:var(--bg2);border:1px solid var(--border);color:var(--text2);font-family:'DM Mono',monospace;}
        .mz-ic--AB{color:#2ebd7a;border-color:#2ebd7a55;}
        .mz-ic--AN{color:#5aa9e6;border-color:#5aa9e655;}
        .mz-ic--RE{color:#e8a020;border-color:#e8a02055;}
        .mz-info{min-width:0;font-size:13px;color:var(--text1);display:flex;flex-direction:column;gap:3px;}
        .mz-meta{font-size:12px;color:var(--text3);overflow-wrap:anywhere;}
        .mz-sugg{font-size:12.5px;color:#2ebd7a;margin-top:2px;}
        .mz-sugg--none{color:var(--text2);}
        .mz-acts{margin-top:10px;padding-top:10px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;}
        .mz-ign{color:var(--text3);}
        .mz-sub-form{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;}
        .mz-inp{flex:1;min-width:180px;background:var(--bg2);border:1px solid var(--border);border-radius:7px;padding:7px 10px;color:var(--text1);font-size:13px;font-family:inherit;box-sizing:border-box;}
        .mz-inp--kurz{flex:0 1 180px;}
        .mz-inp:focus{outline:none;border-color:var(--r);}
        .mz-ignoriert{margin-top:22px;}
        .mz-link{background:none;border:none;color:var(--text3);font-size:12.5px;cursor:pointer;padding:0;font-family:inherit;}
        .mz-ign-row{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:13px;color:var(--text2);padding:6px 0;border-bottom:1px solid var(--border);}
        .btn{padding:7px 14px;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;border:none;font-family:inherit;transition:background .15s;text-decoration:none;display:inline-flex;align-items:center;}
        .btn-primary{background:var(--r);color:#fff;}
        .btn-primary:hover:not(:disabled){background:var(--r2);}
        .btn:disabled{opacity:.5;cursor:default;}
        .btn-ghost{background:var(--bg2);color:var(--text2);border:1px solid var(--border);}
        .btn-ghost:hover:not(:disabled),.btn--on{background:var(--bg3);color:var(--text1);}
        .spinner{width:16px;height:16px;border:2px solid var(--bg3);border-top-color:var(--r);border-radius:50%;animation:spin .6s linear infinite;}
        @keyframes spin{to{transform:rotate(360deg);}}
      `}</style>
    </div>
  );
}
