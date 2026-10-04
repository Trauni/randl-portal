// portal/client/src/components/pages/content/CMSShopseite.jsx
// Phase 5: CMS Shopseite – Texte, CSS, Rebuild

import React, { useState, useEffect, useRef, useCallback } from 'react';

const API = '/api';

// ──────────────────────────────────────────────
// Icons
// ──────────────────────────────────────────────
const IconSave = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
    <polyline points="17 21 17 13 7 13 7 21"/>
    <polyline points="7 3 7 8 15 8"/>
  </svg>
);
const IconCode = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="16 18 22 12 16 6"/>
    <polyline points="8 6 2 12 8 18"/>
  </svg>
);
const IconBuild = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
    <path d="M4.93 4.93a10 10 0 0 0 0 14.14"/>
  </svg>
);
const IconRefresh = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="23 4 23 10 17 10"/>
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
  </svg>
);
const IconCheck = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

// ──────────────────────────────────────────────
// Rebuild-Status Badge
// ──────────────────────────────────────────────
function BuildBadge({ status, running }) {
  const map = {
    idle:    { color: 'var(--text3)', bg: 'var(--bg3)', label: 'Bereit' },
    running: { color: '#f5a623', bg: 'rgba(245,166,35,0.12)', label: '⟳ Läuft…' },
    success: { color: 'var(--green)', bg: 'rgba(46,189,122,0.12)', label: '✓ Erfolgreich' },
    error:   { color: 'var(--red2)', bg: 'rgba(224,80,80,0.12)', label: '✗ Fehler' }
  };
  const s = map[running ? 'running' : (status || 'idle')];
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 5,
      color: s.color, background: s.bg
    }}>
      {s.label}
    </span>
  );
}

