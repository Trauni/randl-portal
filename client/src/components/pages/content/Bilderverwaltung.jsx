// portal/client/src/components/pages/content/Bilderverwaltung.jsx
// Phase 5: Shop Kategorie-Kacheln + Produktbilder + Landingpage randl.group

import React, { useState, useEffect, useRef, useCallback } from 'react';
import GalerieVerwaltung from './GalerieVerwaltung';
import AktuellesBilder from './AktuellesBilder';

const API = '/api';

const CAT_IDS = ['ALLE', 'HEIZUNG', 'CAMPING', 'GASTRO', 'TECHNIK'];
const CAT_LABELS = {
  ALLE: 'Alle Produkte',
  HEIZUNG: 'Heizgase',
  CAMPING: 'Camping Gase',
  GASTRO: 'Gastro Gase',
  TECHNIK: 'Technische Gase'
};

// ──────────────────────────────────────────────
// Icons
// ──────────────────────────────────────────────
const IconUpload = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/>
    <line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
);
const IconTrash = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6M14 11v6"/>
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
);
const IconImage = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <circle cx="8.5" cy="8.5" r="1.5"/>
    <polyline points="21 15 16 10 5 21"/>
  </svg>
);
const IconRefresh = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="23 4 23 10 17 10"/>
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
  </svg>
);

// ──────────────────────────────────────────────
// Drag-and-Drop Upload Zone
// ──────────────────────────────────────────────
function DropZone({ onFile, accept = 'image/jpeg,image/png,image/webp', hint }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  }, [onFile]);

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      style={{
        border: `2px dashed ${dragging ? 'var(--r)' : 'var(--border)'}`,
        borderRadius: 8,
        padding: '20px 16px',
        textAlign: 'center',
        cursor: 'pointer',
        background: dragging ? 'rgba(184,49,31,0.06)' : 'var(--bg2)',
        transition: 'all 0.15s',
        color: 'var(--text2)',
        fontSize: 13
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={(e) => { if (e.target.files[0]) onFile(e.target.files[0]); e.target.value = ''; }}
      />
      <div style={{ marginBottom: 6, opacity: 0.5 }}><IconUpload /></div>
      <div>Datei hierher ziehen oder <span style={{ color: 'var(--r2)' }}>auswählen</span></div>
      {hint && <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text3)' }}>{hint}</div>}
    </div>
  );
}

