import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

// „Eingang“ (#371): Anfragen, Nachbestellungen, Online-Annahmen und Freischaltungs-Anfragen aus dem
// Kundenbereich. Von hier zum Vorgang („In Lexware anlegen“) bzw. zu den Metallkunden („Zugang anlegen“),
// danach als erledigt markieren. Eine verworfene Anfrage im Vorgang abbrechen, dann hier „Abgelehnt“.

const fmtZeit = d => d ? new Date(d).toLocaleString('de-DE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const eur = x => x == null ? '' : Number(x).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const ART = { anfrage: 'Neue Anfrage', nachbestellung: 'Nachbestellung', annahme: 'Angebot angenommen', freischaltung: 'Freischaltung Metall' };
const KURZ = { anfrage: 'AF', nachbestellung: 'NB', annahme: 'OK', freischaltung: 'FR' };
const STATUS = { erledigt: 'erledigt', abgelehnt: 'abgelehnt', neu: 'neu' };

// Sidebar-Zaehler neu laden lassen
const meldeAenderung = () => window.dispatchEvent(new Event('metall-eingang-geaendert'));

async function json(r) {
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Fehler');
  return data;
}
const post = url => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(json);

function MailHinweis({ e }) {
  if (e.mail_gesendet_am) return null;
  if (e.mail_fehler) return <div className="me-mail me-mail--err">Mail ans Büro fehlgeschlagen: {e.mail_fehler}</div>;
  return <div className="me-mail">Mail ans Büro noch nicht bestätigt</div>;
}

function Ziel({ e }) {
  if (e.art === 'freischaltung') return <Link className="btn btn-primary" to="/metallarbeiten/kunden">Zu Metallkunden</Link>;
  if (e.vorgang_id) return <Link className="btn btn-primary" to={`/metallarbeiten/vorgaenge/${e.vorgang_id}`}>Zum Vorgang</Link>;
  return null;
}

export default function Eingang() {
  const [daten, setDaten] = useState({ neu: [], bearbeitet: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(null);
  const [zeigeBearbeitet, setZeigeBearbeitet] = useState(false);

  const melde = text => { setSuccess(text); setTimeout(() => setSuccess(''), 6000); };

  const load = async () => {
    try {
      setLoading(true);
      setDaten(await json(await fetch('/api/metallarbeiten/eingang')));
    } catch (e) { setError(`Laden fehlgeschlagen: ${e.message}`); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const setze = async (e, aktion, text) => {
    setBusy(e.id); setError(''); setSuccess('');
    try {
      await post(`/api/metallarbeiten/eingang/${e.id}/${aktion}`);
      melde(text);
      await load();
      meldeAenderung();
    } catch (err) { setError(err.message); }
    finally { setBusy(null); }
  };

  const titel = e => `${ART[e.art]}${e.vorgangsnummer ? ` · ${e.vorgangsnummer}` : ''}`;

  return (
    <div className="me-root">
      <div className="me-hdr">
        <div><h1 className="me-title">Eingang</h1><p className="me-sub">Metallarbeiten — Anfragen, Nachbestellungen, Annahmen und Freischaltungen aus dem Kundenbereich</p></div>
        <button className="btn btn-ghost" onClick={load} disabled={loading}>Neu laden</button>
      </div>

      {error && <div className="alert alert--error">{error}</div>}
      {success && <div className="alert alert--success">{success}</div>}

      {loading ? <div className="me-loading"><div className="spinner" />Lade Eingang…</div>
        : daten.neu.length === 0 ? <div className="card me-empty">Nichts Neues.</div>
        : <div className="me-list">
          {daten.neu.map(e => (
            <div key={e.id} className="card me-item">
              <div className="me-main">
                <span className={`me-ic me-ic--${e.art}`}>{KURZ[e.art]}</span>
                <div className="me-info">
                  <div><b>{titel(e)}</b> · {e.kunde_name || 'unbekannter Kunde'}{e.kdnr ? ` (${e.kdnr})` : ''}</div>
                  <div className="me-meta">
                    {fmtZeit(e.erstellt_am)}
                    {e.bezeichnung ? ` · ${e.bezeichnung}` : ''}
                    {e.kunden_bestellnr ? ` · Bestellnr. ${e.kunden_bestellnr}` : ''}
                    {e.kunde_email ? ` · ${e.kunde_email}` : ''}
                  </div>
                  {e.art === 'annahme' && e.angebot_belegnummer && (
                    <div className="me-meta">Angebot {e.angebot_belegnummer} · {eur(e.angebot_betrag_brutto)} brutto · angenommen {fmtZeit(e.angenommen_am)}</div>
                  )}
                  {e.abgebrochen_am && <div className="me-meta me-warn">Vorgang ist abgebrochen</div>}
                  {e.nachricht && <div className="me-msg">{e.nachricht}</div>}
                  <MailHinweis e={e} />
                </div>
              </div>
              <div className="me-acts">
                <Ziel e={e} />
                <button className="btn btn-ghost" disabled={busy !== null} onClick={() => setze(e, 'erledigt', `${titel(e)} erledigt.`)}>
                  {busy === e.id ? 'Bitte warten…' : 'Erledigt'}
                </button>
                <button className="btn btn-ghost me-ign" disabled={busy !== null} onClick={() => setze(e, 'abgelehnt', `${titel(e)} abgelehnt.`)}
                  title={e.vorgang_id ? 'Nur der Eingang – den Vorgang bitte im Vorgang abbrechen' : undefined}>Abgelehnt</button>
              </div>
            </div>
          ))}
        </div>}

      {daten.bearbeitet.length > 0 && (
        <div className="me-done">
          <button className="me-link" onClick={() => setZeigeBearbeitet(v => !v)}>
            {zeigeBearbeitet ? '▾' : '▸'} Bearbeitet (letzte 30 Tage): {daten.bearbeitet.length}
          </button>
          {zeigeBearbeitet && daten.bearbeitet.map(e => (
            <div key={e.id} className="me-done-row">
              <span>{titel(e)} · {e.kunde_name || '–'} · {STATUS[e.status]} {fmtZeit(e.erledigt_am)}{e.erledigt_von_name ? ` von ${e.erledigt_von_name}` : ''}</span>
              <button className="btn btn-ghost" disabled={busy !== null} onClick={() => setze(e, 'zurueckholen', `${titel(e)} ist wieder neu.`)}>Zurückholen</button>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .me-root{padding:18px;max-width:900px;}
        .me-hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;gap:12px;}
        .me-title{font-size:20px;font-weight:700;color:var(--text1);margin:0 0 4px;}
        .me-sub{font-size:13px;color:var(--text3);margin:0;}
        .me-loading{display:flex;gap:10px;align-items:center;color:var(--text2);padding:30px 0;}
        .me-empty{padding:24px;text-align:center;color:var(--text3);font-size:13px;}
        .alert{padding:10px 14px;border-radius:7px;font-size:13px;margin-bottom:14px;}
        .alert--error{background:#3a1515;border:1px solid var(--red2);color:var(--red2);}
        .alert--success{background:#0e2e1e;border:1px solid var(--green);color:var(--green);}
        .card{background:var(--bg1);border:1px solid var(--border);border-radius:9px;}
        .me-list{display:flex;flex-direction:column;gap:10px;}
        .me-item{padding:14px 16px;}
        .me-main{display:flex;gap:12px;align-items:flex-start;}
        .me-ic{flex-shrink:0;width:34px;height:34px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;background:var(--bg2);border:1px solid var(--border);color:var(--text2);font-family:'DM Mono',monospace;}
        .me-ic--anfrage{color:#5aa9e6;border-color:#5aa9e655;}
        .me-ic--nachbestellung{color:#5aa9e6;border-color:#5aa9e655;}
        .me-ic--annahme{color:#2ebd7a;border-color:#2ebd7a55;}
        .me-ic--freischaltung{color:#e8a020;border-color:#e8a02055;}
        .me-info{min-width:0;font-size:13px;color:var(--text1);display:flex;flex-direction:column;gap:3px;}
        .me-meta{font-size:12px;color:var(--text3);overflow-wrap:anywhere;}
        .me-warn{color:#e8a020;}
        .me-msg{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;color:var(--text1);border-left:3px solid var(--r);padding:6px 10px;background:var(--bg2);border-radius:0 6px 6px 0;margin-top:4px;}
        .me-mail{font-size:11.5px;color:var(--text3);margin-top:2px;}
        .me-mail--err{color:var(--red2);}
        .me-acts{margin-top:10px;padding-top:10px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;}
        .me-ign{color:var(--text3);}
        .me-done{margin-top:22px;}
        .me-link{background:none;border:none;color:var(--text3);font-size:12.5px;cursor:pointer;padding:0;font-family:inherit;}
        .me-done-row{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:13px;color:var(--text2);padding:6px 0;border-bottom:1px solid var(--border);}
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
