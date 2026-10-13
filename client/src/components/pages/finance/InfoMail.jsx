// Info-Mail an die Gaskunden zum Shop-Rollout (#319)
// Welle 1: Mail an alle Shop-Kunden mit Adresse · Welle 2: Briefe für Kunden ohne Mail (Fahrer)
// Welle 3: Mail an alle ohne First Login. Versand über das admin-backend (Microsoft Graph).
import { useState, useEffect, useRef } from 'react';

const S = {
  card: { background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 10, padding: '1rem 1.1rem', marginBottom: '.75rem' },
  label: { display: 'block', fontSize: '.75rem', color: 'var(--text2)', marginBottom: '.25rem' },
  input: { background: 'var(--bg0)', border: '1px solid var(--border)', borderRadius: 6, padding: '.45rem .6rem', color: 'var(--text1)', fontSize: '.85rem', outline: 'none', width: '100%', fontFamily: 'inherit', boxSizing: 'border-box' },
  btn: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text1)', cursor: 'pointer', padding: '.4rem .8rem', fontSize: '.8rem' },
  btnPrimary: { background: 'var(--r, #c40000)', border: '1px solid var(--r, #c40000)', borderRadius: 6, color: '#fff', cursor: 'pointer', padding: '.45rem .9rem', fontSize: '.82rem', fontWeight: 600 },
  th: { textAlign: 'left', padding: '.45rem .6rem', fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text3)', whiteSpace: 'nowrap' },
  td: { padding: '.4rem .6rem', fontSize: '.8rem', color: 'var(--text2)', borderTop: '1px solid var(--border)' },
};

const WAVES = [
  [1, 'Welle 1 · Mail', 'Alle Shop-Kunden (SER + Lexware) mit Mailadresse – Haupt-Mail, sonst Rechnungs-Mail.'],
  [2, 'Welle 2 · Brief', 'Shop-Kunden ohne Mailadresse – Brief mit QR-Code zum Ausdrucken, die Fahrer nehmen ihn mit.'],
  [3, 'Welle 3 · Erinnerung', 'Kunden mit Mailadresse, die sich noch nicht im Shop angemeldet haben (kein First Login).'],
];

const fmt = v => v ? new Date(v).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

function fill(tpl, c) {
  const v = { name: esc(c.name), kundennummer: esc(c.customer_number), login_link: esc(c.login_link), shop_url: 'https://shop.randl.group' };
  return String(tpl || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (k in v ? v[k] : m));
}

