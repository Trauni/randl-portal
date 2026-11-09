import { useState, useEffect, useRef, useMemo } from 'react';

// Feste Firmenangaben – Änderungen nur durch IT
const FIRMA = {
  name: 'Firma Dominik Randl',
  adresse: 'Grünweg 1 | 83370 Seeon | Germany',
  bereiche: [
    ['🔥', 'Gashandel', 'https://randl.group/gas'],
    ['⛺', 'Zelt- &amp; Veranstaltungsverleih', 'https://randl.group/zelt'],
    ['⚙️', 'CNC- &amp; Metalltechnik', 'https://randl.group/metall'],
  ],
  instagram: ['@randlpartyzelte', 'https://www.instagram.com/randlpartyzelte'],
  inhaber: 'Dominik Randl',
  ustid: 'DE306622659',
  datenschutz: 'https://randl.group/datenschutz',
  vertraulich: 'Diese Nachricht ist vertraulich. Falls sie Sie irrtümlich erreicht hat, informieren Sie uns bitte und löschen Sie sie.',
};

const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const telHref = s => 'tel:' + s.replace(/[^\d+]/g, '');
const F = 'font-family:Arial,Helvetica,sans-serif;';
const ROT = '#CC1111', BRAUN = '#2C2320', GRAU = '#7A706B', BLAU = '#1F6B8E';

const buildSignature = v => {
  const link = (t, h, c) => `<a href="${h}" style="color:${c || ROT};text-decoration:underline;">${t}</a>`;
  const bereiche = `<b>Unsere Kompetenz:</b><br>\n` + FIRMA.bereiche.map(([e, t, h]) => `${e} <b>${t}:</b> ${link(h, h)}`).join('<br>\n');
  const rows = [];
  if (v.mobil) rows.push(`<b>Mobil:</b> ${link(esc(v.mobil), telHref(v.mobil), BRAUN)}`);
  if (v.tel) rows.push(`<b>Telefon:</b> ${link(esc(v.tel), telHref(v.tel), BRAUN)}`);
  rows.push(`<b>E-Mail:</b> ${link(esc(v.mail), 'mailto:' + esc(v.mail), BRAUN)}`);
  rows.push(`<b>Instagram:</b> ${link(FIRMA.instagram[0], FIRMA.instagram[1], BRAUN)}`);

  return `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="${F}font-size:13px;line-height:19px;color:${BRAUN};border-collapse:collapse;">
<tr><td style="${F}padding:0;">
<span style="font-size:15px;font-weight:bold;color:${BLAU};">${esc(v.name)}</span><br>
${esc(v.role)}<br>
<span style="font-weight:bold;color:${ROT};">${FIRMA.name}</span><br>
${FIRMA.adresse}
</td></tr>
<tr><td style="${F}padding:12px 0 0 0;">${bereiche}</td></tr>
<tr><td style="${F}padding:12px 0 0 0;">${rows.join('<br>\n')}</td></tr>
<tr><td style="${F}padding:12px 0 0 0;border-bottom:1px solid ${BRAUN};font-size:1px;line-height:1px;">&nbsp;</td></tr>
<tr><td style="${F}padding:8px 0 0 0;font-size:11px;line-height:16px;color:${GRAU};">
Inhaber: ${FIRMA.inhaber} | USt-IdNr.: ${FIRMA.ustid}<br>
Datenschutz: ${link('randl.group/datenschutz', FIRMA.datenschutz, GRAU)}<br>
${FIRMA.vertraulich}
</td></tr>
</table>`;
};

const validate = v => {
  if (!v.name || !v.role || !v.mail) return 'Name, Funktion und E-Mail ausfüllen.';
  if (!/^[^\s@]+@randl\.group$/.test(v.mail)) return 'Die E-Mail-Adresse muss auf @randl.group enden.';
  return '';
};

