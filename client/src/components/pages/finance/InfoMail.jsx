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

const BATCH = 25;   // Briefe je Druckauftrag
const fmt = v => v ? new Date(v).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

function fill(tpl, c) {
  const v = { name: esc(c.name), kundennummer: esc(c.customer_number), login_link: esc(c.login_link), shop_url: 'https://shop.randl.group' };
  return String(tpl || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (k in v ? v[k] : m));
}

// Begrüßungstext auf dem Brief, wenn in der Vorlage kein eigener Brieftext steht (aus dem Kundenflyer)
const DEFAULT_GREETING = '<strong>Hallo {{name}}!</strong><br>Wir freuen uns, euch unser <strong>neues Bestellsystem</strong> vorstellen zu dürfen. '
  + 'Ab sofort könnt ihr ganz einfach online bestellen – ohne Wartezeit, ohne Telefonat, wann immer es euch passt.';

// Icons aus dem Kundenflyer (Uhr, Dokument, Blitz, Handy)
const ICON = {
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  bolt: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  phone: '<rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>',
};
const icon = k => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#CC1111" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;

const FLYER_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  @page { size: A4; margin: 0; }
  body { font-family: Arial, Helvetica, sans-serif; background: #ccc; }
  .page { width: 210mm; height: 297mm; margin: 0 auto 12px; background: #F7F4F0; display: flex; flex-direction: column; overflow: hidden; page-break-after: always; break-after: page; }
  @media print { body { background: none; } .page { margin: 0; } }
  .top-stripe { background: #2C2320; height: 5px; }
  .header { background: #2C2320; padding: 14px 32px; display: flex; align-items: center; justify-content: space-between; }
  .header img { width: 48px; height: 48px; object-fit: contain; filter: brightness(0) invert(1); }
  .company-name { font-size: 21.5px; font-weight: 800; color: #fff; text-align: right; }
  .company-sub { font-size: 10.5px; color: rgba(255,255,255,.5); margin-top: 2px; text-align: right; }
  .hero { background: #CC1111; padding: 22px 32px 20px; position: relative; overflow: hidden; }
  .hero::before { content: ''; position: absolute; right: 24px; top: 50%; transform: translateY(-50%); width: 110px; height: 110px; border: 18px solid rgba(255,255,255,.07); border-radius: 50%; }
  .eyebrow { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: rgba(255,255,255,.7); margin-bottom: 8px; }
  .hero h1 { font-size: 27.5px; font-weight: 800; color: #fff; line-height: 1.15; margin-bottom: 8px; }
  .hero p { font-size: 13.5px; color: rgba(255,255,255,.85); line-height: 1.55; max-width: 400px; }
  .main { display: grid; grid-template-columns: 1fr 185px; flex: 1; min-height: 0; }
  .left { padding: 20px 24px 20px 32px; display: flex; flex-direction: column; gap: 14px; border-right: 1px solid #E0DAD4; }
  .greeting { font-size: 14px; line-height: 1.65; color: #3A3330; background: #fff; border-radius: 8px; padding: 12px 14px; border-left: 3px solid #CC1111; }
  .greeting strong { color: #CC1111; }
  .benefits { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
  .benefit { background: #fff; border-radius: 7px; padding: 10px 12px; display: flex; align-items: center; gap: 10px; border: 1px solid #E8E3DE; }
  .benefit-icon { width: 30px; height: 30px; background: #F7F4F0; border-radius: 6px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .benefit-text { font-size: 11.5px; color: #5A5350; line-height: 1.35; font-weight: 600; }
  .section-label { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #9A8F8A; margin-bottom: 8px; }
  .steps { display: flex; flex-direction: column; gap: 10px; }
  .step { display: flex; align-items: flex-start; gap: 12px; }
  .step-num { width: 24px; height: 24px; background: #2C2320; color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12.5px; font-weight: 800; flex-shrink: 0; }
  .step strong { display: block; font-size: 13.5px; color: #2C2320; margin-bottom: 2px; }
  .step span { font-size: 12px; color: #6A605C; line-height: 1.45; }
  .contacts { display: flex; flex-direction: column; gap: 6px; }
  .contact { display: flex; align-items: center; gap: 10px; background: #fff; border-radius: 7px; padding: 8px 12px; border: 1px solid #E8E3DE; }
  .dot { width: 8px; height: 8px; background: #CC1111; border-radius: 50%; }
  .c-lbl { font-size: 10.5px; color: #9A8F8A; width: 62px; }
  .c-val { font-size: 12.5px; font-weight: 700; color: #2C2320; }
  .right { padding: 20px 16px; display: flex; flex-direction: column; align-items: center; gap: 10px; background: #EFEBE6; }
  .qr-card { background: #fff; border-radius: 10px; padding: 12px; text-align: center; width: 153px; box-shadow: 0 2px 8px rgba(0,0,0,.08); }
  .qr-card img { width: 125px; height: 125px; display: block; margin: 0 auto 8px; }
  .qr-title { font-size: 11px; font-weight: 700; color: #2C2320; line-height: 1.3; }
  .qr-sub { font-size: 9.5px; color: #9A8F8A; margin-top: 3px; line-height: 1.4; }
  .cn-card { background: #CC1111; border-radius: 8px; padding: 9px 12px; text-align: center; width: 153px; }
  .cn-lbl { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: rgba(255,255,255,.7); margin-bottom: 3px; }
  .cn-val { font-size: 17.5px; font-weight: 800; color: #fff; letter-spacing: 1px; }
  .divider { width: 100%; height: 1px; background: #DDD8D3; }
  .url-card { background: #fff; border-radius: 8px; padding: 10px 12px; text-align: center; width: 153px; border: 1px solid #E0DAD4; }
  .url-label { font-size: 9.5px; color: #9A8F8A; margin-bottom: 4px; text-transform: uppercase; letter-spacing: .5px; font-weight: 600; }
  .url-val { font-size: 12.5px; font-weight: 800; color: #CC1111; }
  .note-card { background: #2C2320; border-radius: 8px; padding: 10px 12px; width: 153px; text-align: center; }
  .note-text { font-size: 10.5px; color: rgba(255,255,255,.7); line-height: 1.5; }
  .note-text strong { color: #fff; display: block; margin-bottom: 2px; }
  .note-phone { font-size: 11.5px; color: #CC1111; font-weight: 700; margin-top: 5px; }
  .for { font-size: 9.5px; color: #9A8F8A; text-align: center; width: 153px; line-height: 1.4; }
  .footer { background: #2C2320; padding: 9px 32px; display: flex; justify-content: space-between; }
  .footer span { font-size: 10px; color: rgba(255,255,255,.4); }
  .footer .accent { color: rgba(255,255,255,.7); font-weight: 600; }
`;

function flyerPage(c, greeting, logo) {
  return `<section class="page">
  <div class="top-stripe"></div>
  <div class="header"><img src="${logo}" alt=""><div><div class="company-name">Randl Group</div><div class="company-sub">Gas · Zeltverleih · CNC &amp; Metallbau</div></div></div>
  <div class="hero">
    <div class="eyebrow">Neuigkeit für unsere Kunden</div>
    <h1>Einfacher bestellen –<br>jetzt online!</h1>
    <p>Wir haben für euch einen neuen Gasshop eingerichtet. Bestellt bequem rund um die Uhr – mit eurem persönlichen Konto und eurer Kundennummer.</p>
  </div>
  <div class="main">
    <div class="left">
      <div class="greeting">${fill(greeting, c)}</div>
      <div class="benefits">
        <div class="benefit"><div class="benefit-icon">${icon('clock')}</div><div class="benefit-text">Rund um die Uhr bestellbar</div></div>
        <div class="benefit"><div class="benefit-icon">${icon('doc')}</div><div class="benefit-text">Bestellhistorie immer einsehbar</div></div>
        <div class="benefit"><div class="benefit-icon">${icon('bolt')}</div><div class="benefit-text">Schnell &amp; unkompliziert</div></div>
        <div class="benefit"><div class="benefit-icon">${icon('phone')}</div><div class="benefit-text">Handy &amp; Computer geeignet</div></div>
      </div>
      <div>
        <div class="section-label">So kommt ihr rein – 3 Schritte</div>
        <div class="steps">
          <div class="step"><div class="step-num">1</div><div><strong>QR-Code scannen</strong><span>Den QR-Code rechts mit dem Handy scannen – ihr landet direkt in eurem Kundenkonto.</span></div></div>
          <div class="step"><div class="step-num">2</div><div><strong>Daten prüfen &amp; Passwort festlegen</strong><span>Beim ersten Mal E-Mail-Adresse und Telefonnummer ergänzen und ein eigenes Passwort festlegen. Danach ist euer Konto dauerhaft aktiv.</span></div></div>
          <div class="step"><div class="step-num">3</div><div><strong>Bestellen wie gewohnt</strong><span>Alle bisherigen Daten sind bereits hinterlegt – einfach Produkte auswählen und Bestellung absenden.</span></div></div>
        </div>
      </div>
      <div>
        <div class="section-label">Unsere neuen Kontakte</div>
        <div class="contacts">
          <div class="contact"><div class="dot"></div><div class="c-lbl">Bestellungen</div><div class="c-val">bestellung@randl.group</div></div>
          <div class="contact"><div class="dot"></div><div class="c-lbl">Rechnungen</div><div class="c-val">rechnung@randl.group</div></div>
          <div class="contact"><div class="dot"></div><div class="c-lbl">Allgemein</div><div class="c-val">info@randl.group</div></div>
        </div>
      </div>
    </div>
    <div class="right">
      <div class="qr-card"><img src="${c.qr}" alt=""><div class="qr-title">Euer persönlicher<br>Zugang</div><div class="qr-sub">Einmalig scannen –<br>dauerhaft aktiv</div></div>
      <div class="cn-card"><div class="cn-lbl">Kundennummer</div><div class="cn-val">${esc(c.customer_number)}</div></div>
      <div class="divider"></div>
      <div class="url-card"><div class="url-label">Webshop</div><div class="url-val">shop.randl.group</div></div>
      <div class="note-card"><div class="note-text"><strong>Fragen?</strong>Wir helfen gerne beim ersten Login.</div><div class="note-phone">+49 171 45 850 63</div></div>
      <div class="for">Für: ${esc(c.name)}<br>${esc(c.street)}<br>${esc(c.zip)} ${esc(c.city)}</div>
    </div>
  </div>
  <div class="footer"><span>Randl Group · Gas · Zeltverleih · CNC &amp; Metallbau</span><span class="accent">gas.randl.group</span></div>
</section>`;
}

function printLetters(customers, letter) {
  const greeting = letter && letter.trim() ? letter : DEFAULT_GREETING;
  const logo = window.location.origin + '/randl-flyer-logo.png';
  const w = window.open('', '_blank');
  if (!w) { alert('Pop-up blockiert – bitte für das Portal erlauben.'); return; }
  w.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Kundenflyer Gasshop (${customers.length})</title><style>${FLYER_CSS}</style></head>
<body>${customers.map(c => flyerPage(c, greeting, logo)).join('')}
<script>window.onload = () => setTimeout(() => window.print(), 300);<\/script></body></html>`);
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
  const [sel, setSel] = useState(new Set());   // Auswahl für den punktuellen Versand
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
  useEffect(() => { loadRecipients(wave); setSel(new Set()); }, [wave]);
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

  // selected: nur an die angehakten Kunden (bereits angeschriebene überspringt das admin-backend)
  const send = async (test, one, selected) => {
    setError(''); setInfo('');
    const open = (data?.customers || []).filter(c => !c.sent_at).length;
    const force = !!one?.sent_at;
    if (force) {
      if (!window.confirm(`${one.name} wurde bereits am ${fmt(one.sent_at)} angeschrieben.\n\nLogin- und Info-Mail erneut an ${one.recipient} senden?`)) return;
    } else if (one) {
      if (!window.confirm(`Login- und Info-Mail jetzt an ${one.name} (${one.recipient}) senden?`)) return;
    } else if (selected) {
      const openSel = selected.filter(c => !c.sent_at).length;
      if (!window.confirm(`Info-Mail (Welle ${wave}) jetzt an ${openSel} ausgewählte Kunden senden?`
        + (openSel < selected.length ? `\n\n${selected.length - openSel} davon wurden bereits angeschrieben und werden übersprungen.` : ''))) return;
    } else if (!test && !window.confirm(`Info-Mail (Welle ${wave}) jetzt an ${open} Kunden senden?\n\nBereits angeschriebene Kunden werden übersprungen.`)) return;
    const r = await fetch('/api/finance/info-mail/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wave, test_to: test ? testTo : undefined, customer_id: one?.id, customer_ids: selected?.map(c => c.id), force: force || undefined }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setError(d.error || 'Versand fehlgeschlagen'); return; }
    if (test) { setInfo(`Testmail an ${d.sentTo} gesendet (Beispielkunde: ${d.sample}).`); return; }
    if (selected) setSel(new Set());
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
  const selList = customers.filter(c => sel.has(c.id));
  const selOpen = selList.filter(c => !c.sent_at).length;
  const allSel = customers.length > 0 && selList.length === customers.length;
  const toggle = id => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  // „Alle“ wählt nur die noch offenen Kunden – bereits angeschriebene würden ohnehin übersprungen
  const toggleAll = () => setSel(selList.length ? new Set() : new Set(customers.filter(c => !c.sent_at).map(c => c.id)));

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
          <label style={S.label}>Mailtext (HTML) – Platzhalter: {'{{name}}'}, {'{{kundennummer}}'}, {'{{login_link}}'}, {'{{shop_url}}'}, {'{{qr_code}}'} (QR-Code als Bild im Text – ohne Platzhalter kommt er als PNG-Anhang)</label>
          <textarea style={{ ...S.input, minHeight: 180, fontFamily: 'DM Mono, monospace', fontSize: '.78rem' }} value={tpl.html || ''} onChange={e => setTpl({ ...tpl, html: e.target.value })} />
          <label style={{ ...S.label, marginTop: '.6rem' }}>Begrüßung auf dem Flyer für Welle 2 (HTML, leer = Standardtext „Hallo {'{{name}}'}! …“) – Rest des Flyers, QR-Code und Kundennummer kommen automatisch</label>
          <textarea style={{ ...S.input, minHeight: 100, fontFamily: 'DM Mono, monospace', fontSize: '.78rem' }} value={tpl.letter || ''} onChange={e => setTpl({ ...tpl, letter: e.target.value })} />
          <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '.7rem' }}>
            <button style={S.btnPrimary} disabled={saving} onClick={saveTemplate}>{saving ? '…' : 'Vorlage speichern'}</button>
            <span style={{ fontSize: '.78rem', color: 'var(--text2)' }}>
              PDF-Anleitung: {tpl.pdf?.exists
                ? <><a href={'/api/finance/info-mail/pdf?v=' + new Date(tpl.pdf.updated_at).getTime()} target="_blank" rel="noreferrer">vorhanden</a> ({Math.round(tpl.pdf.size / 1024)} KB, {fmt(tpl.pdf.updated_at)})</>
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
                <>
                  <button style={S.btn} disabled={!customers.length} onClick={() => printLetters(customers.slice(0, 1), tpl?.letter)}>Probeseite</button>
                  {/* In Paketen drucken: mehrere hundert Farbseiten auf einmal bringen die Druckvorschau des Browsers zum Absturz */}
                  {Array.from({ length: Math.ceil(customers.length / BATCH) }, (_, i) => (
                    <button key={i} style={S.btnPrimary} onClick={() => printLetters(customers.slice(i * BATCH, (i + 1) * BATCH), tpl?.letter)}>
                      {i * BATCH + 1}–{Math.min((i + 1) * BATCH, customers.length)}
                    </button>
                  ))}
                </>
              ) : (
                <>
                  <input style={{ ...S.input, width: 230 }} placeholder="Testmail an …" value={testTo} onChange={e => setTestTo(e.target.value)} />
                  <button style={S.btn} disabled={!testTo || running} onClick={() => send(true)}>Test senden</button>
                  <button style={S.btn} disabled={!selOpen || running} onClick={() => send(false, null, selList)}>An {selOpen} ausgewählte senden</button>
                  <button style={S.btnPrimary} disabled={!open || running} onClick={() => send(false)}>An alle {open} Kunden senden</button>
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
                  {wave !== 2 && <th style={S.th}><input type="checkbox" checked={allSel} ref={el => { if (el) el.indeterminate = selList.length > 0 && !allSel; }} onChange={toggleAll} title="Alle offenen auswählen" /></th>}
                  <th style={S.th}>KD-Nr</th><th style={S.th}>Name</th>
                  <th style={S.th}>{wave === 2 ? 'Anschrift' : 'E-Mail'}</th>
                  <th style={S.th}>First Login</th>
                  {wave !== 2 && <th style={S.th}>Angeschrieben</th>}
                  {wave !== 2 && <th style={S.th}></th>}
                </tr></thead>
                <tbody>
                  {customers.map(c => (
                    <tr key={c.id}>
                      {wave !== 2 && <td style={S.td}><input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} /></td>}
                      <td style={{ ...S.td, fontFamily: 'DM Mono, monospace' }}>{c.customer_number}</td>
                      <td style={{ ...S.td, color: 'var(--text1)' }}>{c.name}</td>
                      <td style={S.td}>{wave === 2 ? `${c.street || ''}, ${c.zip || ''} ${c.city || ''}` : c.recipient}</td>
                      <td style={S.td}>{c.first_login_at ? '✓ ' + new Date(c.first_login_at).toLocaleDateString('de-DE') : '✗'}</td>
                      {wave !== 2 && <td style={S.td}>{c.sent_at ? fmt(c.sent_at) : '—'}</td>}
                      {wave !== 2 && (
                        <td style={S.td}>
                          <button style={S.btn} disabled={running} onClick={() => send(false, c)}>{c.sent_at ? 'Erneut senden' : 'Mail senden'}</button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {!customers.length && <tr><td colSpan={7} style={{ ...S.td, textAlign: 'center', color: 'var(--text3)' }}>Keine Kunden in dieser Welle.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