function printLetters(customers, tpl) {
  const pages = customers.map(c => `
    <section class="page">
      <div class="addr">${esc(c.name)}<br>${esc(c.street)}<br>${esc(c.zip)} ${esc(c.city)}</div>
      <div class="body">${fill(tpl, c)}</div>
      <div class="qr"><img src="${c.qr}" alt=""><div>Mit dem Handy scannen und direkt anmelden<br>Kundennummer ${esc(c.customer_number)}</div></div>
    </section>`).join('');
  const w = window.open('', '_blank');
  if (!w) { alert('Pop-up blockiert – bitte für das Portal erlauben.'); return; }
  w.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Info-Brief Gasshop</title><style>
    @page { size: A4; margin: 20mm; }
    body { font-family: Arial, sans-serif; font-size: 11pt; color: #000; margin: 0; }
    .page { page-break-after: always; min-height: 250mm; }
    .addr { margin: 25mm 0 15mm; line-height: 1.4; }
    .qr { display: flex; gap: 6mm; align-items: center; margin-top: 10mm; font-size: 10pt; }
    .qr img { width: 40mm; height: 40mm; }
  </style></head><body>${pages}<script>window.onload = () => window.print();<\/script></body></html>`);
  w.document.close();
}

export default function InfoMail() {
  const [tpl, setTpl] = useState(null);
  const [saving, setSaving] = useState(false);
  const [wave, setWave] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [testTo, setTestTo] = useState('');
  const [job, setJob] = useState(null);
  const poll = useRef(null);

  const loadTemplate = async () => {
    const r = await fetch('/api/finance/info-mail/template');
    setTpl(await r.json());
  };
  const loadRecipients = async (w = wave) => {
    setLoading(true); setError('');
    try {
      const r = await fetch('/api/finance/info-mail/recipients?wave=' + w);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Fehler');
      setData(d);
    } catch (e) { setError(e.message); setData(null); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadTemplate(); }, []);
  useEffect(() => { loadRecipients(wave); }, [wave]);
  useEffect(() => () => clearInterval(poll.current), []);

  const saveTemplate = async () => {
    setSaving(true); setError(''); setInfo('');
    try {
      const r = await fetch('/api/finance/info-mail/template', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject: tpl.subject, html: tpl.html, letter: tpl.letter }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Fehler');
      setTpl(d); setInfo('Vorlage gespeichert.');
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const uploadPdf = async (file) => {
    if (!file) return;
    setError(''); setInfo('');
    const r = await fetch('/api/finance/info-mail/pdf', { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: file });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setError(d.error || 'Upload fehlgeschlagen'); return; }
    setTpl(t => ({ ...t, pdf: d.pdf })); setInfo('Anleitung hochgeladen.');
  };

  const send = async (test) => {
    setError(''); setInfo('');
    const open = (data?.customers || []).filter(c => !c.sent_at).length;
    if (!test && !window.confirm(`Info-Mail (Welle ${wave}) jetzt an ${open} Kunden senden?\n\nBereits angeschriebene Kunden werden übersprungen.`)) return;
    const r = await fetch('/api/finance/info-mail/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wave, test_to: test ? testTo : undefined }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setError(d.error || 'Versand fehlgeschlagen'); return; }
    if (test) { setInfo(`Testmail an ${d.sentTo} gesendet (Beispielkunde: ${d.sample}).`); return; }
    setJob({ total: d.total, done: 0, sent: 0, errors: [], finished: d.total === 0 });
    clearInterval(poll.current);
    poll.current = setInterval(async () => {
      const jr = await fetch('/api/finance/info-mail/jobs/' + d.jobId);
      const j = await jr.json().catch(() => null);
      if (!jr.ok || !j) { clearInterval(poll.current); return; }
      setJob(j);
      if (j.finished) { clearInterval(poll.current); loadRecipients(wave); }
    }, 2000);
  };

  const customers = data?.customers || [];
  const open = customers.filter(c => !c.sent_at).length;
  const running = job && !job.finished;

  return (
    <div style={{ maxWidth: 1000 }}>
      <h1 style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--text1)' }}>Info-Mail Rollout</h1>
      <p style={{ color: 'var(--text2)', fontSize: '.8rem', margin: '.2rem 0 1rem' }}>
        Gasshop-Rollout: Kunden über den neuen Shop informieren. Versand als <strong>bestellung@randl.group</strong>; jeder Kunde wird pro Welle nur einmal angeschrieben.
      </p>

      {error && <div style={{ ...S.card, borderColor: 'rgba(224,80,80,.4)', color: 'var(--red2)' }}>✗ {error}</div>}
      {info && <div style={{ ...S.card, borderColor: 'rgba(46,189,122,.4)', color: 'var(--green)' }}>✓ {info}</div>}

      {tpl && (
        <div style={S.card}>
          <div style={{ fontWeight: 600, color: 'var(--text1)', marginBottom: '.6rem' }}>Vorlage</div>
          <label style={S.label}>Betreff</label>
          <input style={{ ...S.input, marginBottom: '.6rem' }} value={tpl.subject || ''} onChange={e => setTpl({ ...tpl, subject: e.target.value })} />
          <label style={S.label}>Mailtext (HTML) – Platzhalter: {'{{name}}'}, {'{{kundennummer}}'}, {'{{login_link}}'}, {'{{shop_url}}'}</label>
          <textarea style={{ ...S.input, minHeight: 180, fontFamily: 'DM Mono, monospace', fontSize: '.78rem' }} value={tpl.html || ''} onChange={e => setTpl({ ...tpl, html: e.target.value })} />
          <label style={{ ...S.label, marginTop: '.6rem' }}>Brieftext für Welle 2 (HTML, leer = Mailtext) – QR-Code und Anschrift kommen automatisch dazu</label>
          <textarea style={{ ...S.input, minHeight: 100, fontFamily: 'DM Mono, monospace', fontSize: '.78rem' }} value={tpl.letter || ''} onChange={e => setTpl({ ...tpl, letter: e.target.value })} />
          <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '.7rem' }}>
            <button style={S.btnPrimary} disabled={saving} onClick={saveTemplate}>{saving ? '…' : 'Vorlage speichern'}</button>
            <span style={{ fontSize: '.78rem', color: 'var(--text2)' }}>
              PDF-Anleitung: {tpl.pdf?.exists
                ? <><a href="/api/finance/info-mail/pdf" target="_blank" rel="noreferrer">vorhanden</a> ({Math.round(tpl.pdf.size / 1024)} KB, {fmt(tpl.pdf.updated_at)})</>
                : <strong style={{ color: 'var(--red2)' }}>fehlt</strong>}
            </span>
            <label style={{ ...S.btn, display: 'inline-block' }}>
              PDF hochladen
              <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={e => { uploadPdf(e.target.files[0]); e.target.value = ''; }} />
            </label>
            {tpl.updated_at && <span style={{ fontSize: '.72rem', color: 'var(--text3)' }}>gespeichert {fmt(tpl.updated_at)}{tpl.updated_by ? ' von ' + tpl.updated_by : ''}</span>}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '.4rem', marginBottom: '.6rem', flexWrap: 'wrap' }}>
        {WAVES.map(([w, label]) => (
          <button key={w} onClick={() => setWave(w)} style={w === wave ? S.btnPrimary : S.btn}>{label}</button>
        ))}
      </div>

      <div style={S.card}>
        <p style={{ fontSize: '.8rem', color: 'var(--text2)', margin: '0 0 .7rem' }}>{WAVES.find(x => x[0] === wave)[2]}</p>
        {loading ? <div style={{ color: 'var(--text3)' }}>Lade Empfänger…</div> : data && (
          <>
            <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '.8rem' }}>
              <strong style={{ color: 'var(--text1)' }}>{data.total} Kunden</strong>
              {wave !== 2 && <span style={{ fontSize: '.8rem', color: 'var(--text2)' }}>{data.sent} bereits angeschrieben · {open} offen</span>}
              {wave === 2 ? (
                <button style={S.btnPrimary} disabled={!customers.length} onClick={() => printLetters(customers, tpl?.letter?.trim() ? tpl.letter : tpl?.html)}>
                  Briefe drucken ({customers.length})
                </button>
              ) : (
                <>
                  <input style={{ ...S.input, width: 230 }} placeholder="Testmail an …" value={testTo} onChange={e => setTestTo(e.target.value)} />
                  <button style={S.btn} disabled={!testTo || running} onClick={() => send(true)}>Test senden</button>
                  <button style={S.btnPrimary} disabled={!open || running} onClick={() => send(false)}>An {open} Kunden senden</button>
                </>
              )}
            </div>
            {!tpl?.pdf?.exists && wave !== 2 && <div style={{ fontSize: '.78rem', color: 'var(--amber, #c80)', marginBottom: '.6rem' }}>Hinweis: Ohne hochgeladene PDF geht die Mail ohne Anleitung raus.</div>}
            {job && (
              <div style={{ fontSize: '.8rem', color: 'var(--text2)', marginBottom: '.8rem' }}>
                {job.finished ? 'Fertig: ' : 'Versand läuft: '}{job.done}/{job.total} · {job.sent} gesendet · {job.errors.length} Fehler
                {job.errors.length > 0 && (
                  <ul style={{ color: 'var(--red2)', margin: '.3rem 0 0', paddingLeft: '1.1rem' }}>
                    {job.errors.map((e, i) => <li key={i}>{e.customer_number} · {e.recipient}: {e.error}</li>)}
                  </ul>
                )}
              </div>
            )}
            <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={S.th}>KD-Nr</th><th style={S.th}>Name</th>
                  <th style={S.th}>{wave === 2 ? 'Anschrift' : 'E-Mail'}</th>
                  <th style={S.th}>First Login</th>
                  {wave !== 2 && <th style={S.th}>Angeschrieben</th>}
                </tr></thead>
                <tbody>
                  {customers.map(c => (
                    <tr key={c.id}>
                      <td style={{ ...S.td, fontFamily: 'DM Mono, monospace' }}>{c.customer_number}</td>
                      <td style={{ ...S.td, color: 'var(--text1)' }}>{c.name}</td>
                      <td style={S.td}>{wave === 2 ? `${c.street || ''}, ${c.zip || ''} ${c.city || ''}` : c.recipient}</td>
                      <td style={S.td}>{c.first_login_at ? '✓ ' + new Date(c.first_login_at).toLocaleDateString('de-DE') : '✗'}</td>
                      {wave !== 2 && <td style={S.td}>{c.sent_at ? fmt(c.sent_at) : '—'}</td>}
                    </tr>
                  ))}
                  {!customers.length && <tr><td colSpan={5} style={{ ...S.td, textAlign: 'center', color: 'var(--text3)' }}>Keine Kunden in dieser Welle.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