export default function MailSignature({ initial }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', role: '', mobil: '', tel: '', mail: '' });
  const [toast, setToast] = useState('');
  const prefilled = useRef(false);
  const toastTimer = useRef(null);
  const sheetRef = useRef(null);

  // Einmalig mit Profildaten vorbelegen, sobald diese geladen sind
  useEffect(() => {
    if (prefilled.current || !initial) return;
    prefilled.current = true;
    setForm({
      name: initial.name || '',
      role: initial.role || '',
      mobil: initial.mobil || '',
      tel: initial.tel || '',
      mail: (initial.mail || '').toLowerCase(),
    });
  }, [initial]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const values = useMemo(() => ({
    name: form.name.trim(), role: form.role.trim(), mobil: form.mobil.trim(),
    tel: form.tel.trim(), mail: form.mail.trim().toLowerCase(),
  }), [form]);
  const err = validate(values);
  const touched = !!(form.name || form.role || form.mail);
  const mailInvalid = touched && err.includes('@randl.group');

  const preview = useMemo(() => buildSignature({
    ...values,
    name: values.name || 'Vorname Nachname',
    role: values.role || 'Funktion',
    mail: values.mail || 'name@randl.group',
  }), [values]);

  const showToast = t => {
    setToast(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 4000);
  };

  const copyRich = async () => {
    if (err) return;
    const html = buildSignature(values);
    const plain = sheetRef.current?.innerText || '';
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      })]);
      showToast('Signatur kopiert. Jetzt in Outlook einfügen.');
    } catch {
      const r = document.createRange();
      r.selectNodeContents(sheetRef.current);
      const s = getSelection();
      s.removeAllRanges(); s.addRange(r);
      const ok = document.execCommand && document.execCommand('copy');
      s.removeAllRanges();
      showToast(ok ? 'Signatur kopiert. Jetzt in Outlook einfügen.' : 'Kopieren nicht möglich: Vorschau markieren und mit Strg+C kopieren.');
    }
  };

  const copyCode = async () => {
    if (err) return;
    try {
      await navigator.clipboard.writeText(buildSignature(values));
      showToast('HTML-Code kopiert.');
    } catch {
      showToast('Kopieren nicht möglich. Bitte „Signatur kopieren“ nutzen.');
    }
  };

  return (
    <div className="card ms-card">
      <button type="button" className="ms-toggle" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="ms-toggle-title">E-Mail-Signatur erstellen</span>
        <span className="ms-toggle-sub">Einheitliche Signatur für alle Postfächer der Randl Group</span>
        <span className="ms-chevron" aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="ms-body">
          <div className="ms-grid">
            <form className="ms-form" onSubmit={e => e.preventDefault()} noValidate>
              <label className="ms-label">Name
                <input className="pf-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Vorname Nachname" autoComplete="name"/>
                <small>Bei Sammelpostfächern z. B. „Team Bestellung“</small>
              </label>
              <label className="ms-label">Funktion
                <input className="pf-input" value={form.role} onChange={e => set('role', e.target.value)} placeholder="z. B. Disposition"/>
              </label>
              <label className="ms-label">Mobil <small>optional</small>
                <input className="pf-input" inputMode="tel" value={form.mobil} onChange={e => set('mobil', e.target.value)} placeholder="+49 172 …" autoComplete="tel"/>
              </label>
              <label className="ms-label">Telefon <small>optional</small>
                <input className="pf-input" inputMode="tel" value={form.tel} onChange={e => set('tel', e.target.value)} placeholder="+49 …"/>
              </label>
              <label className="ms-label">E-Mail
                <input className="pf-input" type="email" value={form.mail} onChange={e => set('mail', e.target.value)} placeholder="vorname.nachname@randl.group" autoComplete="email" aria-invalid={mailInvalid}/>
              </label>
              <p className="ms-hint" role="status">{touched ? err : ''}</p>
            </form>

            <section>
              <div className="ms-preview-head">
                <h3 className="ms-preview-title">Vorschau</h3>
                <span>So sieht der Empfänger die Signatur</span>
              </div>
              <div className="ms-sheet">
                <p className="ms-greet">Viele Grüße</p>
                <div ref={sheetRef} dangerouslySetInnerHTML={{ __html: preview }}/>
              </div>
              <div className="ms-actions">
                <button type="button" className="btn btn-primary" onClick={copyRich} disabled={!!err}>Signatur kopieren</button>
                <button type="button" className="btn btn-ghost" onClick={copyCode} disabled={!!err}>HTML-Code kopieren</button>
              </div>
              <div className="ms-toast" role="status" aria-live="polite">{toast}</div>

              <details className="ms-details">
                <summary>In Outlook einfügen</summary>
                <ol>
                  <li><strong>Outlook (neu) und Outlook im Browser:</strong> Einstellungen › Konten › Signaturen › Neue Signatur, Namen „Randl“ vergeben, mit Strg+V einfügen, speichern. Darunter „Für neue Nachrichten“ und „Für Antworten/Weiterleitungen“ auf „Randl“ stellen.</li>
                  <li><strong>Outlook klassisch:</strong> Datei › Optionen › E-Mail › Signaturen › Neu, einfügen, Standard für neue Nachrichten und Antworten setzen.</li>
                  <li><strong>Outlook-App am Handy:</strong> Einstellungen › Signatur. Die App übernimmt Formatierungen nur eingeschränkt.</li>
                  <li>Testmail an dich selbst schicken und prüfen.</li>
                </ol>
              </details>
              <p className="ms-note">Die Signatur ist für alle Mitarbeitenden verbindlich (Mitarbeiterhandbuch). Firmenangaben bitte nicht ändern. Fragen an Klaus Parzinger, IT.</p>
            </section>
          </div>
        </div>
      )}
      <style>{`
        .ms-card{margin-top:14px;}
        .ms-toggle{display:flex;align-items:center;gap:12px;width:100%;padding:14px 16px;background:none;border:none;cursor:pointer;font-family:inherit;text-align:left;color:var(--text1);flex-wrap:wrap;}
        .ms-toggle-title{font-size:13px;font-weight:700;}
        .ms-toggle-sub{font-size:12px;color:var(--text3);flex:1;}
        .ms-chevron{font-size:10px;color:var(--text3);}
        .ms-body{padding:0 16px 16px;border-top:1px solid var(--border);padding-top:16px;}
        .ms-grid{display:grid;grid-template-columns:minmax(0,300px) minmax(0,1fr);gap:22px;align-items:start;}
        @media(max-width:820px){.ms-grid{grid-template-columns:1fr;}}
        .ms-form{display:flex;flex-direction:column;gap:12px;}
        .ms-label{display:flex;flex-direction:column;gap:4px;font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;}
        .ms-label small{font-weight:400;text-transform:none;letter-spacing:0;color:var(--text3);}
        .ms-label input[aria-invalid="true"]{border-color:var(--red2);}
        .ms-hint{font-size:12px;color:var(--red2);min-height:1.2em;margin:0;}
        .ms-preview-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:8px;}
        .ms-preview-title{font-size:13px;font-weight:700;color:var(--text1);margin:0;}
        .ms-preview-head span{font-size:11px;color:var(--text3);}
        .ms-sheet{background:#fff;border:1px solid var(--border);border-radius:8px;padding:20px;overflow-x:auto;color:#2C2320;}
        .ms-greet{font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#555;margin:0 0 16px;}
        .ms-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;}
        .ms-toast{min-height:1.4em;margin-top:8px;font-size:12px;color:var(--text2);}
        .ms-details{margin-top:18px;border-top:1px solid var(--border);padding-top:12px;font-size:13px;color:var(--text2);}
        .ms-details summary{cursor:pointer;font-weight:600;color:var(--text1);}
        .ms-details ol{padding-left:1.2em;margin:10px 0 0;}
        .ms-details li{margin-bottom:6px;}
        .ms-note{margin-top:16px;font-size:12px;color:var(--text3);max-width:70ch;}
      `}</style>
    </div>
  );
}
