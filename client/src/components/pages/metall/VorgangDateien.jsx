import { useState, useEffect, useRef } from 'react';

// Fotos & Dateien im Vorgangsdetail (#372): Upload (auch direkt mit der Handykamera), Vorschau,
// „Für Kunde sichtbar“ (Standard nur intern), Beschreibung, Löschen. Ablage im Portal, ein Ordner pro Vorgang.

const ERLAUBT = '.jpg,.jpeg,.png,.webp,.heic,.heif,.pdf,.dxf,.dwg,.step,.stp';
const MAX_MB = 25;
const ART = { foto: 'Foto', pdf: 'PDF', zeichnung: 'Zeichnung', cad: 'CAD', sonstiges: 'Datei' };
const fmt = d => d ? new Date(d).toLocaleString('de-DE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const groesse = b => b >= 1024 * 1024 ? `${(b / 1024 / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

async function json(r) {
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Fehler');
  return data;
}
const send = (url, method, body) =>
  fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then(json);

// Upload mit Fortschritt (fetch kennt keinen Upload-Fortschritt)
function hochladen(url, files, onProgress) {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    files.forEach(f => fd.append('dateien', f, f.name));
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.upload.onprogress = e => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* leer */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.error || (xhr.status === 413 ? 'Upload zu groß' : `Hochladen fehlgeschlagen (${xhr.status})`)));
    };
    xhr.onerror = () => reject(new Error('Verbindung abgebrochen'));
    xhr.send(fd);
  });
}

export default function VorgangDateien({ vorgangId }) {
  const [dateien, setDateien] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hinweis, setHinweis] = useState('');
  const [fortschritt, setFortschritt] = useState(null);
  const [busy, setBusy] = useState(null);
  const [ziehen, setZiehen] = useState(false);
  const kamera = useRef(null);
  const auswahl = useRef(null);

  const basis = '/api/metallarbeiten/dateien';
  const load = async () => {
    try { setDateien(await json(await fetch(`${basis}/vorgang/${vorgangId}`))); setError(''); }
    catch (e) { setError(`Dateien laden fehlgeschlagen: ${e.message}`); }
    finally { setLoading(false); }
  };
  useEffect(() => { setLoading(true); load(); }, [vorgangId]);

  const lade = async fileList => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setError(''); setHinweis('');
    const zuGross = files.filter(f => f.size > MAX_MB * 1024 * 1024);
    const ok = files.filter(f => f.size <= MAX_MB * 1024 * 1024);
    if (!ok.length) { setError(`Größer als ${MAX_MB} MB: ${zuGross.map(f => f.name).join(', ')}`); return; }
    setFortschritt(0);
    try {
      const r = await hochladen(`${basis}/vorgang/${vorgangId}`, ok, setFortschritt);
      const abgelehnt = [...zuGross.map(f => `${f.name} (größer als ${MAX_MB} MB)`), ...(r.abgelehnt || []).map(a => `${a.dateiname} (${a.grund})`)];
      setHinweis(`${r.gespeichert?.length || 0} Datei(en) gespeichert – nur intern, bis du sie freigibst.`);
      if (abgelehnt.length) setError(`Nicht gespeichert: ${abgelehnt.join(', ')}`);
      await load();
    } catch (e) { setError(e.message); }
    finally {
      setFortschritt(null);
      if (kamera.current) kamera.current.value = '';
      if (auswahl.current) auswahl.current.value = '';
    }
  };

  const tu = async (key, fn) => {
    setBusy(key); setError('');
    try { await fn(); await load(); } catch (e) { setError(e.message); } finally { setBusy(null); }
  };
  const sichtbar = d => tu(`s-${d.id}`, () => send(`${basis}/${d.id}/sichtbar`, 'PUT', { sichtbar: !d.fuer_kunde_sichtbar }));
  const beschreibung = d => {
    const t = window.prompt('Beschreibung (sieht auch der Kunde, wenn freigegeben):', d.beschreibung || '');
    if (t === null) return;
    tu(`b-${d.id}`, () => send(`${basis}/${d.id}/beschreibung`, 'PUT', { beschreibung: t }));
  };
  const loeschen = d => {
    if (!window.confirm(`„${d.dateiname}“ löschen?${d.fuer_kunde_sichtbar ? '\n\nDer Kunde sieht die Datei dann nicht mehr.' : ''}`)) return;
    tu(`l-${d.id}`, () => send(`${basis}/${d.id}`, 'DELETE'));
  };

  const freigegeben = dateien.filter(d => d.fuer_kunde_sichtbar).length;
  const laeuft = fortschritt !== null;

  return (
    <div className={`card vd-card vdd${ziehen ? ' vdd--drop' : ''}`}
      onDragOver={e => { e.preventDefault(); setZiehen(true); }}
      onDragLeave={() => setZiehen(false)}
      onDrop={e => { e.preventDefault(); setZiehen(false); if (!laeuft) lade(e.dataTransfer.files); }}>
      <div className="vd-card-h">
        <h3>Fotos & Dateien</h3>
        <span className="vd-small">{dateien.length ? `${dateien.length} · ${freigegeben} für den Kunden sichtbar` : 'Standard: nur intern'}</span>
        <span style={{ flex: 1 }} />
        <input ref={kamera} type="file" accept="image/*" capture="environment" hidden onChange={e => lade(e.target.files)} />
        <input ref={auswahl} type="file" accept={ERLAUBT} multiple hidden onChange={e => lade(e.target.files)} />
        <button className="btn btn-primary btn-sm vdd-kamera" disabled={laeuft} onClick={() => kamera.current?.click()}>Foto aufnehmen</button>
        <button className="btn btn-ghost btn-sm" disabled={laeuft} onClick={() => auswahl.current?.click()}>Dateien wählen</button>
      </div>

      {laeuft && <div className="vdd-progress"><div style={{ width: `${fortschritt}%` }} /><span>Lade hoch … {fortschritt} %</span></div>}
      {error && <div className="alert alert--error vdd-msg">{error}</div>}
      {hinweis && !error && <div className="alert alert--success vdd-msg">{hinweis}</div>}

      {loading ? <div className="vd-empty">Lade Dateien…</div>
        : dateien.length === 0 ? <div className="vd-empty">Noch keine Dateien. Fotos, PDF, DXF/DWG oder STEP bis {MAX_MB} MB – am PC auch per Ziehen und Ablegen.</div>
        : (
          <div className="vdd-grid">
            {dateien.map(d => (
              <div key={d.id} className={`vdd-item${d.fuer_kunde_sichtbar ? ' vdd-item--frei' : ''}`}>
                <a className="vdd-thumb" href={`${basis}/${d.id}`} target="_blank" rel="noreferrer" title="Öffnen">
                  {d.vorschau ? <img src={`${basis}/${d.id}/vorschau`} alt={d.dateiname} loading="lazy" /> : <span className="vdd-ext">{ART[d.art] || 'Datei'}</span>}
                </a>
                <div className="vdd-info">
                  <a className="vdd-name" href={`${basis}/${d.id}?download=1`} title="Herunterladen">{d.dateiname}</a>
                  {d.beschreibung && <div className="vdd-desc">{d.beschreibung}</div>}
                  <div className="vd-small">{groesse(d.groesse_bytes)} · {fmt(d.hochgeladen_am)}{d.quelle === 'kunde' ? ' · vom Kunden' : d.hochgeladen_von_name ? ` · ${d.hochgeladen_von_name}` : ''}</div>
                </div>
                <div className="vdd-acts">
                  <label className="vdd-switch" title={d.fuer_kunde_sichtbar && d.sichtbar_geaendert_von_name ? `freigegeben von ${d.sichtbar_geaendert_von_name}` : undefined}>
                    <input type="checkbox" checked={d.fuer_kunde_sichtbar} disabled={!!busy} onChange={() => sichtbar(d)} />
                    <span>{busy === `s-${d.id}` ? '…' : 'Für Kunde sichtbar'}</span>
                  </label>
                  <span style={{ flex: 1 }} />
                  <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => beschreibung(d)}>Beschreibung</button>
                  <button className="btn btn-ghost btn-sm vdd-del" disabled={!!busy} onClick={() => loeschen(d)}>Löschen</button>
                </div>
              </div>
            ))}
          </div>
        )}
      <style>{css}</style>
    </div>
  );
}

