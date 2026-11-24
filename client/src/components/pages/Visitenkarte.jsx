import { useState, useEffect, useRef, useMemo } from 'react';
import {
  BEREICHE, BESCHNITT, ZENTRALE_TELEFON, ladeAssets, vorderseite, rueckseite, svg, vorschauQuellen,
  pdf, bild, dateiname, herunterladen, bereichAusAbteilung,
} from '../../utils/visitenkarte';

// Visitenkarte (#630): Daten aus dem Profil, Live-Vorschau, Export als PDF (beide Seiten) oder Bild je Seite.
export default function Visitenkarte({ initial }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ bereich: 'Gruppe', name: '', funktion: '', mobil: '', email: '', zentrale: false });
  const [beschnitt, setBeschnitt] = useState('standard');
  const [assets, setAssets] = useState(null);
  const [busy, setBusy] = useState('');
  const [meldung, setMeldung] = useState('');
  const prefilled = useRef(false);

  useEffect(() => {
    if (prefilled.current || !initial) return;
    prefilled.current = true;
    setForm(f => ({
      ...f,
      bereich: bereichAusAbteilung(initial.department),
      name: initial.name || '',
      funktion: initial.role || '',
      mobil: initial.mobil || '',
      email: (initial.mail || '').toLowerCase(),
    }));
  }, [initial]);

  // Schriften und Logo erst laden, wenn die Karte aufgeklappt wird
  useEffect(() => {
    if (!open || assets) return;
    let aktiv = true;
    ladeAssets().then(a => aktiv && setAssets(a)).catch(() => aktiv && setMeldung('Schriften konnten nicht geladen werden.'));
    return () => { aktiv = false; };
  }, [open, assets]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const b = BESCHNITT.find(x => x.id === beschnitt).mm;
  const fehler = !form.name.trim() ? 'Name ausfüllen.'
    : !/^[^\s@]+@randl\.group$/i.test(form.email.trim()) ? 'Die E-Mail-Adresse muss auf @randl.group enden.' : '';

  const vorschau = useMemo(() => {
    if (!assets) return null;
    const q = vorschauQuellen();
    return {
      vorne: svg(vorderseite(assets, form, 0), 0, q),
      hinten: svg(rueckseite(assets, form, 0), 0, q),
    };
  }, [assets, form]);

  const exportiere = async (art, seite) => {
    if (fehler || !assets || busy) return;
    setBusy(art + (seite || '')); setMeldung('');
    try {
      if (art === 'pdf') {
        herunterladen(await pdf(assets, form, b), dateiname(form, 'pdf'), 'application/pdf');
      } else {
        const bytes = await bild(assets, form, b, seite, art);
        herunterladen(bytes, dateiname(form, art, seite === 'rueck' ? 'Rueckseite' : 'Vorderseite'), art === 'png' ? 'image/png' : 'image/jpeg');
      }
    } catch (e) {
      setMeldung(e.message || 'Export fehlgeschlagen.');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="card ms-card vk-card">
      <button type="button" className="ms-toggle" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="ms-toggle-title">Visitenkarte erstellen</span>
        <span className="ms-toggle-sub">Druckfertig als PDF oder Bild, 85 × 55 mm mit Beschnitt</span>
        <span className="ms-chevron" aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="ms-body">
          <div className="ms-grid">
            <form className="ms-form" onSubmit={e => e.preventDefault()} noValidate>
              <label className="ms-label">Bereich
                <select className="pf-input" value={form.bereich} onChange={e => set('bereich', e.target.value)}>
                  {BEREICHE.map(x => <option key={x} value={x}>{x === 'Gruppe' ? 'Gruppe (alle Bereiche)' : x}</option>)}
                </select>
              </label>
              <label className="ms-label">Name
                <input className="pf-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Vorname Nachname" autoComplete="name"/>
              </label>
              <label className="ms-label">Funktion <small>optional</small>
                <input className="pf-input" value={form.funktion} onChange={e => set('funktion', e.target.value)} placeholder="z. B. Disposition"/>
              </label>
              <label className="ms-label">Mobil <small>leer = Zeile entfällt</small>
                <input className="pf-input" inputMode="tel" value={form.mobil} onChange={e => set('mobil', e.target.value)} placeholder="+49 172 …" autoComplete="tel"/>
              </label>
              <label className="ms-label">E-Mail
                <input className="pf-input" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="vorname.nachname@randl.group" autoComplete="email" aria-invalid={!!form.email && fehler.includes('@randl')}/>
              </label>
              <label className="vk-check">
                <input type="checkbox" checked={form.zentrale && !!ZENTRALE_TELEFON} disabled={!ZENTRALE_TELEFON} onChange={e => set('zentrale', e.target.checked)}/>
                <span>Zentrale Festnetznummer aufnehmen{ZENTRALE_TELEFON ? ` (${ZENTRALE_TELEFON})` : ''}
                  {!ZENTRALE_TELEFON && <small>Noch nicht festgelegt</small>}</span>
              </label>
              <label className="ms-label">Druckerei
                <select className="pf-input" value={beschnitt} onChange={e => setBeschnitt(e.target.value)}>
                  {BESCHNITT.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
                </select>
                <small>Den Beschnitt gibt das Datenblatt der Druckerei vor.</small>
              </label>
              <p className="ms-hint" role="status">{form.name || form.email ? fehler : ''}</p>
            </form>

            <section>
              <div className="ms-preview-head">
                <h3 className="ms-preview-title">Vorschau</h3>
                <span>Endformat nach dem Schnitt</span>
              </div>
              {vorschau ? (
                <div className="vk-sides">
                  <figure><div className="vk-sheet" dangerouslySetInnerHTML={{ __html: vorschau.vorne }}/><figcaption>Vorderseite</figcaption></figure>
                  <figure><div className="vk-sheet" dangerouslySetInnerHTML={{ __html: vorschau.hinten }}/><figcaption>Rückseite</figcaption></figure>
                </div>
              ) : (
                <div className="vk-loading"><div className="spinner"/>Lade Schriften…</div>
              )}

              <div className="ms-actions">
                <button type="button" className="btn btn-primary" onClick={() => exportiere('pdf')} disabled={!!fehler || !assets || !!busy}>
                  {busy === 'pdf' ? 'Erzeuge PDF…' : 'PDF herunterladen'}
                </button>
              </div>
              <div className="vk-bilder">
                <span>Bild, 300 dpi:</span>
                {[['vorne', 'Vorderseite'], ['rueck', 'Rückseite']].map(([s, l]) => (
                  <span key={s} className="vk-bild-gruppe">{l}
                    {['jpg', 'png'].map(t => (
                      <button key={t} type="button" className="btn btn-ghost btn-sm" onClick={() => exportiere(t, s)} disabled={!!fehler || !assets || !!busy}>
                        {busy === t + s ? '…' : t.toUpperCase()}
                      </button>
                    ))}
                  </span>
                ))}
              </div>
              <div className="ms-toast" role="status" aria-live="polite">{meldung}</div>

              <details className="ms-details">
                <summary>Welches Format für welche Druckerei?</summary>
                <ol>
                  <li><strong>PDF</strong> ist die erste Wahl: beide Seiten in einer Datei, Schrift bleibt scharf. Flyeralarm nimmt PDF, TIF oder JPG.</li>
                  <li><strong>JPG</strong> für Druckereien, die kein PDF annehmen. Vorder- und Rückseite einzeln hochladen.</li>
                  <li><strong>PNG</strong> für Online-Druckereien, die PNG verlangen, oder zum Weitergeben.</li>
                  <li>Die Farben sind RGB. Die Druckerei rechnet sie in CMYK um, das Rot kann dabei leicht abweichen.</li>
                </ol>
              </details>
            </section>
          </div>
        </div>
      )}
      <style>{`
        .vk-check{display:flex;gap:8px;align-items:flex-start;font-size:13px;color:var(--text2);}
        .vk-check input{margin-top:3px;}
        .vk-check small{display:block;font-size:11px;color:var(--text3);}
        .vk-sides{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;}
        .vk-sides figure{margin:0;}
        .vk-sides figcaption{font-size:11px;color:var(--text3);margin-top:6px;text-align:center;}
        .vk-sheet{aspect-ratio:85/55;border-radius:4px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.18),0 6px 18px rgba(0,0,0,.08);}
        .vk-sheet svg{display:block;width:100%;height:100%;}
        .vk-loading{display:flex;gap:10px;align-items:center;padding:30px;color:var(--text2);}
        .vk-bilder{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;margin-top:10px;font-size:12px;color:var(--text2);}
        .vk-bild-gruppe{display:inline-flex;gap:6px;align-items:center;}
      `}</style>
    </div>
  );
}