// ──────────────────────────────────────────────
// Sektion A: Kategorie-Kacheln (shop.randl.group)
// ──────────────────────────────────────────────
function SektionKategorien({ categories, onRefresh }) {
  const [uploading, setUploading] = useState({});
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleUpload = async (catId, file) => {
    setError(null); setSuccess(null);
    setUploading(prev => ({ ...prev, [catId]: true }));
    try {
      const fd = new FormData();
      fd.append('type', 'category');
      fd.append('id', catId);
      fd.append('file', file);
      const res = await fetch(`${API}/shop-images/upload`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload fehlgeschlagen');
      setSuccess(`${catId}: Bild erfolgreich hochgeladen`);
      onRefresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(prev => ({ ...prev, [catId]: false }));
    }
  };

  const handleDelete = async (catId, filename) => {
    if (!confirm(`Hochgeladenes Bild "${filename}" entfernen? Der Shop zeigt dann wieder das Standardbild.`)) return;
    setError(null);
    try {
      const res = await fetch(`${API}/shop-images/category/${filename}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Löschen fehlgeschlagen');
      setSuccess(`${filename}: zurück auf Standardbild`);
      onRefresh();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text1)' }}>Kategorie-Kacheln</h3>
        <span style={{ fontSize: 12, color: 'var(--text3)', background: 'var(--bg3)', padding: '2px 8px', borderRadius: 4 }}>
          JPG · 640×480 px · Querformat
        </span>
        <span style={{ fontSize: 11, color: 'var(--green)', marginLeft: 'auto' }}>✓ kein Rebuild nötig</span>
      </div>
      {error && <div style={{ background: 'rgba(224,80,80,0.1)', border: '1px solid var(--red2)', borderRadius: 7, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: 'var(--red2)' }}>{error}</div>}
      {success && <div style={{ background: 'rgba(46,189,122,0.1)', border: '1px solid var(--green)', borderRadius: 7, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: 'var(--green)' }}>{success}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
        {CAT_IDS.map(id => {
          const cat = categories?.find(c => c.id === id);
          const hasImage = cat?.exists;
          const isUp = uploading[id];
          return (
            <div key={id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
              <div style={{ height: 90, background: 'var(--bg3)', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {hasImage && cat.url ? (
                  <img src={cat.url} alt={id}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => { e.target.style.display = 'none'; }} />
                ) : (
                  <div style={{ color: 'var(--text3)', textAlign: 'center' }}>
                    <IconImage /><div style={{ fontSize: 11, marginTop: 4 }}>kein Bild</div>
                  </div>
                )}
                <div style={{ position: 'absolute', top: 6, left: 6, background: hasImage ? 'rgba(46,189,122,0.85)' : 'rgba(42,45,51,0.85)', color: hasImage ? '#fff' : 'var(--text3)', fontSize: 10, fontFamily: 'DM Mono, monospace', padding: '2px 6px', borderRadius: 4 }}>{id}{cat?.custom ? ' · eigenes Bild' : hasImage ? ' · Standard' : ''}</div>
                {cat?.custom && (
                  <button onClick={() => handleDelete(id, `cat-${id}.jpg`)} title="Zurück auf Standardbild"
                    style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(224,80,80,0.85)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <IconTrash />
                  </button>
                )}
              </div>
              <div style={{ padding: '10px 10px' }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text1)', marginBottom: 8 }}>{CAT_LABELS[id]}</div>
                {isUp ? (
                  <div style={{ textAlign: 'center', padding: '8px', fontSize: 12, color: 'var(--text2)' }}>Lade hoch…</div>
                ) : (
                  <DropZone onFile={(file) => handleUpload(id, file)} hint="nur JPG" accept=".jpg,.jpeg,image/jpeg" />
                )}
                {cat?.size && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>{(cat.size / 1024).toFixed(1)} KB · {new Date(cat.mtime).toLocaleDateString('de-DE')}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Sektion B: Produktbilder (shop.randl.group)
// ──────────────────────────────────────────────
function SektionProdukte({ products, onRefresh }) {
  const [file, setFile] = useState(null);
  const [artikelnr, setArtikelnr] = useState('');
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState({});
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [search, setSearch] = useState('');

  const handleUpload = async () => {
    if (!file || !artikelnr.trim()) { setError('Bitte Datei und Artikelnummer angeben'); return; }
    setError(null); setSuccess(null); setUploading(true);
    try {
      const fd = new FormData();
      fd.append('type', 'product');
      fd.append('id', artikelnr.trim());
      fd.append('file', file);
      const res = await fetch(`${API}/shop-images/upload`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload fehlgeschlagen');
      setSuccess(`Bild für "${artikelnr}" hochgeladen`);
      setFile(null); setArtikelnr('');
      onRefresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (filename) => {
    if (!confirm(`Hochgeladenes Produktbild "${filename}" entfernen?`)) return;
    setDeleting(prev => ({ ...prev, [filename]: true }));
    try {
      const res = await fetch(`${API}/shop-images/product/${filename}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Löschen fehlgeschlagen');
      setSuccess(`${filename} entfernt`);
      onRefresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setDeleting(prev => ({ ...prev, [filename]: false }));
    }
  };

  const filteredProducts = (products || []).filter(p => !search || p.filename.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text1)' }}>Produktbilder</h3>
        <span style={{ fontSize: 12, color: 'var(--text3)', background: 'var(--bg3)', padding: '2px 8px', borderRadius: 4 }}>JPG · quadratisch · weißer Hintergrund</span>
        <span style={{ fontSize: 11, color: 'var(--green)', marginLeft: 'auto' }}>✓ kein Rebuild nötig</span>
      </div>
      {error && <div style={{ background: 'rgba(224,80,80,0.1)', border: '1px solid var(--red2)', borderRadius: 7, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: 'var(--red2)' }}>{error}</div>}
      {success && <div style={{ background: 'rgba(46,189,122,0.1)', border: '1px solid var(--green)', borderRadius: 7, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: 'var(--green)' }}>{success}</div>}

      {/* Upload */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 9, padding: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text1)', marginBottom: 12 }}>Neues Produktbild hochladen</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <DropZone onFile={setFile} hint="nur JPG · quadratisch, z. B. 400×400 px" accept=".jpg,.jpeg,image/jpeg" />
            {file && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ color: 'var(--green)' }}>✓</span>{file.name} ({(file.size / 1024).toFixed(1)} KB)</div>}
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text2)', marginBottom: 6 }}>Artikelnummer</label>
            <input type="text" value={artikelnr} onChange={e => setArtikelnr(e.target.value)} placeholder="z.B. RG-7801100"
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text1)', fontFamily: 'DM Mono, monospace', boxSizing: 'border-box' }} />
            {artikelnr && <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text3)', fontFamily: 'DM Mono, monospace' }}>→ products/{artikelnr}.jpg</div>}
          </div>
        </div>
        <button onClick={handleUpload} disabled={uploading || !file || !artikelnr.trim()}
          style={{ padding: '8px 18px', fontSize: 13, fontWeight: 600, background: (!uploading && file && artikelnr.trim()) ? 'var(--r)' : 'var(--bg3)', color: (!uploading && file && artikelnr.trim()) ? '#fff' : 'var(--text3)', border: 'none', borderRadius: 7, cursor: (!uploading && file && artikelnr.trim()) ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 8 }}>
          <IconUpload />{uploading ? 'Lade hoch…' : 'Hochladen'}
        </button>
      </div>

      {/* Liste */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 13, color: 'var(--text2)' }}>{(products || []).length} Bilder vorhanden</div>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Suchen…"
          style={{ padding: '5px 10px', fontSize: 12, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text1)', width: 180 }} />
      </div>
      {filteredProducts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text3)', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 9, fontSize: 13 }}>
          {search ? `Keine Bilder für "${search}"` : 'Noch keine Produktbilder hochgeladen'}
        </div>
      ) : (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
          {filteredProducts.map((p, i) => (
            <div key={p.filename}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', borderBottom: i < filteredProducts.length - 1 ? '1px solid var(--border)' : 'none' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div style={{ width: 40, height: 40, borderRadius: 6, background: '#fff', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid var(--border)' }}>
                <img src={p.url} alt={p.filename}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  onError={(e) => { e.target.style.display = 'none'; }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--text1)', fontFamily: 'DM Mono, monospace', fontWeight: 500 }}>{p.artikelnr}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{p.custom ? 'eigenes Bild' : 'Standard'} · {(p.size / 1024).toFixed(1)} KB · {new Date(p.mtime).toLocaleDateString('de-DE')}</div>
              </div>
              {p.custom && <button onClick={() => handleDelete(p.filename)} disabled={deleting[p.filename]}
                style={{ padding: '5px 10px', fontSize: 12, background: 'transparent', color: 'var(--red2)', border: '1px solid rgba(224,80,80,0.3)', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                <IconTrash />{deleting[p.filename] ? '…' : p.standard ? 'Zurücksetzen' : 'Entfernen'}
              </button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ──────────────────────────────────────────────
// Sektion D/E/F: Unterseiten randl.group
// ──────────────────────────────────────────────
function SektionUnterseite({ group, title, subtitle }) {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState({});
  const [msgs, setMsgs] = useState({});
  const load = () => {
    fetch(`/api/content/bilder/list?group=${group}`)
      .then(r => r.json())
      .then(d => { setImages(d); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(() => { load(); }, [group]);
  const setMsg = (id, type, text) => {
    setMsgs(prev => ({ ...prev, [id]: { type, text } }));
    setTimeout(() => setMsgs(prev => { const n = { ...prev }; delete n[id]; return n; }), 4000);
  };
  const handleUpload = async (target, file) => {
    if (!file) return;
    setUploading(prev => ({ ...prev, [target]: true }));
    const fd = new FormData();
    fd.append('target', target);
    fd.append('image', file);
    try {
      const res = await fetch('/api/content/bilder/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.ok) {
        setMsg(target, 'ok', `${data.label} aktualisiert (${data.sizeKB} KB)`);
        load();
      } else {
        setMsg(target, 'err', data.error || 'Fehler beim Upload');
      }
    } catch (e) {
      setMsg(target, 'err', e.message);
    }
    setUploading(prev => ({ ...prev, [target]: false }));
  };
  if (loading) return <div style={{ color: 'var(--text3)', padding: 32, textAlign: 'center', fontSize: 13 }}>Lädt…</div>;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text1)' }}>{title}</h3>
        {subtitle && (
          <span style={{ fontSize: 12, color: 'var(--text3)', background: 'var(--bg3)', padding: '2px 8px', borderRadius: 4 }}>
            {subtitle}
          </span>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
        {images.map(img => (
          <LandingImageCard
            key={img.id}
            img={img}
            uploading={!!uploading[img.id]}
            msg={msgs[img.id]}
            onUpload={handleUpload}
          />
        ))}
      </div>
    </div>
  );
}
// ──────────────────────────────────────────────
// Sektion C: Landingpage randl.group (original)
// ──────────────────────────────────────────────
function SektionLandingpage() {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState({});
  const [msgs, setMsgs] = useState({});

  const load = () => {
    fetch('/api/content/bilder/list?group=landingpage')
      .then(r => r.json())
      .then(d => { setImages(d); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const setMsg = (id, type, text) => {
    setMsgs(prev => ({ ...prev, [id]: { type, text } }));
    setTimeout(() => setMsgs(prev => { const n = { ...prev }; delete n[id]; return n; }), 4000);
  };

  const handleUpload = async (target, file) => {
    if (!file) return;
    setUploading(prev => ({ ...prev, [target]: true }));
    const fd = new FormData();
    fd.append('target', target);
    fd.append('image', file);
    try {
      const res = await fetch('/api/content/bilder/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.ok) {
        setMsg(target, 'ok', `${data.label} aktualisiert (${data.sizeKB} KB)`);
        load();
      } else {
        setMsg(target, 'err', data.error || 'Fehler beim Upload');
      }
    } catch (e) {
      setMsg(target, 'err', e.message);
    }
    setUploading(prev => ({ ...prev, [target]: false }));
  };

  if (loading) return <div style={{ color: 'var(--text3)', padding: 32, textAlign: 'center', fontSize: 13 }}>Lädt…</div>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text1)' }}>Karten-Bilder Landingpage</h3>
        <span style={{ fontSize: 12, color: 'var(--text3)', background: 'var(--bg3)', padding: '2px 8px', borderRadius: 4 }}>
          randl.group → wird zu WebP konvertiert (max. 1920px, Q85)
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
        {images.map(img => (
          <LandingImageCard key={img.id} img={img} uploading={!!uploading[img.id]} msg={msgs[img.id]} onUpload={handleUpload} />
        ))}
      </div>
    </div>
  );
}

function LandingImageCard({ img, uploading, msg, onUpload }) {
  const [preview, setPreview] = useState(null);
  const [filename, setFilename] = useState('Datei wählen…');
  const fileRef = useRef();

  const handleFile = e => {
    const f = e.target.files[0];
    if (!f) return;
    setFilename(f.name);
    const reader = new FileReader();
    reader.onload = ev => setPreview(ev.target.result);
    reader.readAsDataURL(f);
  };

  const handleSubmit = () => {
    const f = fileRef.current?.files[0];
    if (f) onUpload(img.id, f);
  };

  return (
    <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 9, padding: 16 }}>
      {/* Vorschau */}
      <div style={{ aspectRatio: '16/9', borderRadius: 7, overflow: 'hidden', background: 'var(--bg2)', border: '1px solid var(--border)', marginBottom: 12, position: 'relative' }}>
        {preview ? (
          <img src={preview} alt="Vorschau" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : img.exists ? (
          <img src={`${img.url}?t=${img.mtime}`} alt={img.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text3)', fontSize: 12 }}>Kein Bild vorhanden</div>
        )}
        {img.sizeKB > 0 && !preview && (
          <div style={{ position: 'absolute', bottom: 6, right: 6, background: 'rgba(0,0,0,.7)', borderRadius: 4, padding: '2px 6px', fontSize: 10, fontFamily: 'DM Mono, monospace', color: '#ccc' }}>{img.sizeKB} KB</div>
        )}
        {preview && (
          <div style={{ position: 'absolute', bottom: 6, right: 6, background: 'rgba(184,49,31,.85)', borderRadius: 4, padding: '2px 8px', fontSize: 10, color: '#fff' }}>Neue Vorschau</div>
        )}
      </div>
      {/* Info */}
      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text1)', marginBottom: 2 }}>{img.label}</div>
      <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'DM Mono, monospace', marginBottom: 10 }}>
        {img.file}
        {img.modified && <span style={{ marginLeft: 8 }}>{new Date(img.modified).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}
      </div>
      {/* Feedback */}
      {msg && (
        <div style={{ fontSize: 12, marginBottom: 10, padding: '6px 10px', borderRadius: 6, background: msg.type === 'ok' ? 'rgba(46,189,122,.12)' : 'rgba(224,80,80,.12)', color: msg.type === 'ok' ? 'var(--green)' : 'var(--red2)', border: `1px solid ${msg.type === 'ok' ? 'rgba(46,189,122,.25)' : 'rgba(224,80,80,.25)'}` }}>{msg.text}</div>
      )}
      {/* Upload */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label style={{ flex: 1, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 10px', fontSize: 12, color: filename === 'Datei wählen…' ? 'var(--text3)' : 'var(--text1)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(184,49,31,.4)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
          <span style={{ flexShrink: 0 }}>📁</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{filename}</span>
          <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.webp,.heic,.heif,image/*" style={{ display: 'none' }} onChange={handleFile} />
        </label>
        <button onClick={handleSubmit} disabled={uploading || filename === 'Datei wählen…'}
          style={{ background: uploading ? 'var(--bg3)' : filename !== 'Datei wählen…' ? 'var(--r)' : 'var(--bg3)', color: filename !== 'Datei wählen…' && !uploading ? '#fff' : 'var(--text3)', border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: uploading || filename === 'Datei wählen…' ? 'default' : 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {uploading ? 'Lädt…' : 'Hochladen'}
        </button>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 5 }}>JPEG · PNG · WebP · HEIC · max. 30 MB → wird zu WebP konvertiert</div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Haupt-Komponente: Bilderverwaltung
// ──────────────────────────────────────────────
export default function Bilderverwaltung() {
  const [activeTab, setActiveTab] = useState('kategorien');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`${API}/shop-images/list`);
      if (!res.ok) throw new Error('Laden fehlgeschlagen');
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const tabs = [
    { id: 'kategorien', label: 'Kategorie-Kacheln',          count: data?.categories?.filter(c => c.exists).length ?? null, total: 5 },
    { id: 'produkte',   label: 'Produktbilder',              count: data?.products?.length ?? null },
    { id: 'landingpage',label: 'Landingpage randl.group',    count: null },
    { id: 'zelt',       label: '🟡 Zeltverleih /zelt/',      count: null },
    { id: 'galerie',    label: '🖼️ Kundengalerie /zelt/galerie/', count: null },
    { id: 'gas',        label: '🔵 Gashandel /gas/',          count: null },
    { id: 'metall',     label: '⚙️ Metallarbeiten /metall/', count: null },
      { id: 'fotobox',   label: '📸 Fotobox /fotobox/',      count: null },
    { id: 'messe',      label: '🎪 Messe /messe/',           count: null },
    { id: 'aktuelles',  label: '📰 Aktuelles /news/',        count: null },
  ];

  return (
    <div style={{ padding: '0 0 40px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text1)' }}>Bilderverwaltung</h2>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text2)' }}>Bilder für shop.randl.group und randl.group</p>
          </div>
          <button onClick={loadData} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', fontSize: 12, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text2)', cursor: 'pointer' }}>
            <IconRefresh /> Aktualisieren
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{ padding: '8px 16px', fontSize: 13, fontWeight: activeTab === tab.id ? 600 : 400, background: 'transparent', border: 'none', borderBottom: activeTab === tab.id ? '2px solid var(--r)' : '2px solid transparent', color: activeTab === tab.id ? 'var(--r2)' : 'var(--text2)', cursor: 'pointer', marginBottom: -1, display: 'flex', alignItems: 'center', gap: 6 }}>
            {tab.label}
            {tab.count !== null && (
              <span style={{ fontSize: 11, background: 'var(--bg3)', padding: '1px 6px', borderRadius: 10, color: 'var(--text2)' }}>
                {tab.count}{tab.total ? `/${tab.total}` : ''}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'landingpage' ? (
        <SektionLandingpage />
      ) : activeTab === 'zelt' ? (
        <SektionUnterseite group="zelt"   title="Zeltverleih – Bilder"       subtitle="randl.group/zelt/ · WebP · max. 1920px" />
      ) : activeTab === 'galerie' ? (
        <GalerieVerwaltung />
      ) : activeTab === 'gas' ? (
        <SektionUnterseite group="gas"    title="Gashandel – Bilder"          subtitle="randl.group/gas/ · WebP · max. 1920px" />
      ) : activeTab === 'metall' ? (
        <SektionUnterseite group="metall" title="Metallarbeiten – Bilder"     subtitle="randl.group/metall/ · WebP · max. 1920px" />
      ) : activeTab === 'fotobox' ? (
        <SektionUnterseite group="fotobox" title="Fotobox – Bilder"        subtitle="randl.group/fotobox/ · WebP · max. 1920px" />
      ) : activeTab === 'aktuelles' ? (
        <AktuellesBilder />
      ) : activeTab === 'messe' ? (
        <SektionUnterseite group="messe" title="Hochzeitsmesse – Bilder" subtitle="randl.group/messe/ · WebP · max. 1920px" />
      ) : loading ? (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text3)', fontSize: 13 }}>Lade Bilddaten…</div>
      ) : error ? (
        <div style={{ background: 'rgba(224,80,80,0.1)', border: '1px solid var(--red2)', borderRadius: 9, padding: 16, color: 'var(--red2)', fontSize: 13 }}>Fehler: {error}</div>
      ) : (
        <>
          {activeTab === 'kategorien' && <SektionKategorien categories={data?.categories} onRefresh={loadData} />}
          {activeTab === 'produkte'   && <SektionProdukte   products={data?.products}     onRefresh={loadData} />}
        </>
      )}
    </div>
  );
}