const css = `
  .vdd--drop{border-color:var(--r);box-shadow:0 0 0 2px #c0392b33;}
  .vdd-msg{margin:10px 16px 0;}
  .vdd-progress{position:relative;margin:10px 16px 0;height:22px;border-radius:6px;background:var(--bg2);border:1px solid var(--border);overflow:hidden;}
  .vdd-progress div{position:absolute;inset:0 auto 0 0;background:#c0392b55;transition:width .2s;}
  .vdd-progress span{position:relative;display:block;text-align:center;font-size:12px;line-height:20px;color:var(--text1);}
  .vdd-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px;padding:14px 16px;}
  .vdd-item{display:flex;flex-direction:column;border:1px solid var(--border);border-radius:8px;background:var(--bg2);overflow:hidden;min-width:0;}
  .vdd-item--frei{border-color:#2ebd7a88;}
  .vdd-thumb{display:flex;align-items:center;justify-content:center;aspect-ratio:4/3;background:var(--bg3);overflow:hidden;text-decoration:none;}
  .vdd-thumb img{width:100%;height:100%;object-fit:cover;display:block;}
  .vdd-ext{font-family:'DM Mono',monospace;font-size:15px;font-weight:700;color:var(--text2);}
  .vdd-info{padding:8px 10px 4px;display:flex;flex-direction:column;gap:3px;min-width:0;}
  .vdd-name{font-size:13px;font-weight:600;color:var(--text1);text-decoration:none;overflow-wrap:anywhere;}
  .vdd-name:hover{text-decoration:underline;}
  .vdd-desc{font-size:12px;color:var(--text2);overflow-wrap:anywhere;}
  .vdd-acts{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:6px 10px 10px;margin-top:auto;}
  .vdd-switch{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--text1);cursor:pointer;}
  .vdd-switch input{width:16px;height:16px;accent-color:#2ebd7a;cursor:pointer;}
  .vdd-del{color:var(--text3);}
  @media (min-width:761px){ .btn.vdd-kamera{display:none;} }
`;