// ──────────────────────────────────────────────
// Tab 1: Texte & Beschriftungen
// ──────────────────────────────────────────────
function TabTexte() {
  const [config, setConfig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/shop-cms/config`, {
        
      });
      if (!res.ok) throw new Error('Laden fehlgeschlagen');
      setConfig(await res.json());
      setDirty(false);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const update = (key, value) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    setDirty(true);
    setSuccess(null);
  };

  const updateCat = (id, value) => {
    setConfig(prev => ({
      ...prev,
      categories: { ...prev.categories, [id]: value }
    }));
    setDirty(true);
    setSuccess(null);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API}/shop-cms/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Speichern fehlgeschlagen');
      setSuccess('Gespeichert – sofort live auf shop.randl.group');
      setDirty(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!config) return (
    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)', fontSize: 13 }}>
      Lade Konfiguration…
    </div>
  );

  const inputStyle = {
    width: '100%', padding: '8px 11px', fontSize: 13,
    background: 'var(--bg3)', border: '1px solid var(--border)',
    borderRadius: 7, color: 'var(--text1)', boxSizing: 'border-box',
    fontFamily: 'DM Sans, sans-serif'
  };
  const labelStyle = {
    display: 'block', fontSize: 12, fontWeight: 500,
    color: 'var(--text2)', marginBottom: 5
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--green)' }}>
          ✓ kein Rebuild nötig – Änderungen sind sofort live
        </span>
      </div>

      {error && (
        <div style={{ background: 'rgba(224,80,80,0.1)', border: '1px solid var(--red2)', borderRadius: 7, padding: '8px 12px', marginBottom: 14, fontSize: 13, color: 'var(--red2)' }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ background: 'rgba(46,189,122,0.1)', border: '1px solid var(--green)', borderRadius: 7, padding: '8px 12px', marginBottom: 14, fontSize: 13, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <IconCheck /> {success}
        </div>
      )}

      {/* Sektion: Allgemeine Texte */}
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 9, padding: '16px 18px', marginBottom: 16
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text1)', marginBottom: 14 }}>
          Allgemeine Texte
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Preishinweis (unter Produkten)</label>
          <input
            type="text"
            value={config.priceNotice || ''}
            onChange={e => update('priceNotice', e.target.value)}
            style={inputStyle}
            placeholder="z.B. Alle Preise sind Nettopreise zzgl. gesetzlicher MwSt."
          />
        </div>

        <div>
          <label style={labelStyle}>Login-Untertitel</label>
          <input
            type="text"
            value={config.loginSubtitle || ''}
            onChange={e => update('loginSubtitle', e.target.value)}
            style={inputStyle}
            placeholder="z.B. Gashandel - Gewerbe, Camper und Haushalter"
          />
        </div>
      </div>

      {/* Sektion: Kategorie-Labels */}
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 9, padding: '16px 18px', marginBottom: 20
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text1)', marginBottom: 14 }}>
          Kategorie-Bezeichnungen
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {['ALLE', 'HEIZUNG', 'CAMPING', 'GASTRO', 'TECHNIK'].map(id => (
            <div key={id}>
              <label style={labelStyle}>
                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--text3)' }}>{id}</span>
                {' '}→ Anzeigename
              </label>
              <input
                type="text"
                value={config.categories?.[id] || ''}
                onChange={e => updateCat(id, e.target.value)}
                style={inputStyle}
                placeholder={id}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Speichern-Button */}
      <button
        onClick={save}
        disabled={saving || !dirty}
        style={{
          padding: '9px 20px', fontSize: 13, fontWeight: 600,
          background: dirty ? 'var(--r)' : 'var(--bg3)',
          color: dirty ? '#fff' : 'var(--text3)',
          border: 'none', borderRadius: 7,
          cursor: dirty && !saving ? 'pointer' : 'not-allowed',
          display: 'flex', alignItems: 'center', gap: 8
        }}
      >
        <IconSave />
        {saving ? 'Speichere…' : dirty ? 'Änderungen speichern' : 'Keine Änderungen'}
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────
// Einfacher CSS-Editor (kein externes CodeMirror nötig)
// ──────────────────────────────────────────────
function SimpleCodeEditor({ value, onChange }) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      spellCheck={false}
      style={{
        width: '100%',
        height: 460,
        padding: '12px 14px',
        fontSize: 12,
        lineHeight: 1.6,
        fontFamily: 'DM Mono, Consolas, Monaco, monospace',
        background: '#0d1117',
        color: '#e6edf3',
        border: '1px solid var(--border)',
        borderRadius: 8,
        resize: 'vertical',
        boxSizing: 'border-box',
        outline: 'none',
        tabSize: 2
      }}
      onKeyDown={(e) => {
        // Tab-Support
        if (e.key === 'Tab') {
          e.preventDefault();
          const start = e.target.selectionStart;
          const end = e.target.selectionEnd;
          const newValue = value.substring(0, start) + '  ' + value.substring(end);
          onChange(newValue);
          requestAnimationFrame(() => {
            e.target.selectionStart = e.target.selectionEnd = start + 2;
          });
        }
      }}
    />
  );
}

// ──────────────────────────────────────────────
// Tab 2: CSS anpassen
// ──────────────────────────────────────────────
function TabCSS({ onBuildStart }) {
  const [css, setCss] = useState('');
  const [originalCss, setOriginalCss] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const loadCss = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/shop-cms/css`, {
        
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'CSS laden fehlgeschlagen');
      }
      const data = await res.json();
      setCss(data.css);
      setOriginalCss(data.css);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCss(); }, [loadCss]);

  const dirty = css !== originalCss;

  const save = async () => {
    setSaving(true);
    setError(null);
    setConfirmOpen(false);
    try {
      const res = await fetch(`${API}/shop-cms/css`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ css })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Speichern fehlgeschlagen');
      setOriginalCss(css);
      setSuccess('CSS gespeichert – Rebuild läuft…');
      onBuildStart?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setCss(originalCss);
    setSuccess(null);
  };

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)', fontSize: 13 }}>
      Lade CSS aus App.jsx…
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 11, color: 'var(--amber)' }}>
          ⚠ CSS-Änderungen erfordern einen Rebuild (ca. 10–15 Sek.)
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text3)' }}>
          App.jsx → const css = `...`
        </span>
      </div>

      {error && (
        <div style={{ background: 'rgba(224,80,80,0.1)', border: '1px solid var(--red2)', borderRadius: 7, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: 'var(--red2)' }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ background: 'rgba(46,189,122,0.1)', border: '1px solid var(--green)', borderRadius: 7, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <IconCheck /> {success}
        </div>
      )}

      {/* CSS-Editor */}
      <SimpleCodeEditor value={css} onChange={v => { setCss(v); setSuccess(null); }} />

      {/* Zeilen-Info */}
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6, marginBottom: 14 }}>
        {css.split('\n').length} Zeilen · {css.length} Zeichen
        {dirty && <span style={{ color: 'var(--amber)', marginLeft: 10 }}>● nicht gespeichert</span>}
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={() => setConfirmOpen(true)}
          disabled={saving || !dirty}
          style={{
            padding: '9px 18px', fontSize: 13, fontWeight: 600,
            background: dirty ? 'var(--r)' : 'var(--bg3)',
            color: dirty ? '#fff' : 'var(--text3)',
            border: 'none', borderRadius: 7,
            cursor: dirty && !saving ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', gap: 8
          }}
        >
          <IconSave />
          {saving ? 'Speichere + Rebuild…' : 'Speichern + Rebuild'}
        </button>

        {dirty && (
          <button
            onClick={reset}
            style={{
              padding: '9px 14px', fontSize: 13,
              background: 'var(--bg2)', color: 'var(--text2)',
              border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer'
            }}
          >
            Zurücksetzen
          </button>
        )}

        <button
          onClick={loadCss}
          style={{
            padding: '9px 14px', fontSize: 13,
            background: 'var(--bg2)', color: 'var(--text2)',
            border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto'
          }}
        >
          <IconRefresh /> Neu laden
        </button>
      </div>

      {/* Confirm-Dialog */}
      {confirmOpen && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'var(--bg1)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '24px 28px', width: 400, maxWidth: '90vw'
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text1)', marginBottom: 10 }}>
              CSS speichern & Rebuild starten?
            </div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20, lineHeight: 1.6 }}>
              Dies schreibt den neuen CSS-Block in App.jsx und triggert einen Docker-Rebuild.
              Der Shop ist während des Rebuilds für ca. 10–15 Sekunden nicht erreichbar.
              Ein Backup von App.jsx wird automatisch angelegt.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmOpen(false)}
                style={{
                  padding: '8px 16px', fontSize: 13,
                  background: 'var(--bg3)', border: '1px solid var(--border)',
                  borderRadius: 7, color: 'var(--text2)', cursor: 'pointer'
                }}
              >
                Abbrechen
              </button>
              <button
                onClick={save}
                style={{
                  padding: '8px 18px', fontSize: 13, fontWeight: 600,
                  background: 'var(--r)', color: '#fff',
                  border: 'none', borderRadius: 7, cursor: 'pointer'
                }}
              >
                Ja, speichern + Rebuild
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Tab 3: Rebuild-Status
// ──────────────────────────────────────────────
function TabRebuild({ forceRefresh }) {
  const [status, setStatus] = useState(null);
  const [triggering, setTriggering] = useState(false);
  const [triggerError, setTriggerError] = useState(null);
  const intervalRef = useRef(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`${API}/shop-cms/rebuild-status`, {
        
      });
      if (res.ok) setStatus(await res.json());
    } catch (e) {
      // ignore polling errors
    }
  }, []);

  useEffect(() => {
    poll();
    intervalRef.current = setInterval(poll, 2000);
    return () => clearInterval(intervalRef.current);
  }, [poll, forceRefresh]);

  // Schnelleres Polling wenn Build läuft
  useEffect(() => {
    if (status?.running) {
      clearInterval(intervalRef.current);
      intervalRef.current = setInterval(poll, 1000);
    } else {
      clearInterval(intervalRef.current);
      intervalRef.current = setInterval(poll, 3000);
    }
    return () => clearInterval(intervalRef.current);
  }, [status?.running, poll]);

  const triggerRebuild = async () => {
    setTriggering(true);
    setTriggerError(null);
    try {
      const res = await fetch(`${API}/shop-cms/rebuild`, {
        method: 'POST',
        
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Rebuild-Start fehlgeschlagen');
      poll();
    } catch (e) {
      setTriggerError(e.message);
    } finally {
      setTriggering(false);
    }
  };

  const formatDuration = (start, end) => {
    if (!start) return null;
    const ms = (end ? new Date(end) : new Date()) - new Date(start);
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div>
      {/* Status-Karte */}
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 9, padding: '18px 20px', marginBottom: 16
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text1)' }}>Build-Status</span>
          <BuildBadge status={status?.status} running={status?.running} />
          {status?.running && (
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>
              {formatDuration(status.startTime, null)} vergangen
            </span>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
          <div>
            <span style={{ color: 'var(--text3)', fontSize: 12 }}>Letzter Build</span>
            <div style={{ color: 'var(--text1)', marginTop: 2 }}>
              {status?.lastTime
                ? new Date(status.lastTime).toLocaleString('de-DE')
                : '—'}
            </div>
          </div>
          <div>
            <span style={{ color: 'var(--text3)', fontSize: 12 }}>Dauer</span>
            <div style={{ color: 'var(--text1)', marginTop: 2 }}>
              {status?.lastTime && status?.startTime
                ? formatDuration(status.startTime, status.lastTime)
                : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Build-Output */}
      {status?.lastOutput && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 6, fontWeight: 500 }}>
            Build-Log (letzte 2000 Zeichen)
          </div>
          <pre style={{
            background: '#0d1117', color: '#e6edf3',
            padding: '12px 14px', borderRadius: 8,
            fontSize: 11, lineHeight: 1.5, fontFamily: 'DM Mono, monospace',
            overflow: 'auto', maxHeight: 300,
            border: '1px solid var(--border)', margin: 0,
            whiteSpace: 'pre-wrap', wordBreak: 'break-all'
          }}>
            {status.lastOutput}
          </pre>
        </div>
      )}

      {/* Rebuild-Button */}
      {triggerError && (
        <div style={{ background: 'rgba(224,80,80,0.1)', border: '1px solid var(--red2)', borderRadius: 7, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: 'var(--red2)' }}>
          {triggerError}
        </div>
      )}

      <button
        onClick={triggerRebuild}
        disabled={triggering || status?.running}
        style={{
          padding: '9px 18px', fontSize: 13, fontWeight: 600,
          background: (!triggering && !status?.running) ? 'var(--bg3)' : 'var(--bg3)',
          color: (!triggering && !status?.running) ? 'var(--text1)' : 'var(--text3)',
          border: `1px solid ${(!triggering && !status?.running) ? 'var(--border)' : 'var(--border)'}`,
          borderRadius: 7,
          cursor: (!triggering && !status?.running) ? 'pointer' : 'not-allowed',
          display: 'flex', alignItems: 'center', gap: 8
        }}
      >
        <IconBuild />
        {status?.running ? 'Rebuild läuft…' : triggering ? 'Starte…' : 'Manueller Rebuild'}
      </button>

      {/* Rebuild-Info */}
      <div style={{
        marginTop: 20,
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '12px 16px', fontSize: 12, color: 'var(--text2)', lineHeight: 1.7
      }}>
        <strong style={{ color: 'var(--text1)' }}>Rebuild-Befehl:</strong>
        <pre style={{
          margin: '6px 0 0', fontFamily: 'DM Mono, monospace', fontSize: 11,
          color: 'var(--text2)', background: 'none', padding: 0,
          whiteSpace: 'pre-wrap', wordBreak: 'break-all'
        }}>
          cd /srv/docker/gas-webshop && docker compose build --no-cache frontend && docker compose up -d frontend
        </pre>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Haupt-Komponente: CMSShopseite
// ──────────────────────────────────────────────
export default function CMSShopseite() {
  const [activeTab, setActiveTab] = useState('texte');
  const [buildPollKey, setBuildPollKey] = useState(0);

  const tabs = [
    { id: 'texte',   label: 'Texte & Labels',     icon: '✎', badge: null },
    { id: 'css',     label: 'CSS anpassen',        icon: '{}', badge: 'Rebuild' },
    { id: 'rebuild', label: 'Rebuild-Status',      icon: '⟳', badge: null }
  ];

  const handleBuildStart = () => {
    setActiveTab('rebuild');
    setBuildPollKey(k => k + 1);
  };

  return (
    <div style={{ padding: '0 0 40px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text1)' }}>
          CMS Shopseite
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text2)' }}>
          Texte, CSS und Build-Status für shop.randl.group
        </p>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 20,
        borderBottom: '1px solid var(--border)'
      }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '8px 16px', fontSize: 13, fontWeight: activeTab === tab.id ? 600 : 400,
              background: 'transparent', border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--r)' : '2px solid transparent',
              color: activeTab === tab.id ? 'var(--r2)' : 'var(--text2)',
              cursor: 'pointer', marginBottom: -1,
              display: 'flex', alignItems: 'center', gap: 6
            }}
          >
            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12 }}>{tab.icon}</span>
            {tab.label}
            {tab.badge && (
              <span style={{
                fontSize: 10, background: 'rgba(232,160,32,0.15)',
                color: 'var(--amber)', padding: '1px 6px', borderRadius: 4
              }}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab-Content */}
      {activeTab === 'texte' && <TabTexte />}
      {activeTab === 'css' && <TabCSS onBuildStart={handleBuildStart} />}
      {activeTab === 'rebuild' && <TabRebuild forceRefresh={buildPollKey} />}
    </div>
  );
}
